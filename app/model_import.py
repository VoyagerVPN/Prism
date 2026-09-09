"""Распознавание и сохранение safetensors без загрузки весов в видеопамять."""
import json
import os
import re
import struct
from pathlib import Path
from safetensors import safe_open

BASES = ('SD15', 'SD2', 'SDXL', 'Illustrious', 'Pony', 'Flux', 'SD3', 'Other')
CATEGORIES = ('Character', 'Style', 'Clothing', 'Pose', 'Object', 'Background', 'Utility', 'Other')
KINDS = ('loras', 'checkpoints', 'diffusion_models')
MAX_HEADER = 16 * 1024 * 1024
MAX_FILE = 32 * 1024 ** 3


def inspect_header(header, name):
    if not isinstance(header, dict) or not header or not isinstance(header.get('__metadata__', {}), dict):
        raise ValueError('Некорректный заголовок safetensors')
    metadata = header.get('__metadata__', {})
    if not all(isinstance(value, str) for value in metadata.values()):
        raise ValueError('Метаданные должны содержать строки')
    keys = [key for key in header if key != '__metadata__']
    if not keys or not all(isinstance(header[key], dict) for key in keys):
        raise ValueError('В файле нет описания весов')
    architecture = metadata.get('modelspec.architecture', '').lower()
    kind = None
    if '/lora' in architecture or any(re.search(r'lora_(down|up|a|b)|hada_w|lokr_w', key, re.I) for key in keys):
        kind = 'loras'
    elif any(key.startswith('first_stage_model.') for key in keys) and any(key.startswith('model.diffusion_model.') for key in keys):
        kind = 'checkpoints'
    elif any(key.startswith(('model.diffusion_model.', 'double_blocks.', 'transformer_blocks.')) for key in keys):
        kind = 'diffusion_models'
    source = ' '.join(metadata.get(key, '') for key in ('modelspec.architecture', 'ss_base_model_version', 'ss_sd_model_name', 'base_model')).lower()
    base = None
    for pattern, value in ((r'illustrious', 'Illustrious'), (r'pony', 'Pony'), (r'flux', 'Flux'), (r'stable-diffusion-v3|sd3', 'SD3'), (r'sdxl|stable-diffusion-xl', 'SDXL'), (r'sd_v2|stable-diffusion-v2', 'SD2'), (r'sd_v1|stable-diffusion-v1|sd.?1\.5', 'SD15')):
        if re.search(pattern, source):
            base = value
            break
    title = metadata.get('modelspec.title') or metadata.get('ss_output_name') or name
    hint = (title + ' ' + name).lower()
    suggested = 'Illustrious' if 'illustrious' in hint else 'Pony' if 'pony' in hint else None
    category_value = (metadata.get('modelspec.category') or metadata.get('category') or '').lower()
    category = next((value for value in CATEGORIES if value.lower() == category_value), None)
    if kind and kind != 'loras':
        category = 'Model'
    return {'kind': kind, 'base': base, 'suggestedBase': suggested, 'category': category,
            'title': title, 'evidence': {key: metadata[key] for key in ('modelspec.architecture', 'ss_base_model_version', 'ss_sd_model_name', 'modelspec.category', 'category') if key in metadata}}


def read_header(path):
    with Path(path).open('rb') as file:
        prefix = file.read(8)
        if len(prefix) != 8:
            raise ValueError('Файл слишком короткий')
        size = struct.unpack('<Q', prefix)[0]
        if not 2 <= size <= MAX_HEADER:
            raise ValueError('Размер заголовка safetensors недопустим')
        raw = file.read(size)
        if len(raw) != size:
            raise ValueError('Заголовок файла обрезан')
        return json.loads(raw)


def install_model(source, root, name, kind, base, category):
    if (not isinstance(name, str) or len(name) > 180 or not name.lower().endswith('.safetensors')
            or re.search(r'[<>:"/\\|?*\x00-\x1f]', name) or name.startswith('.')
            or re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])\.', name, re.I)):
        raise ValueError('Недопустимое имя файла; нужен .safetensors без пути')
    if kind not in KINDS or base not in BASES or (category not in CATEGORIES if kind == 'loras' else category != 'Model'):
        raise ValueError('Выберите тип, базовую модель и категорию')
    result = inspect_header(read_header(source), name)
    if result['kind'] and result['kind'] != kind:
        raise ValueError('Выбранный тип не совпадает со структурой весов')
    try:
        with safe_open(str(source), framework='numpy') as tensors:
            if not list(tensors.keys()):
                raise ValueError('В файле нет весов')
    except Exception as error:
        raise ValueError(f'Повреждённый safetensors: {error}') from error
    root = Path(root).resolve()
    relative = Path(category) / base / name if kind == 'loras' else Path(base) / name
    target = root / relative
    if not target.resolve().is_relative_to(root):
        raise ValueError('Путь выходит за каталог моделей')
    target.parent.mkdir(parents=True, exist_ok=True)
    # Жёсткая ссылка публикует полный файл атомарно и никогда не заменяет существующий.
    os.link(source, target)
    return {'name': relative.as_posix(), 'kind': kind, 'base': base, 'category': category, 'path': str(target)}
