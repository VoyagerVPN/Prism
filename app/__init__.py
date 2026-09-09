import os
import asyncio
import struct
import json
import hashlib
import math
import tempfile
import subprocess
from pathlib import Path
from server import PromptServer
from aiohttp import web
import folder_paths
from .model_import import inspect_header, install_model, BASES, CATEGORIES, KINDS, MAX_HEADER, MAX_FILE
from . import lora_library

# Получаем путь к текущей папке плагина
dir_path = str(Path(__file__).resolve().parent)

# Получаем таблицу маршрутов ComfyUI (RouteTableDef)
routes = PromptServer.instance.routes

# Кэш метаданных LoRA: { absolute_path: (mtime, { "triggers": [words], "base_model": "sdxl"/"sd15"/... }) }
lora_metadata_cache = {}

character_path = Path(dir_path) / 'data' / 'characters.json'

def validate_characters(db):
    if not isinstance(db, dict) or len(db) > 1000:
        raise ValueError('Ожидается объект с не более чем 1000 персонажами')
    for name, char in db.items():
        if not name.strip() or name == 'none' or not isinstance(char, dict):
            raise ValueError('Некорректная запись персонажа')
        for field in ('name', 'lora', 'appearance', 'outfit', 'activeOutfitName'):
            if field in char and not isinstance(char[field], str):
                raise ValueError(f'{name}: {field} должен быть строкой')
        if 'outfits' in char and (not isinstance(char['outfits'], dict) or not all(isinstance(v, str) for v in char['outfits'].values())):
            raise ValueError(f'{name}: некорректный список одежды')
        if 'strength' in char and (type(char['strength']) not in (int, float) or not math.isfinite(char['strength'])):
            raise ValueError(f'{name}: некорректная сила LoRA')
        if 'outfitEnabled' in char and not isinstance(char['outfitEnabled'], bool):
            raise ValueError(f'{name}: некорректный переключатель одежды')

def read_characters():
    if not character_path.exists():
        return {'characters': {}, 'revision': None}
    raw = character_path.read_bytes()
    db = json.loads(raw.decode('utf-8-sig'))
    validate_characters(db)
    return {'characters': db, 'revision': hashlib.sha256(raw).hexdigest()}

@routes.get('/dashboard/characters')
async def get_characters(request):
    try:
        return web.json_response(read_characters(), headers={'Cache-Control': 'no-store'})
    except (OSError, ValueError) as error:
        return web.json_response({'error': f'Не удалось прочитать characters.json: {error}'}, status=500)

@routes.post('/dashboard/characters')
async def post_characters(request):
    try:
        body = await request.json()
        if not isinstance(body, dict) or 'revision' not in body:
            raise ValueError('Отсутствует версия данных')
        validate_characters(body.get('characters'))
        raw = json.dumps(body['characters'], ensure_ascii=False, indent=2, allow_nan=False).encode('utf-8')
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError('База персонажей превышает 2 МБ')
    except (ValueError, TypeError) as error:
        return web.json_response({'error': str(error)}, status=400)
    try:
        # Между проверкой версии и заменой файла нет await: другая вкладка не вклинится.
        current = read_characters()
        if body['revision'] != current['revision']:
            return web.json_response({'error': 'Персонажи изменены в другой вкладке. Обновите страницу перед сохранением.'}, status=409)
        character_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = character_path.with_suffix('.json.tmp')
        with temporary.open('wb') as file:
            file.write(raw)
            file.flush()
            os.fsync(file.fileno())
        if character_path.exists():
            backup_tmp = character_path.with_suffix('.json.bak.tmp')
            backup_tmp.write_bytes(character_path.read_bytes())
            os.replace(backup_tmp, character_path.with_suffix('.json.bak'))
        os.replace(temporary, character_path)
        return web.json_response(read_characters())
    except (OSError, ValueError) as error:
        return web.json_response({'error': f'Не удалось сохранить characters.json: {error}'}, status=500)

preset_path = Path(dir_path) / 'data' / 'model-presets.json'

def validate_presets(db):
    if not isinstance(db, dict) or len(db) > 1000:
        raise ValueError('Ожидается объект с не более чем 1000 пресетами')
    strings = ('checkpoint', 'sampler', 'scheduler', 'vae')
    numbers = {'steps': (10, 60), 'cfg': (0, 15), 'clipSkip': (1, 4)}
    fields = set(strings) | set(numbers) | {'advancedToggle'}
    for name, preset in db.items():
        if not name.strip() or len(name) > 200 or name == 'default' or not isinstance(preset, dict) or set(preset) != fields:
            raise ValueError('Некорректное имя или состав пресета модели')
        if any(not isinstance(preset[key], str) or not preset[key] or len(preset[key]) > 4096 for key in strings):
            raise ValueError(f'{name}: некорректное имя модели или алгоритма')
        if not isinstance(preset['advancedToggle'], bool):
            raise ValueError(f'{name}: некорректный переключатель дополнительных параметров')
        for key, (low, high) in numbers.items():
            value = preset[key]
            if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high or (key != 'cfg' and int(value) != value):
                raise ValueError(f'{name}: некорректное значение {key}')

def read_presets():
    if not preset_path.exists():
        return {'presets': {}, 'revision': None}
    raw = preset_path.read_bytes()
    db = json.loads(raw.decode('utf-8-sig'))
    validate_presets(db)
    return {'presets': db, 'revision': hashlib.sha256(raw).hexdigest()}

@routes.get('/dashboard/presets')
async def get_presets(request):
    try:
        return web.json_response(read_presets(), headers={'Cache-Control': 'no-store'})
    except (OSError, ValueError) as error:
        return web.json_response({'error': f'Не удалось прочитать model-presets.json: {error}'}, status=500)

@routes.post('/dashboard/presets')
async def post_presets(request):
    try:
        body = await request.json()
        if not isinstance(body, dict) or 'revision' not in body:
            raise ValueError('Отсутствует версия данных')
        validate_presets(body.get('presets'))
        raw = json.dumps(body['presets'], ensure_ascii=False, indent=2, allow_nan=False).encode('utf-8')
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError('База пресетов превышает 2 МБ')
    except (ValueError, TypeError) as error:
        return web.json_response({'error': str(error)}, status=400)
    try:
        # Проверка версии и атомарная замена выполняются без await, как у персонажей.
        if body['revision'] != read_presets()['revision']:
            return web.json_response({'error': 'Пресеты изменены в другой вкладке. Обновите страницу перед сохранением.'}, status=409)
        preset_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = preset_path.with_suffix('.json.tmp')
        with temporary.open('wb') as file:
            file.write(raw)
            file.flush()
            os.fsync(file.fileno())
        if preset_path.exists():
            backup = preset_path.with_suffix('.json.bak.tmp')
            backup.write_bytes(preset_path.read_bytes())
            os.replace(backup, preset_path.with_suffix('.json.bak'))
        os.replace(temporary, preset_path)
        return web.json_response(read_presets())
    except (OSError, ValueError) as error:
        return web.json_response({'error': f'Не удалось сохранить model-presets.json: {error}'}, status=500)

def get_lora_metadata(file_path):
    global lora_metadata_cache
    try:
        if not os.path.exists(file_path):
            return {"triggers": [], "base_model": "unknown"}
            
        mtime = os.path.getmtime(file_path)
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
            base_model = "unknown"
            base_ver = metadata.get('ss_base_model_version')
            if base_ver:
                base_ver_str = str(base_ver).lower()
                if "sdxl" in base_ver_str:
                    base_model = "sdxl"
                elif "sd_v1" in base_ver_str or "1.5" in base_ver_str:
                    base_model = "sd15"
                elif "pony" in base_ver_str:
                    base_model = "pony"
                elif "illustrious" in base_ver_str :
                    base_model = "illustrious"
            
            if base_model == "unknown":
                path_lower = file_path.lower()
                if "pony" in path_lower:
                    base_model = "pony"
                elif "illustrious" in path_lower :
                    base_model = "illustrious"
                elif "sdxl" in path_lower:
                    base_model = "sdxl"
                elif "sd15" in path_lower or "sd1.5" in path_lower or "v1-5" in path_lower:
                    base_model = "sd15"
                    
            data = {"triggers": sorted_triggers, "base_model": base_model}
            lora_metadata_cache[file_path] = (mtime, data)
            return data
    except Exception as e:
        print(f"[Dashboard] Ошибка парсинга метаданных LoRA {file_path}: {e}")
        return {"triggers": [], "base_model": "unknown"}

# Редирект с /dashboard (без слэша) на /dashboard/ для корректных относительных путей в браузере
@routes.get("/dashboard")
async def get_dashboard_redirect(request):
    return web.HTTPFound(location="/dashboard/")

# Эндпоинт для принудительного обновления списка моделей в ComfyUI
@routes.post("/dashboard/refresh")
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
@routes.get("/dashboard/lora_triggers")
async def get_lora_triggers(request):
    def scan():
        return {
            name.replace('\\', '/'): get_lora_metadata(folder_paths.get_full_path('loras', name))
            for name in folder_paths.get_filename_list('loras')
            if name.lower().endswith('.safetensors')
        }
    return web.json_response(await asyncio.to_thread(scan))

# Маршрут для отдачи index.html и всех остальных статических файлов (css, js)
@routes.post('/dashboard/import/analyze')
async def analyze_model_import(request):
    try:
        body = await request.json()
        if not isinstance(body, dict) or len(json.dumps(body)) > MAX_HEADER * 2:
            raise ValueError('Слишком большой или некорректный заголовок')
        result = inspect_header(body.get('header'), str(body.get('name', '')))
        return web.json_response({**result, 'bases': BASES, 'categories': CATEGORIES})
    except (ValueError, TypeError) as error:
        return web.json_response({'error': str(error)}, status=400)


@routes.post('/dashboard/import/upload')
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
            if len(raw) > 128 or not part.at_eof():
                raise ValueError('Некорректный параметр импорта')
            choices[key] = raw.decode('utf-8')
        kind = choices['kind']
        if kind not in KINDS or choices['base'] not in BASES or (choices['category'] not in CATEGORIES if kind == 'loras' else choices['category'] != 'Model'):
            raise ValueError('Уточните тип, базовую модель и категорию')
        paths = folder_paths.get_folder_paths(kind)
        preferred = {'loras': 'lora', 'checkpoints': 'stablediffusion', 'diffusion_models': 'diffusionmodels'}[kind]
        root = Path(next((path for path in paths if Path(path).name.lower() == preferred), paths[0])).resolve()
        root.mkdir(parents=True, exist_ok=True)
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


@routes.get('/dashboard/runtime')
async def get_runtime(request):
    return web.json_response({'service': 'prism', 'version': 1}, headers={'Cache-Control': 'no-store'})

def library_file(name):
    if name not in folder_paths.get_filename_list('loras'):
        raise ValueError('LoRA не найдена в зарегистрированной библиотеке')
    path = folder_paths.get_full_path('loras', name)
    if not path: raise ValueError('Файл LoRA недоступен')
    return Path(path)

@routes.get('/dashboard/lora-library')
async def get_lora_library(request):
    def scan():
        entries = []
        for name in folder_paths.get_filename_list('loras'):
            path = library_file(name)
            entries.append(lora_library.local_entry(name, path, get_lora_metadata(str(path))))
        return entries
    try:
        return web.json_response({'items': await asyncio.to_thread(scan)}, headers={'Cache-Control':'no-store'})
    except (ValueError, OSError) as error:
        return web.json_response({'error':str(error)},status=500)

@routes.get('/dashboard/lora-preview')
async def get_lora_preview(request):
    try:
        path = lora_library.preview_path(library_file(request.query.get('name','')))
        if not path: raise ValueError('Превью отсутствует')
        return web.FileResponse(path)
    except (ValueError, OSError):
        return web.Response(status=404)

@routes.get('/dashboard/lora-library/reveal')
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

@routes.post('/dashboard/lora-library/lookup')
async def lookup_lora_library(request):
    try:
        body = await request.json()
        if not isinstance(body,dict) or not isinstance(body.get('name'),str): raise ValueError('Не указано имя LoRA')
        name = body['name']; path = library_file(name)
        if library_lookup_lock.locked(): return web.json_response({'error':'Обновление уже выполняется. Повторите позже.'},status=409)
        async with library_lookup_lock:
            await asyncio.to_thread(lora_library.lookup,name,path)
        return web.json_response(lora_library.local_entry(name,path,get_lora_metadata(str(path))))
    except (ValueError, OSError, TimeoutError) as error:
        return web.json_response({'error':str(error)},status=400)

@routes.get("/dashboard/{filename:.*}")
async def get_dashboard_static(request):
    filename = request.match_info.get("filename", "")
    
    # Если запрашивается корень (/dashboard/), отдаем index.html
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

print("\n[Dashboard] Интерфейс управления успешно зарегистрирован по адресу: http://127.0.0.1:8188/dashboard/")
print("[Dashboard] Зарегистрированные пути в routes:")
for r in routes:
    if r.path.startswith("/dashboard"):
        print(f"  - {r.method} {r.path}")
print()

from .variation_noise import VariationNoise

NODE_CLASS_MAPPINGS = {'PrismVariationNoise': VariationNoise}
NODE_DISPLAY_NAME_MAPPINGS = {'PrismVariationNoise': 'Prism Variation Noise'}
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
