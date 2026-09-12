import hashlib
import json
import os
import re
import tempfile
import threading
from pathlib import Path, PurePosixPath


MAX_ITEMS = 20_000
MAX_OPERATIONS = 20_000
MAX_SETTINGS_BYTES = 1_000_000
MAX_WORKFLOW_BYTES = 1_000_000


class GalleryCatalog:
    """Постоянный журнал операций Prism и созданных ими изображений."""

    def __init__(self, path):
        self.path = Path(path)
        self._lock = threading.RLock()

    @staticmethod
    def _json_size(value):
        return len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8'))

    @staticmethod
    def _operation_kind(settings):
        value = settings.get('operation', 'txt2img')
        if value in ('generate', 'generation'):
            value = 'txt2img'
        if not isinstance(value, str) or not re.fullmatch(r'[a-z][a-z0-9-]{0,63}', value):
            raise ValueError('Некорректный тип операции')
        return value

    @staticmethod
    def _operation_id(prompt_id, created_at, item_ids):
        identity = prompt_id or '\0'.join((str(created_at), *item_ids))
        return hashlib.sha256(f'operation\0{identity}'.encode('utf-8')).hexdigest()[:24]

    @staticmethod
    def _sort_key(item):
        return item.get('createdAt', 0), item.get('kind') == 'grid'

    @staticmethod
    def _operation_sort_key(operation):
        return operation.get('createdAt', 0), operation.get('id', '')

    @staticmethod
    def _string_ids(values, field):
        if not isinstance(values, list) or len(values) > 256:
            raise ValueError(f'Некорректное поле операции: {field}')
        result = []
        for value in values:
            if not isinstance(value, str) or not value or len(value) > 200:
                raise ValueError(f'Некорректное поле операции: {field}')
            if value not in result:
                result.append(value)
        return result

    def _normalize_item(self, item):
        if not isinstance(item, dict):
            raise ValueError('Некорректный каталог галереи')
        if item.get('kind') not in ('art', 'grid'):
            item['kind'] = 'art'
        item.setdefault('parentId', None)
        if item['kind'] == 'grid':
            item['parentId'] = None
            item['childIds'] = [value for value in item.get('childIds', []) if isinstance(value, str)]
        return item

    def _normalize_operation(self, operation):
        if not isinstance(operation, dict):
            raise ValueError('Некорректный журнал операций')
        settings = operation.get('settings', {})
        workflow = operation.get('workflow')
        if not isinstance(settings, dict) or self._json_size(settings) > MAX_SETTINGS_BYTES:
            raise ValueError('Некорректные или слишком большие параметры операции')
        if workflow is not None and (not isinstance(workflow, dict) or self._json_size(workflow) > MAX_WORKFLOW_BYTES):
            raise ValueError('Некорректный или слишком большой workflow операции')
        operation_id = operation.get('id')
        prompt_id = operation.get('promptId', '')
        created_at = operation.get('createdAt', 0)
        if not isinstance(operation_id, str) or not operation_id or len(operation_id) > 200:
            raise ValueError('Некорректный идентификатор операции')
        if not isinstance(prompt_id, str) or len(prompt_id) > 200:
            raise ValueError('Некорректный prompt_id операции')
        if not isinstance(created_at, (int, float)) or created_at < 0:
            raise ValueError('Некорректное время операции')
        return {
            'id': operation_id,
            'kind': self._operation_kind({'operation': operation.get('kind', 'txt2img')}),
            'status': 'succeeded',
            'promptId': prompt_id,
            'createdAt': created_at,
            'sourceArtIds': self._string_ids(operation.get('sourceArtIds', []), 'sourceArtIds'),
            'outputArtIds': self._string_ids(operation.get('outputArtIds', []), 'outputArtIds'),
            'gridArtId': operation.get('gridArtId') if isinstance(operation.get('gridArtId'), str) else None,
            'characters': self._characters(operation.get('characters', [])),
            'settings': settings,
            'workflow': workflow,
        }

    def _source_art_ids(self, settings, supplied=None):
        if supplied is not None:
            return self._string_ids(supplied, 'sourceArtIds')
        source = settings.get('sourceImage')
        if not source:
            return []
        return [self._item_id(self._image(source))]

    def _legacy_operations(self, items):
        groups = {}
        for item in items:
            prompt_id = item.get('promptId', '') if isinstance(item.get('promptId', ''), str) else ''
            key = prompt_id or f"legacy:{item.get('id', '')}"
            groups.setdefault(key, []).append(item)
        operations = []
        for group in groups.values():
            first = group[0]
            settings = first.get('settings', {}) if isinstance(first.get('settings', {}), dict) else {}
            prompt_id = first.get('promptId', '') if isinstance(first.get('promptId', ''), str) else ''
            created_at = first.get('createdAt', 0)
            if not isinstance(created_at, (int, float)) or created_at < 0:
                created_at = 0
            ids = [item.get('id') for item in group if isinstance(item.get('id'), str) and item.get('id')]
            operation_id = self._operation_id(prompt_id, created_at, ids)
            for item in group:
                item['operationId'] = operation_id
            grid = next((item for item in group if item.get('kind') == 'grid'), None)
            output_ids = [item['id'] for item in group if item.get('kind') == 'art' and isinstance(item.get('id'), str)]
            operation = {
                'id': operation_id,
                'kind': self._operation_kind(settings),
                'status': 'succeeded',
                'promptId': prompt_id,
                'createdAt': created_at,
                'sourceArtIds': self._source_art_ids(settings),
                'outputArtIds': output_ids,
                'gridArtId': grid.get('id') if grid else None,
                'characters': self._characters(first.get('characters', [])),
                'settings': settings,
                'workflow': first.get('workflow') if isinstance(first.get('workflow'), dict) else None,
            }
            operations.append(operation)
        return operations

    def _read(self):
        if not self.path.exists():
            return {'items': [], 'operations': []}
        data = json.loads(self.path.read_text(encoding='utf-8'))
        if not isinstance(data, dict) or not isinstance(data.get('items'), list):
            raise ValueError('Некорректный каталог галереи')
        items = [self._normalize_item(item) for item in data['items']]
        stored_operations = data.get('operations')
        if stored_operations is None:
            operations = self._legacy_operations(items)
        elif not isinstance(stored_operations, list):
            raise ValueError('Некорректный журнал операций')
        else:
            operations = [self._normalize_operation(operation) for operation in stored_operations]
        operation_by_prompt = {operation['promptId']: operation['id'] for operation in operations if operation['promptId']}
        for item in items:
            if not isinstance(item.get('operationId'), str):
                item['operationId'] = operation_by_prompt.get(item.get('promptId', ''))
            for duplicated in ('promptId', 'characters', 'settings', 'workflow'):
                item.pop(duplicated, None)
        return {'items': items, 'operations': operations}

    def _write(self, catalog):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        document = {
            'version': 3,
            'operations': catalog['operations'][:MAX_OPERATIONS],
            'items': catalog['items'][:MAX_ITEMS],
        }
        try:
            with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=self.path.parent, suffix='.tmp', delete=False) as file:
                temporary = Path(file.name)
                json.dump(document, file, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, self.path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    @staticmethod
    def _image(value):
        if not isinstance(value, dict) or value.get('type', 'output') != 'output':
            raise ValueError('Галерея принимает только output-файлы ComfyUI')
        filename = value.get('filename')
        subfolder = value.get('subfolder', '')
        if not isinstance(filename, str) or not filename or len(filename) > 512:
            raise ValueError('Некорректное имя изображения')
        if not isinstance(subfolder, str) or len(subfolder) > 1024:
            raise ValueError('Некорректная папка изображения')
        filename_path = PurePosixPath(filename.replace('\\', '/'))
        folder_path = PurePosixPath(subfolder.replace('\\', '/'))
        if filename_path.is_absolute() or folder_path.is_absolute() or len(filename_path.parts) != 1 or '..' in folder_path.parts:
            raise ValueError('Путь изображения выходит за пределы output')
        return {'filename': filename, 'subfolder': subfolder.replace('\\', '/'), 'type': 'output'}

    @staticmethod
    def _characters(values):
        if not isinstance(values, list) or len(values) > 32:
            raise ValueError('Некорректный список персонажей')
        result = []
        seen = set()
        for value in values:
            if not isinstance(value, dict):
                raise ValueError('Некорректный персонаж')
            name = value.get('name', '')
            lora = value.get('lora', '')
            if not isinstance(name, str) or not name.strip() or len(name) > 200 or not isinstance(lora, str) or len(lora) > 1024:
                raise ValueError('Некорректный персонаж')
            key = (name.strip().casefold(), lora.replace('\\', '/').casefold())
            if key not in seen:
                seen.add(key)
                result.append({'name': name.strip(), 'lora': lora.replace('\\', '/')})
        return result

    def snapshot(self):
        with self._lock:
            catalog = self._read()
            return {
                'version': 3,
                'items': sorted(catalog['items'], key=self._sort_key, reverse=True),
                'operations': sorted(catalog['operations'], key=self._operation_sort_key, reverse=True),
            }

    def list_items(self):
        return self.snapshot()['items']

    def get_item(self, item_id):
        if not isinstance(item_id, str) or not item_id: raise ValueError('Арт не найден в галерее')
        item = next((value for value in self.snapshot()['items'] if value.get('id') == item_id), None)
        if item is None: raise ValueError('Арт не найден в галерее')
        return item

    def list_operations(self):
        return self.snapshot()['operations']

    @staticmethod
    def _item_id(image):
        source = '\0'.join((image['type'], image['subfolder'], image['filename']))
        return hashlib.sha256(source.encode('utf-8')).hexdigest()[:24]

    def register(self, generation):
        if not isinstance(generation, dict):
            raise ValueError('Некорректная запись генерации')
        settings = generation.get('settings', {})
        workflow = generation.get('workflow')
        if not isinstance(settings, dict) or self._json_size(settings) > MAX_SETTINGS_BYTES:
            raise ValueError('Некорректные или слишком большие параметры генерации')
        if workflow is not None and (not isinstance(workflow, dict) or self._json_size(workflow) > MAX_WORKFLOW_BYTES):
            raise ValueError('Некорректный или слишком большой workflow генерации')
        outputs = generation.get('outputs', [])
        if not isinstance(outputs, list) or not outputs or len(outputs) > 256:
            raise ValueError('У генерации нет изображений')
        images = [self._image(value) for value in outputs]
        grid = self._image(generation['gridOutput']) if generation.get('gridOutput') else None
        if grid:
            images = [image for image in images if image != grid]
        if not images and not grid:
            raise ValueError('У генерации нет артов')
        characters = self._characters(generation.get('characters', []))
        prompt_id = generation.get('promptId', '')
        if not isinstance(prompt_id, str) or len(prompt_id) > 200:
            raise ValueError('Некорректный prompt_id генерации')
        created_at = generation.get('createdAt', 0)
        if not isinstance(created_at, (int, float)) or created_at < 0:
            created_at = 0

        with self._lock:
            catalog = self._read()
            existing_items = {item.get('id'): item for item in catalog['items']}
            existing_operations = {operation.get('id'): operation for operation in catalog['operations']}
            registered = []
            parent_id = self._item_id(grid) if grid else None
            child_ids = [self._item_id(image) for image in images]
            operation_id = self._operation_id(prompt_id, created_at, [*child_ids, *([parent_id] if parent_id else [])])
            if grid:
                grid_item = {
                    'id': parent_id,
                    'image': grid,
                    'operationId': operation_id,
                    'createdAt': created_at,
                    'favorite': bool(existing_items.get(parent_id, {}).get('favorite', False)),
                    'kind': 'grid',
                    'parentId': None,
                    'childIds': child_ids,
                }
                existing_items[parent_id] = grid_item
                registered.append(grid_item)
            for index, image in enumerate(images):
                item_id = child_ids[index]
                item = {
                    'id': item_id,
                    'image': image,
                    'operationId': operation_id,
                    'createdAt': created_at,
                    'favorite': bool(existing_items.get(item_id, {}).get('favorite', False)),
                    'kind': 'art',
                    'parentId': parent_id,
                    'frameIndex': index,
                }
                existing_items[item_id] = item
                registered.append(item)
            operation = {
                'id': operation_id,
                'kind': self._operation_kind(settings),
                'status': 'succeeded',
                'promptId': prompt_id,
                'createdAt': created_at,
                'sourceArtIds': self._source_art_ids(settings, generation.get('sourceArtIds')),
                'outputArtIds': child_ids,
                'gridArtId': parent_id,
                'characters': characters,
                'settings': settings,
                'workflow': workflow,
            }
            existing_operations[operation_id] = operation
            catalog = {
                'items': sorted(existing_items.values(), key=self._sort_key, reverse=True),
                'operations': sorted(existing_operations.values(), key=self._operation_sort_key, reverse=True),
            }
            self._write(catalog)
            return {'items': registered, 'operation': operation}

    def set_favorite(self, item_id, favorite):
        if not isinstance(item_id, str) or not isinstance(favorite, bool):
            raise ValueError('Некорректное изменение избранного')
        with self._lock:
            catalog = self._read()
            item = next((value for value in catalog['items'] if value.get('id') == item_id), None)
            if item is None:
                raise ValueError('Арт не найден в галерее')
            item['favorite'] = favorite
            catalog['items'] = sorted(catalog['items'], key=self._sort_key, reverse=True)
            catalog['operations'] = sorted(catalog['operations'], key=self._operation_sort_key, reverse=True)
            self._write(catalog)
            return item
