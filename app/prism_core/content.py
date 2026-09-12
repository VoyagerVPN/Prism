import math
import re

from .versioned_store import VersionedJsonStore


CONTENT_TYPES = {
    'Character', 'Concept', 'Style', 'Pose', 'Clothing',
    'Object', 'Background', 'Effect', 'Processing',
}
CONTENT_ID = re.compile(r'^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9._-]*)+$')
BACKEND_KINDS = {'lora', 'prompt', 'control', 'reference', 'workflow'}


def _strings(value, label, *, allow_empty=True, limit=256):
    if (
        not isinstance(value, list)
        or len(value) > limit
        or any(
            not isinstance(item, str)
            or len(item) > 2000
            or (not allow_empty and not item.strip())
            for item in value
        )
    ):
        raise ValueError(f'{label} должен быть массивом строк')


def _recipes(value):
    _strings(value, 'Совместимые recipes', allow_empty=False, limit=32)
    if not value or len(value) != len(set(value)):
        raise ValueError('Совместимые recipes не должны быть пустыми или повторяться')


def _binding(binding):
    if not isinstance(binding, dict) or binding.get('kind') not in BACKEND_KINDS:
        raise ValueError('Некорректная backend-реализация контента')
    kind = binding['kind']
    if 'compatibleRecipes' in binding:
        _recipes(binding['compatibleRecipes'])
    if kind == 'lora':
        allowed = {'kind', 'name', 'strength', 'clipStrength', 'compatibleRecipes'}
        name = binding.get('name')
        normalized = name.replace('\\', '/') if isinstance(name, str) else ''
        if (
            set(binding) - allowed
            or not normalized
            or len(normalized) > 4096
            or re.match(r'^[a-zA-Z]:|^/', normalized)
            or any(part in ('.', '..', '') for part in normalized.split('/'))
            or any(ord(symbol) < 32 for symbol in normalized)
        ):
            raise ValueError('Некорректный путь backend-модели контента')
        for field in ('strength', 'clipStrength'):
            value = binding.get(field, binding.get('strength', 1))
            if type(value) not in (int, float) or not math.isfinite(value) or not -1 <= value <= 2:
                raise ValueError(f'Некорректный параметр {field} backend-модели')
        return
    if kind == 'prompt':
        if set(binding) - {'kind', 'positive', 'negative', 'compatibleRecipes'}:
            raise ValueError('Некорректный prompt backend контента')
        _strings(binding.get('positive', []), 'Положительный prompt binding')
        _strings(binding.get('negative', []), 'Отрицательный prompt binding')
        return
    if set(binding) - {'kind', 'name', 'parameters', 'compatibleRecipes'}:
        raise ValueError('Некорректная workflow-реализация контента')
    if not isinstance(binding.get('name'), str) or not binding['name'].strip() or len(binding['name']) > 500:
        raise ValueError('Техническая backend-реализация требует имя')
    if not isinstance(binding.get('parameters', {}), dict):
        raise ValueError('Параметры backend-реализации должны быть объектом')


class ContentStore(VersionedJsonStore):
    collection_key = 'content'
    size_error = 'Каталог контента превышает 2 МБ'
    conflict_error = 'Каталог контента изменён в другой вкладке. Обновите страницу перед сохранением.'

    @staticmethod
    def validate(content):
        if not isinstance(content, dict) or len(content) > 5000:
            raise ValueError('Ожидается объект с не более чем 5000 сущностями контента')
        for content_id, entity in content.items():
            if (
                not isinstance(content_id, str)
                or not CONTENT_ID.fullmatch(content_id)
                or not isinstance(entity, dict)
                or entity.get('id') != content_id
            ):
                raise ValueError('Content entity требует стабильный semantic ID без пути файла')
            allowed = {'id', 'type', 'name', 'scopes', 'compatibleRecipes', 'bindings'}
            content_type = entity.get('type')
            if set(entity) - allowed or content_type not in CONTENT_TYPES or not content_id.startswith(content_type.lower() + ':'):
                raise ValueError(f'{content_id}: некорректный тип или состав content entity')
            if not isinstance(entity.get('name'), str) or not entity['name'].strip() or len(entity['name']) > 500:
                raise ValueError(f'{content_id}: content entity требует отображаемое имя')
            scopes = entity.get('scopes')
            if (
                not isinstance(scopes, list)
                or not scopes
                or len(scopes) != len(set(scopes))
                or any(scope not in ('global', 'subject') for scope in scopes)
            ):
                raise ValueError(f'{content_id}: некорректная область применения')
            if 'compatibleRecipes' in entity:
                _recipes(entity['compatibleRecipes'])
            bindings = entity.get('bindings')
            if not isinstance(bindings, list) or not bindings or len(bindings) > 64:
                raise ValueError(f'{content_id}: content entity требует backend binding')
            for binding in bindings:
                _binding(binding)
