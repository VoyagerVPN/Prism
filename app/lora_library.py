import hashlib
import html
import json
import os
import re
import tempfile
import threading
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError

CACHE = Path(__file__).resolve().parent / '.cache' / 'civitai'
CATEGORY_PATH = Path(__file__).resolve().parent / 'data' / 'library-categories.json'
_category_lock = threading.Lock()

def read_categories():
    if not CATEGORY_PATH.exists(): return {}
    if CATEGORY_PATH.stat().st_size > 2 * 1024 * 1024: raise ValueError('Файл категорий больше 2 МБ')
    values = json.loads(CATEGORY_PATH.read_text(encoding='utf-8'))
    if (not isinstance(values, dict) or len(values) > 10000
            or not all(isinstance(name, str) and isinstance(category, str) and category for name, category in values.items())):
        raise ValueError('Некорректный файл категорий библиотеки')
    return values

def save_category(name, category):
    # Назначение хранится отдельно от весов: пути в персонажах, промптах и истории остаются действительными.
    with _category_lock:
        values = read_categories(); key = name.replace('\\', '/')
        if key not in values and len(values) >= 10000: raise ValueError('В библиотеке уже сохранено 10000 категорий')
        values[key] = category
        CATEGORY_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=CATEGORY_PATH.parent, suffix='.tmp', delete=False) as file:
                temporary = Path(file.name)
                json.dump(values, file, ensure_ascii=False)
            os.replace(temporary, CATEGORY_PATH)
        finally:
            if temporary is not None: temporary.unlink(missing_ok=True)

class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if tag in ('p', 'br', 'li', 'h1', 'h2', 'h3'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.hidden = max(0, self.hidden - 1)
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)

def plain(value):
    parser = PlainText(); parser.feed(str(value or '')[:100000])
    return ''.join(parser.parts).strip()

_RICH_TAGS = {
    'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hr', 'i', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'u', 'ul',
}
_RICH_VOID_TAGS = {'br', 'hr'}
_RICH_HIDDEN_TAGS = {'iframe', 'math', 'object', 'script', 'style', 'svg', 'template'}
_CSS_NAMED_COLORS = {
    'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
    'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
    'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
    'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
    'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
    'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet',
    'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite',
    'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green',
    'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki',
    'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
    'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink',
    'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey',
    'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon',
    'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
    'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred',
    'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace',
    'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen',
    'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum',
    'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
    'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue',
    'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal',
    'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow',
    'yellowgreen',
}

def _number(value, lower, upper, percent=False):
    if percent != value.endswith('%'): return False
    raw = value[:-1] if percent else value
    try: number = float(raw)
    except ValueError: return False
    return lower <= number <= upper

def _safe_color(value):
    color = value.strip()
    lowered = color.lower()
    if lowered in _CSS_NAMED_COLORS or re.fullmatch(r'#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})', color):
        return color
    match = re.fullmatch(r'(rgb|rgba)\(\s*([^)]*?)\s*\)', color, re.IGNORECASE)
    if match:
        values = [part.strip() for part in match.group(2).split(',')]
        expected = 4 if match.group(1).lower() == 'rgba' else 3
        if len(values) == expected:
            percent = values[0].endswith('%')
            channels = all(_number(part, 0, 100, True) if percent else _number(part, 0, 255) for part in values[:3])
            alpha = expected == 3 or _number(values[3], 0, 100, True) or _number(values[3], 0, 1)
            if channels and alpha: return color
    match = re.fullmatch(r'(hsl|hsla)\(\s*([^)]*?)\s*\)', color, re.IGNORECASE)
    if match:
        values = [part.strip() for part in match.group(2).split(',')]
        expected = 4 if match.group(1).lower() == 'hsla' else 3
        if (len(values) == expected and _number(values[0].removesuffix('deg'), 0, 360)
                and _number(values[1], 0, 100, True) and _number(values[2], 0, 100, True)
                and (expected == 3 or _number(values[3], 0, 100, True) or _number(values[3], 0, 1))):
            return color
    return ''

def _color_style(value):
    for declaration in str(value).split(';'):
        name, separator, color = declaration.partition(':')
        if separator and name.strip().lower() == 'color':
            safe = _safe_color(color)
            if safe: return f'color: {safe}'
    return ''

def _safe_href(value):
    href = value.strip()
    try: parsed = urlparse(href)
    except ValueError: return ''
    return href if parsed.scheme.lower() in ('http', 'https') and parsed.netloc else ''

class RichText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.open_tags = []
        self.hidden_tags = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in _RICH_HIDDEN_TAGS:
            self.hidden_tags.append(tag)
            return
        if self.hidden_tags or tag not in _RICH_TAGS: return
        safe_attrs = []
        style = next((_color_style(value) for name, value in attrs if name.lower() == 'style' and value), '')
        if style: safe_attrs.append(('style', style))
        if tag == 'a':
            href = _safe_href(next((value for name, value in attrs if name.lower() == 'href' and value), ''))
            if href:
                safe_attrs.insert(0, ('href', href))
                title = next((value for name, value in attrs if name.lower() == 'title' and value), '')
                if title: safe_attrs.append(('title', title))
                safe_attrs.extend((('target', '_blank'), ('rel', 'noopener noreferrer')))
        rendered = ''.join(f' {name}="{html.escape(value, quote=True)}"' for name, value in safe_attrs)
        self.parts.append(f'<{tag}{rendered}>')
        if tag not in _RICH_VOID_TAGS: self.open_tags.append(tag)

    def handle_startendtag(self, tag, attrs):
        if tag.lower() in _RICH_HIDDEN_TAGS: return
        self.handle_starttag(tag, attrs)
        tag = tag.lower()
        if not self.hidden_tags and tag in _RICH_TAGS and tag not in _RICH_VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.hidden_tags:
            if tag == self.hidden_tags[-1]: self.hidden_tags.pop()
            return
        if tag not in self.open_tags: return
        while self.open_tags:
            open_tag = self.open_tags.pop()
            self.parts.append(f'</{open_tag}>')
            if open_tag == tag: break

    def handle_data(self, data):
        if not self.hidden_tags: self.parts.append(html.escape(data))

    def result(self):
        while self.open_tags: self.parts.append(f'</{self.open_tags.pop()}>')
        return ''.join(self.parts).strip()

def rich(value):
    parser = RichText(); parser.feed(str(value or '')[:100000]); parser.close()
    return parser.result()

def preview_path(path):
    return next((path.with_suffix(suffix) for suffix in ('.preview.jpeg','.preview.jpg','.preview.png','.preview.webp') if path.with_suffix(suffix).is_file()), None)

def civitai_images(values):
    """Возвращает только безопасные статичные изображения CDN Civitai."""
    result = []
    seen = set()
    if not isinstance(values, list): return result
    for value in values:
        if not isinstance(value, dict) or value.get('type', 'image') != 'image': continue
        url = value.get('url', '')
        parsed = urlparse(url) if isinstance(url, str) else None
        if not parsed or parsed.scheme != 'https' or parsed.hostname != 'image.civitai.com' or url in seen: continue
        raw_id = value.get('id')
        image_id = str(raw_id) if type(raw_id) in (int, str) and str(raw_id) else hashlib.sha256(url.encode()).hexdigest()[:24]
        width = value.get('width', 0); height = value.get('height', 0); nsfw = value.get('nsfwLevel', 0)
        result.append({
            'id': image_id,
            'url': url,
            'width': width if type(width) is int and width > 0 else 0,
            'height': height if type(height) is int and height > 0 else 0,
            'nsfwLevel': nsfw if type(nsfw) is int and nsfw >= 0 else 0,
            'source': 'civitai',
        })
        seen.add(url)
    return result

def cache_path(name):
    return CACHE / (hashlib.sha256(name.encode()).hexdigest() + '.json')

def fingerprint(path):
    stat = path.stat()
    return [stat.st_size,stat.st_mtime_ns]

def read_lookup_cache(name, path):
    cached = cache_path(name)
    if not cached.exists(): return {}, 'idle', ''
    try:
        saved = json.loads(cached.read_text(encoding='utf-8'))
        metadata = saved.get('metadata')
        if saved.get('fingerprint') != fingerprint(path) or not isinstance(metadata, dict): return {}, 'idle', ''
        status = saved.get('status', 'complete' if metadata else 'idle')
        if status not in ('pending', 'complete', 'partial', 'failed'): status = 'complete' if metadata else 'idle'
        message = saved.get('warning', '')
        return metadata, status, message if isinstance(message, str) else ''
    except (OSError, ValueError, TypeError):
        return {}, 'idle', ''

def write_lookup_cache(name, path, metadata, status, warning=''):
    CACHE.mkdir(parents=True, exist_ok=True)
    target = cache_path(name)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=CACHE, suffix='.tmp', delete=False) as file:
            temporary = Path(file.name)
            json.dump({'fingerprint': fingerprint(path), 'metadata': metadata, 'status': status, 'warning': warning}, file, ensure_ascii=False)
        os.replace(temporary, target)
    finally:
        if temporary is not None: temporary.unlink(missing_ok=True)

def local_entry(name, path, header, category_overrides=None, cover=None):
    data = {}; warning = ''
    sidecar = path.with_suffix('.cm-info.json')
    if sidecar.exists():
        try:
            if sidecar.stat().st_size > 2 * 1024 * 1024: raise ValueError('Файл метаданных больше 2 МБ')
            data = json.loads(sidecar.read_text(encoding='utf-8-sig'))
            if not isinstance(data,dict): raise ValueError('Некорректный JSON')
        except (OSError, ValueError) as error: data = {}; warning = f'Не удалось прочитать метаданные: {error}'
    cached_data, metadata_status, metadata_warning = read_lookup_cache(name, path)
    data = {**data, **cached_data}
    warning = ' · '.join(value for value in (warning, metadata_warning) if value)
    model_id = data.get('ModelId'); version_id = data.get('VersionId')
    url = f'https://civitai.com/models/{model_id}?modelVersionId={version_id}' if type(model_id) is int and type(version_id) is int else ''
    images = civitai_images(data.get('Images') or data.get('images') or [])
    image = data.get('PreviewUrl','') or (images[0]['url'] if images else '')
    if not isinstance(image,str) or urlparse(image).scheme != 'https' or urlparse(image).hostname != 'image.civitai.com': image = ''
    if preview_path(path): image = '/prism/lora-preview?' + urlencode({'name':name})
    if isinstance(cover, dict) and isinstance(cover.get('url'), str): image = cover['url']
    words = data.get('TrainedWords') or header.get('triggers',[])
    parts = name.replace('\\', '/').split('/')
    assigned = read_categories() if category_overrides is None else category_overrides
    category = assigned.get('/'.join(parts), parts[0] if len(parts) > 1 else 'Other')
    raw_description = data.get('VersionDescription') or data.get('ModelDescription')
    return dict(name=name,title=str(data.get('ModelName') or path.stem),version=str(data.get('VersionName') or ''),
        category=category,
        base=str(header['base_model'] if header.get('base_source') == 'import' else data.get('BaseModel') or header.get('base_model','unknown')),author=str(data.get('AuthorUsername') or ''),
        description=plain(raw_description),descriptionHtml=rich(raw_description),triggers=[v for v in words if isinstance(v,str)] if isinstance(words,list) else [],
        tags=[v for v in data.get('Tags',[]) if isinstance(v,str)] if isinstance(data.get('Tags',[]),list) else [],
        url=url,preview=image,cover=cover,images=images,source='Civitai' if url else 'Локальный файл',warning=warning,
        metadataStatus=metadata_status,metadataMessage=metadata_warning)

def lookup(name,path):
    initial = fingerprint(path)
    previous, _, _ = read_lookup_cache(name, path)
    write_lookup_cache(name, path, previous, 'pending')
    try:
        # Полный хеш нужен только по запросу обновления, при открытии библиотеки веса не читаются.
        with path.open('rb') as file: digest = hashlib.file_digest(file,'sha256').hexdigest()
        req = Request('https://civitai.com/api/v1/model-versions/by-hash/'+digest,headers={'User-Agent':'Prism/1.0','Accept':'application/json'})
        try:
            with urlopen(req,timeout=25) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
                if len(raw) > 2 * 1024 * 1024: raise ValueError('Ответ Civitai больше 2 МБ')
                version = json.loads(raw)
        except HTTPError as error:
            if error.code == 404: raise ValueError('Этот файл не найден на Civitai. Локальные данные сохранены.') from None
            if error.code in (401,403): raise ValueError('Civitai ограничил доступ к метаданным этого файла.') from None
            raise ValueError(f'Civitai вернул HTTP {error.code}. Повторите позже.') from None
        if not isinstance(version,dict) or type(version.get('id')) is not int or type(version.get('modelId')) is not int: raise ValueError('Некорректный ответ Civitai')
        model = version.get('model') or {}
        metadata = dict(ModelId=version['modelId'],VersionId=version['id'],ModelName=model.get('name'),VersionName=version.get('name'),BaseModel=version.get('baseModel'),TrainedWords=version.get('trainedWords',[]),VersionDescription=version.get('description'))
        lookup_warning = ''
        # Версия содержит превью и триггеры, карточка модели — автора, теги и описание.
        try:
            model_req = Request(f'https://civitai.com/api/v1/models/{version["modelId"]}',headers={'User-Agent':'Prism/1.0','Accept':'application/json'})
            with urlopen(model_req,timeout=20) as response:
                raw_model = response.read(2 * 1024 * 1024 + 1)
                if len(raw_model) > 2 * 1024 * 1024: raise ValueError('Ответ карточки Civitai больше 2 МБ')
                full_model = json.loads(raw_model)
                if not isinstance(full_model,dict): raise ValueError('Некорректная карточка модели Civitai')
                metadata.update(AuthorUsername=(full_model.get('creator') or {}).get('username'),Tags=full_model.get('tags',[]),ModelDescription=full_model.get('description'))
        except (OSError, ValueError, TypeError) as error:
            lookup_warning = f'Метаданные Civitai загружены частично: {error}'
        if fingerprint(path) != initial: raise ValueError('Файл изменился во время поиска. Повторите обновление.')
        images = civitai_images(version.get('images') or [])
        metadata['Images'] = images
        metadata['PreviewUrl'] = images[0]['url'] if images else ''
        write_lookup_cache(name, path, metadata, 'partial' if lookup_warning else 'complete', lookup_warning)
    except (OSError, ValueError, TypeError) as error:
        try:
            if fingerprint(path) == initial: write_lookup_cache(name, path, previous, 'failed', f'Не удалось загрузить метаданные Civitai: {error}')
        except (OSError, ValueError, TypeError):
            pass
        raise
