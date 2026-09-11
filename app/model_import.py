"""Распознавание и сохранение safetensors без загрузки весов в видеопамять."""
import json
import os
import re
import struct
import tempfile
import threading
from pathlib import Path
from safetensors import safe_open

CATEGORIES = ('Character', 'Style', 'Clothing', 'Pose', 'Object', 'Background', 'Utility', 'Other')
KINDS = ('loras', 'checkpoints', 'diffusion_models')
MAX_HEADER = 16 * 1024 * 1024
MAX_FILE = 32 * 1024 ** 3
_bases_lock = threading.Lock()


def validate_base(value):
    if (not isinstance(value, str) or not value.strip() or len(value) > 120
            or value != value.strip() or re.search(r'[<>:"/\\|?*\x00-\x1f]', value)
            or value.endswith('.') or re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', value, re.I)):
        raise ValueError('Укажите название базы до 120 символов без символов пути и служебных имён Windows.')
    return value


def read_bases(path):
    path = Path(path)
    if not path.exists():
        return []
    values = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(values, list) or len(values) > 1000:
        raise ValueError('Некорректный список добавленных баз')
    return [validate_base(value) for value in values]


def remember_base(value, path):
    value = validate_base(value)
    path = Path(path)
    with _bases_lock:
        values = read_bases(path)
        if any(item.casefold() == value.casefold() for item in values):
            return
        values.append(value)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, suffix='.tmp', delete=False) as file:
                temporary = Path(file.name)
                json.dump(values, file, ensure_ascii=False)
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


def declared_base(metadata):
    for key in ('base_model', 'modelspec.base_model', 'ss_base_model_version'):
        value = metadata.get(key, '').strip()
        if value and value.casefold() not in ('unknown', 'none'):
            return value
    architecture = metadata.get('modelspec.architecture', '').strip()
    if architecture and architecture.casefold() not in ('unknown', 'lora', 'lycoris'):
        return re.sub(r'/(?:lora|lycoris)$', '', architecture, flags=re.I)
    checkpoint = metadata.get('ss_sd_model_name', '').replace('\\', '/').rsplit('/', 1)[-1].strip()
    return checkpoint or None


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
    base = declared_base(metadata)
    title = metadata.get('modelspec.title') or metadata.get('ss_output_name') or name
    category_value = (metadata.get('modelspec.category') or metadata.get('category') or '').lower()
    category = next((value for value in CATEGORIES if value.lower() == category_value), None)
    if kind and kind != 'loras':
        category = 'Model'
    training_model = metadata.get('ss_sd_model_name', '').replace('\\', '/').rsplit('/', 1)[-1]
    return {'kind': kind, 'base': base, 'suggestedBase': None, 'category': category,
            'title': title, 'trainingModel': training_model,
            'evidence': {key: metadata[key] for key in ('base_model', 'modelspec.base_model', 'modelspec.architecture', 'ss_base_model_version', 'ss_sd_model_name', 'modelspec.category', 'category') if key in metadata}}


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
    validate_base(base)
    if kind not in KINDS or (category not in CATEGORIES if kind == 'loras' else category != 'Model'):
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
