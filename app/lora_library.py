import hashlib
import json
import os
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

def preview_path(path):
    return next((path.with_suffix(suffix) for suffix in ('.preview.jpeg','.preview.jpg','.preview.png','.preview.webp') if path.with_suffix(suffix).is_file()), None)

def cache_path(name):
    return CACHE / (hashlib.sha256(name.encode()).hexdigest() + '.json')

def fingerprint(path):
    stat = path.stat()
    return [stat.st_size,stat.st_mtime_ns]

def local_entry(name, path, header, category_overrides=None):
    data = {}; warning = ''
    sidecar = path.with_suffix('.cm-info.json')
    if sidecar.exists():
        try:
            if sidecar.stat().st_size > 2 * 1024 * 1024: raise ValueError('Файл метаданных больше 2 МБ')
            data = json.loads(sidecar.read_text(encoding='utf-8-sig'))
            if not isinstance(data,dict): raise ValueError('Некорректный JSON')
        except (OSError, ValueError) as error: data = {}; warning = f'Не удалось прочитать метаданные: {error}'
    cached = cache_path(name)
    if cached.exists():
        try:
            saved = json.loads(cached.read_text(encoding='utf-8'))
            if saved.get('fingerprint') == fingerprint(path): data = {**data, **saved['metadata']}
        except (OSError, ValueError, TypeError): pass
    model_id = data.get('ModelId'); version_id = data.get('VersionId')
    url = f'https://civitai.com/models/{model_id}?modelVersionId={version_id}' if type(model_id) is int and type(version_id) is int else ''
    image = data.get('PreviewUrl','')
    if not isinstance(image,str) or urlparse(image).scheme != 'https' or urlparse(image).hostname != 'image.civitai.com': image = ''
    if preview_path(path): image = '/prism/lora-preview?' + urlencode({'name':name})
    words = data.get('TrainedWords') or header.get('triggers',[])
    parts = name.replace('\\', '/').split('/')
    assigned = read_categories() if category_overrides is None else category_overrides
    category = assigned.get('/'.join(parts), parts[0] if len(parts) > 1 else 'Other')
    return dict(name=name,title=str(data.get('ModelName') or path.stem),version=str(data.get('VersionName') or ''),
        category=category,
        base=str(header['base_model'] if header.get('base_source') == 'import' else data.get('BaseModel') or header.get('base_model','unknown')),author=str(data.get('AuthorUsername') or ''),
        description=plain(data.get('VersionDescription') or data.get('ModelDescription')),triggers=[v for v in words if isinstance(v,str)] if isinstance(words,list) else [],
        tags=[v for v in data.get('Tags',[]) if isinstance(v,str)] if isinstance(data.get('Tags',[]),list) else [],
        url=url,preview=image,source='Civitai' if url else 'Локальный файл',warning=warning)

def lookup(name,path):
    initial = fingerprint(path)
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
    # Версия содержит превью и триггеры, карточка модели — автора, теги и описание.
    try:
        model_req = Request(f'https://civitai.com/api/v1/models/{version["modelId"]}',headers={'User-Agent':'Prism/1.0','Accept':'application/json'})
        with urlopen(model_req,timeout=20) as response:
            raw_model = response.read(2 * 1024 * 1024 + 1)
            if len(raw_model) <= 2 * 1024 * 1024:
                full_model = json.loads(raw_model)
                if isinstance(full_model,dict):
                    metadata.update(AuthorUsername=(full_model.get('creator') or {}).get('username'),Tags=full_model.get('tags',[]),ModelDescription=full_model.get('description'))
    except (OSError, ValueError, TypeError):
        pass  # Доступная версия остаётся полезна, даже если карточка модели закрыта.
    if fingerprint(path) != initial: raise ValueError('Файл изменился во время поиска. Повторите обновление.')
    images = version.get('images') or []
    image = next((i.get('url') for i in images if isinstance(i,dict) and i.get('type','image') == 'image'), '')
    metadata['PreviewUrl'] = image
    CACHE.mkdir(parents=True,exist_ok=True)
    target = cache_path(name); temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps({'fingerprint':fingerprint(path),'metadata':metadata},ensure_ascii=False),encoding='utf-8')
    os.replace(temp,target)
