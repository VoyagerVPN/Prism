import os
import asyncio
import struct
import json
import tempfile
import subprocess
from pathlib import Path
from urllib.parse import urlencode
from server import PromptServer
from aiohttp import web
import folder_paths
from .model_import import inspect_header, install_model, declared_base, validate_base, read_bases, remember_base, CATEGORIES, KINDS, MAX_HEADER, MAX_FILE
from . import lora_library
from .gallery_catalog import GalleryCatalog
from .media_library import MediaLibrary, fetch_civitai_image
from .prism_core import CharacterStore, ContentStore, InvalidDocument, PresetStore, RevisionConflict
from .runtime_metrics import collect_runtime_metrics

# Получаем путь к текущей папке плагина
dir_path = str(Path(__file__).resolve().parent)

# Получаем таблицу маршрутов ComfyUI (RouteTableDef)
routes = PromptServer.instance.routes

# Кэш метаданных LoRA: { absolute_path: (mtime, { "triggers": [words], "base_model": "sdxl"/"sd15"/... }) }
lora_metadata_cache = {}

character_path = Path(dir_path) / 'data' / 'characters.json'
content_path = Path(dir_path) / 'data' / 'content.json'
import_bases_path = Path(dir_path) / 'data' / 'import-bases.json'
gallery_catalog = GalleryCatalog(Path(dir_path) / 'data' / 'gallery.json')
media_library = MediaLibrary(Path(dir_path) / 'data' / 'media.json')
_LOAD_MEDIA_COVER = object()

def read_characters():
    return CharacterStore(character_path).read()

@routes.get('/prism/characters')
async def get_characters(request):
    try:
        return web.json_response(read_characters(), headers={'Cache-Control': 'no-store'})
    except (OSError, ValueError) as error:
        return web.json_response({'error': f'Не удалось прочитать characters.json: {error}'}, status=500)

@routes.post('/prism/characters')
async def post_characters(request):
    try:
        body = await request.json()
        if not isinstance(body, dict) or 'revision' not in body:
            raise ValueError('Отсутствует версия данных')
    except (ValueError, TypeError) as error:
        return web.json_response({'error': str(error)}, status=400)
    try:
        return web.json_response(CharacterStore(character_path).save(body.get('characters'), body['revision']))
    except InvalidDocument as error:
        return web.json_response({'error': str(error)}, status=400)
    except RevisionConflict as error:
        return web.json_response({'error': str(error)}, status=409)
    except (OSError, ValueError) as error:
        return web.json_response({'error': f'Не удалось сохранить characters.json: {error}'}, status=500)


@routes.get('/prism/content')
async def get_content(request):
    try:
        return web.json_response(ContentStore(content_path).read(), headers={'Cache-Control': 'no-store'})
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return web.json_response({'error': f'Не удалось прочитать content.json: {error}'}, status=500)


@routes.post('/prism/content')
async def post_content(request):
    try:
        body = await request.json()
        if not isinstance(body, dict) or 'revision' not in body:
            raise ValueError('Отсутствует версия данных')
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return web.json_response({'error': str(error)}, status=400)
    try:
        return web.json_response(ContentStore(content_path).save(body.get('content'), body['revision']))
    except InvalidDocument as error:
        return web.json_response({'error': str(error)}, status=400)
    except RevisionConflict as error:
        return web.json_response({'error': str(error)}, status=409)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return web.json_response({'error': f'Не удалось сохранить content.json: {error}'}, status=500)

preset_path = Path(dir_path) / 'data' / 'model-presets.json'

def read_presets():
    return PresetStore(preset_path).read()

@routes.get('/prism/presets')
async def get_presets(request):
    try:
        return web.json_response(read_presets(), headers={'Cache-Control': 'no-store'})
    except (OSError, ValueError) as error:
        return web.json_response({'error': f'Не удалось прочитать model-presets.json: {error}'}, status=500)

@routes.post('/prism/presets')
async def post_presets(request):
    try:
        body = await request.json()
        if not isinstance(body, dict) or 'revision' not in body:
            raise ValueError('Отсутствует версия данных')
    except (ValueError, TypeError) as error:
        return web.json_response({'error': str(error)}, status=400)
    try:
        return web.json_response(PresetStore(preset_path).save(body.get('presets'), body['revision']))
    except InvalidDocument as error:
        return web.json_response({'error': str(error)}, status=400)
    except RevisionConflict as error:
        return web.json_response({'error': str(error)}, status=409)
    except (OSError, ValueError) as error:
        return web.json_response({'error': f'Не удалось сохранить model-presets.json: {error}'}, status=500)

def get_lora_metadata(file_path):
    global lora_metadata_cache
    try:
        if not os.path.exists(file_path):
            return {"triggers": [], "base_model": "unknown"}
            
        mtime = (os.path.getmtime(file_path), import_bases_path.stat().st_mtime_ns if import_bases_path.exists() else 0)
        if file_path in lora_metadata_cache:
            cached_mtime, cached_data = lora_metadata_cache[file_path]
            if cached_mtime == mtime:
                return cached_data
                
        # Считываем заголовок safetensors
        with open(file_path, 'rb') as f:
            header_size_bytes = f.read(8)
            if len(header_size_bytes) < 8:
                return {"triggers": [], "base_model": "unknown"}
            header_size = struct.unpack('<Q', header_size_bytes)[0]
            
            if header_size > 67108864:
                return {"triggers": [], "base_model": "unknown"}
                
            header_bytes = f.read(header_size)
            if len(header_bytes) < header_size:
                return {"triggers": [], "base_model": "unknown"}
                
            header = json.loads(header_bytes.decode('utf-8', errors='ignore'))
            metadata = header.get('__metadata__', {})
            
            # 1. Извлекаем триггерные слова
            triggers = set()
            trained_words = metadata.get('ss_trained_words')
            if trained_words:
                try:
                    parsed = json.loads(trained_words)
                    if isinstance(parsed, list):
                        for w in parsed:
                            triggers.add(str(w).strip())
                    elif isinstance(parsed, str):
                        triggers.add(parsed.strip())
                except Exception:
                    if isinstance(trained_words, str):
                        for w in trained_words.split(','):
                            triggers.add(w.strip())
                            
            clean_triggers = []
            for t in triggers:
                t_clean = t.strip().lower()
                if t_clean and len(t_clean) > 2 and not t_clean.startswith('<') and not t_clean.endswith('>'):
                    clean_triggers.append(t.strip())
            sorted_triggers = sorted(list(set(clean_triggers)))
            
            # 2. Определяем базовую модель
            # Импорт сохраняет выбранную базу в её собственный каталог; это явное назначение пользователя.
            assigned_base = next((base for base in read_bases(import_bases_path) if Path(file_path).parent.name.casefold() == base.casefold()), None)
            base_model = assigned_base or declared_base(metadata) or "unknown"
                    
            data = {"triggers": sorted_triggers, "base_model": base_model, "base_source": "import" if assigned_base else "metadata"}
            lora_metadata_cache[file_path] = (mtime, data)
            return data
    except Exception as e:
        print(f"[Dashboard] Ошибка парсинга метаданных LoRA {file_path}: {e}")
        return {"triggers": [], "base_model": "unknown"}

# Редирект с /prism (без слэша) на /prism/ для корректных относительных путей в браузере
@routes.get("/prism")
async def get_dashboard_redirect(request):
    return web.HTTPFound(location="/prism/")

# Эндпоинт для принудительного обновления списка моделей в ComfyUI
@routes.post("/prism/refresh")
async def post_dashboard_refresh(request):
    try:
        if hasattr(folder_paths, "filename_list_cache"):
            folder_paths.filename_list_cache.clear()
        print("[Dashboard] Кэш моделей ComfyUI успешно сброшен")
        return web.json_response({"status": "success"})
    except Exception as e:
        print(f"[Dashboard] Ошибка сброса кэша моделей: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)

# Эндпоинт для отдачи метаданных LoRA (триггеры и базовая модель)
@routes.get("/prism/lora_triggers")
async def get_lora_triggers(request):
    def scan():
        return {
            name.replace('\\', '/'): get_lora_metadata(folder_paths.get_full_path('loras', name))
            for name in folder_paths.get_filename_list('loras')
            if name.lower().endswith('.safetensors')
        }
    return web.json_response(await asyncio.to_thread(scan))

# Маршрут для отдачи index.html и всех остальных статических файлов (css, js)
@routes.post('/prism/import/analyze')
async def analyze_model_import(request):
    try:
        body = await request.json()
        if not isinstance(body, dict) or len(json.dumps(body)) > MAX_HEADER * 2:
            raise ValueError('Слишком большой или некорректный заголовок')
        result = inspect_header(body.get('header'), str(body.get('name', '')))
        bases = await asyncio.to_thread(read_bases, import_bases_path)
        if result['base']:
            result['base'] = next((base for base in bases if base.casefold() == result['base'].casefold()), result['base'])
        return web.json_response({**result, 'bases': bases, 'categories': CATEGORIES})
    except (ValueError, TypeError) as error:
        return web.json_response({'error': str(error)}, status=400)


@routes.post('/prism/import/upload')
async def upload_model_import(request):
    temporary = None
    try:
        reader = await request.multipart()
        choices = {}
        for key in ('kind', 'base', 'category'):
            part = await reader.next()
            if part is None or part.name != key or part.filename:
                raise ValueError('Не переданы параметры импорта')
            raw = await part.read_chunk(8192)
            if len(raw) > 512 or not part.at_eof():
                raise ValueError('Некорректный параметр импорта')
            choices[key] = raw.decode('utf-8')
        kind = choices['kind']
        validate_base(choices['base'])
        if kind not in KINDS or (choices['category'] not in CATEGORIES if kind == 'loras' else choices['category'] != 'Model'):
            raise ValueError('Уточните тип, базовую модель и категорию')
        paths = folder_paths.get_folder_paths(kind)
        preferred = {'loras': 'lora', 'checkpoints': 'stablediffusion', 'diffusion_models': 'diffusionmodels'}[kind]
        root = Path(next((path for path in paths if Path(path).name.lower() == preferred), paths[0])).resolve()
        root.mkdir(parents=True, exist_ok=True)
        part = await reader.next()
        fetch_civitai = False
        if part is not None and part.name == 'civitai' and not part.filename:
            raw = await part.read_chunk(8192)
            if raw not in (b'true', b'false') or not part.at_eof():
                raise ValueError('Некорректная настройка метаданных Civitai')
            fetch_civitai = raw == b'true'
            part = await reader.next()
        if part is None or part.name != 'file' or not part.filename:
            raise ValueError('Не передан файл')
        filename = part.filename
        total = 0
        with tempfile.NamedTemporaryFile(dir=root, prefix='.dashboard-', suffix='.part', delete=False) as file:
            temporary = Path(file.name)
            while chunk := await part.read_chunk(1024 * 1024):
                total += len(chunk)
                if total > MAX_FILE:
                    raise ValueError('Файл больше 32 ГБ')
                await asyncio.to_thread(file.write, chunk)
            file.flush()
            os.fsync(file.fileno())
        result = await asyncio.to_thread(install_model, temporary, root, filename, kind, choices['base'], choices['category'])
        warnings = []
        result['metadataUpdated'] = False
        if kind == 'loras' and fetch_civitai:
            try:
                async with library_lookup_lock:
                    await asyncio.to_thread(lora_library.lookup, result['name'], Path(result['path']))
                result['metadataUpdated'] = True
            except (OSError, ValueError, TimeoutError) as error:
                warnings.append(f'LoRA сохранена, но метаданные Civitai не загружены: {error}')
        try:
            await asyncio.to_thread(remember_base, choices['base'], import_bases_path)
        except (OSError, ValueError) as error:
            warnings.append(f'Файл сохранён, но название базы не удалось запомнить: {error}')
        if warnings:
            result['warning'] = ' · '.join(warnings)
        folder_paths.filename_list_cache.clear()
        return web.json_response(result)
    except FileExistsError:
        return web.json_response({'error': 'Такой файл уже есть в выбранной папке. Существующий файл сохранён.'}, status=409)
    except (ValueError, TypeError, AssertionError, IndexError) as error:
        return web.json_response({'error': str(error)}, status=400)
    except OSError as error:
        return web.json_response({'error': f'Не удалось сохранить файл: {error}'}, status=500)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


@routes.get('/prism/runtime')
async def get_runtime(request):
    return web.json_response({'service': 'prism', 'version': 1}, headers={'Cache-Control': 'no-store'})


@routes.get('/prism/metrics')
async def get_metrics(request):
    try:
        return web.json_response(collect_runtime_metrics(), headers={'Cache-Control': 'no-store'})
    except (ImportError, OSError, RuntimeError, AttributeError, ValueError) as error:
        return web.json_response({'error': f'Не удалось получить метрики процесса: {error}'}, status=500)


@routes.get('/prism/gallery')
async def get_gallery(request):
    try:
        return web.json_response(await asyncio.to_thread(gallery_catalog.snapshot), headers={'Cache-Control': 'no-store'})
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return web.json_response({'error': f'Не удалось прочитать галерею: {error}'}, status=500)


@routes.post('/prism/gallery')
async def post_gallery(request):
    try:
        body = await request.json()
        if not isinstance(body, dict) or len(json.dumps(body, ensure_ascii=False)) > 2_000_000:
            raise ValueError('Слишком большая или некорректная запись галереи')
        return web.json_response(await asyncio.to_thread(gallery_catalog.register, body))
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return web.json_response({'error': str(error)}, status=400)
    except OSError as error:
        return web.json_response({'error': f'Не удалось записать галерею: {error}'}, status=500)


@routes.patch('/prism/gallery/favorite')
async def patch_gallery_favorite(request):
    try:
        body = await request.json()
        if not isinstance(body, dict):
            raise ValueError('Некорректное изменение избранного')
        item = await asyncio.to_thread(gallery_catalog.set_favorite, body.get('id'), body.get('favorite'))
        return web.json_response({'item': item})
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return web.json_response({'error': str(error)}, status=400)
    except OSError as error:
        return web.json_response({'error': f'Не удалось записать избранное: {error}'}, status=500)


def gallery_image_path(art_id):
    item = gallery_catalog.get_item(art_id)
    image = item['image']; root = Path(folder_paths.get_output_directory()).resolve()
    path = (root / image.get('subfolder', '') / image['filename']).resolve()
    try: path.relative_to(root)
    except ValueError: raise ValueError('Путь изображения выходит за пределы output') from None
    if not path.is_file(): raise ValueError('Исходный арт больше недоступен')
    return path


def public_media(media):
    return {**media, 'url': '/prism/media?' + urlencode({'id': media['id']})} if media else None


@routes.get('/prism/media')
async def get_media(request):
    try:
        return web.FileResponse(await asyncio.to_thread(media_library.path_for, request.query.get('id', '')))
    except (ValueError, OSError, json.JSONDecodeError):
        return web.Response(status=404)


@routes.post('/prism/media/assign')
async def assign_media(request):
    try:
        body = await request.json(); source = body.get('source') if isinstance(body, dict) else None; target = body.get('target') if isinstance(body, dict) else None
        if not isinstance(source, dict) or source.get('kind') not in ('gallery', 'civitai') or not isinstance(target, dict) or target.get('kind') not in ('character', 'lora'): raise ValueError('Некорректное назначение изображения')
        target_name = target.get('name')
        if not isinstance(target_name, str) or not target_name: raise ValueError('Выберите цель изображения')
        store = document = None
        if target['kind'] == 'character':
            if 'revision' not in body: raise ValueError('Отсутствует версия данных персонажей')
            store = CharacterStore(character_path); document = await asyncio.to_thread(store.read)
            if body['revision'] != document['revision']: raise RevisionConflict(store.conflict_error)
            if target_name not in document['characters']: raise ValueError('Персонаж не найден')
        else:
            library_file(target_name)
            if source['kind'] == 'civitai' and source.get('lora', '').replace('\\', '/') != target_name.replace('\\', '/'): raise ValueError('Изображение Civitai принадлежит другой LoRA')
        if source['kind'] == 'gallery':
            art_id = source.get('id')
            media = await asyncio.to_thread(media_library.import_file, gallery_image_path(art_id), {'kind': 'gallery', 'id': art_id})
        else:
            source_lora = source.get('lora'); image_id = source.get('id')
            if not isinstance(source_lora, str) or not isinstance(image_id, str): raise ValueError('Некорректное изображение Civitai')
            source_path = library_file(source_lora)
            source_entry = library_entry(source_lora, source_path)
            image = next((value for value in source_entry['images'] if value['id'] == image_id), None)
            if not image: raise ValueError('Изображение отсутствует в метаданных этой LoRA')
            data = await asyncio.to_thread(fetch_civitai_image, image['url'])
            media = await asyncio.to_thread(media_library.import_bytes, data, {'kind': 'civitai', 'id': image_id, 'lora': source_lora})
        if target['kind'] == 'lora':
            await asyncio.to_thread(media_library.set_lora_cover, target_name, media['id'])
            path = library_file(target_name)
            return web.json_response({'media': public_media(media), 'item': library_entry(target_name, path)})
        characters = {key: dict(value) for key, value in document['characters'].items()}
        characters[target_name]['portrait'] = media
        saved = await asyncio.to_thread(store.save, characters, body['revision'])
        return web.json_response({**saved, 'media': public_media(media)})
    except RevisionConflict as error:
        return web.json_response({'error': str(error)}, status=409)
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return web.json_response({'error': str(error)}, status=400)
    except OSError as error:
        return web.json_response({'error': f'Не удалось сохранить изображение: {error}'}, status=500)

def library_file(name):
    if name not in folder_paths.get_filename_list('loras'):
        raise ValueError('LoRA не найдена в зарегистрированной библиотеке')
    path = folder_paths.get_full_path('loras', name)
    if not path: raise ValueError('Файл LoRA недоступен')
    return Path(path)

def library_entry(name, path, header=None, categories=None, cover=_LOAD_MEDIA_COVER):
    if cover is _LOAD_MEDIA_COVER:
        cover = public_media(media_library.lora_cover(name))
    return lora_library.local_entry(name, path, get_lora_metadata(str(path)) if header is None else header, categories, cover)

@routes.get('/prism/lora-library')
async def get_lora_library(request):
    def scan():
        entries = []
        categories = lora_library.read_categories()
        covers = media_library.lora_covers()
        for name in folder_paths.get_filename_list('loras'):
            path = library_file(name)
            entries.append(library_entry(name, path, categories=categories, cover=public_media(covers.get(name.replace('\\', '/')))))
        return entries
    try:
        return web.json_response({'items': await asyncio.to_thread(scan)}, headers={'Cache-Control':'no-store'})
    except (ValueError, OSError) as error:
        return web.json_response({'error':str(error)},status=500)

@routes.post('/prism/lora-library/category')
async def set_lora_category(request):
    try:
        body = await request.json()
        if not isinstance(body, dict) or not isinstance(body.get('name'), str) or body.get('category') not in (*CATEGORIES, 'Concept'):
            raise ValueError('Выберите категорию LoRA')
        name = body['name']; path = library_file(name)
        await asyncio.to_thread(lora_library.save_category, name, body['category'])
        entry = await asyncio.to_thread(library_entry, name, path)
        return web.json_response(entry)
    except (ValueError, OSError) as error:
        return web.json_response({'error':str(error)},status=400)

@routes.get('/prism/lora-preview')
async def get_lora_preview(request):
    try:
        path = lora_library.preview_path(library_file(request.query.get('name','')))
        if not path: raise ValueError('Превью отсутствует')
        return web.FileResponse(path)
    except (ValueError, OSError):
        return web.Response(status=404)

@routes.get('/prism/lora-library/reveal')
async def reveal_lora_file(request):
    try:
        name = request.query.get('name','')
        if not name: raise ValueError('Не указано имя LoRA')
        path = library_file(name)
        subprocess.Popen(['explorer.exe',f'/select,{path}'])
        return web.Response(status=204)
    except (ValueError, OSError) as error:
        return web.json_response({'error':str(error)},status=400)

# ponytail: один запрос Civitai за раз; очередь по файлам нужна только для массового обновления.
library_lookup_lock = asyncio.Lock()

@routes.post('/prism/lora-library/lookup')
async def lookup_lora_library(request):
    try:
        body = await request.json()
        if not isinstance(body,dict) or not isinstance(body.get('name'),str): raise ValueError('Не указано имя LoRA')
        name = body['name']; path = library_file(name)
        if library_lookup_lock.locked(): return web.json_response({'error':'Обновление уже выполняется. Повторите позже.'},status=409)
        async with library_lookup_lock:
            await asyncio.to_thread(lora_library.lookup,name,path)
        return web.json_response(library_entry(name,path))
    except (ValueError, OSError, TimeoutError) as error:
        return web.json_response({'error':str(error)},status=400)

@routes.get("/prism/{filename:.*}")
async def get_dashboard_static(request):
    filename = request.match_info.get("filename", "")
    
    # Если запрашивается корень (/prism/), отдаем index.html
    if not filename or filename == "/":
        file_to_send = "index.html"
    else:
        file_to_send = filename

    # Раздаём только публичные файлы верхнего уровня, без .git, кэшей и скриптов.
    clean_path = os.path.normpath(file_to_send)
    if clean_path != os.path.basename(clean_path) or os.path.splitext(clean_path)[1] not in {'.html', '.css', '.js', '.ico', '.svg', '.png'}:
        return web.Response(status=404, text="File Not Found")

    file_path = os.path.join(dir_path, clean_path)
    
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return web.FileResponse(file_path)
    
    return web.Response(status=404, text="File Not Found")

print("\n[Prism] Интерфейс управления успешно зарегистрирован по адресу: http://127.0.0.1:8188/prism/")
print("[Prism] Зарегистрированные пути в routes:")
for r in routes:
    if r.path.startswith("/prism"):
        print(f"  - {r.method} {r.path}")
print()

from .variation_noise import VariationNoise
from .image_edit_nodes import PrismEditSource, PrismEditRestore

NODE_CLASS_MAPPINGS = {'PrismVariationNoise': VariationNoise, 'PrismEditSource': PrismEditSource, 'PrismEditRestore': PrismEditRestore}
NODE_DISPLAY_NAME_MAPPINGS = {'PrismVariationNoise': 'Prism Variation Noise', 'PrismEditSource': 'Prism Edit Source', 'PrismEditRestore': 'Prism Edit Restore'}
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
