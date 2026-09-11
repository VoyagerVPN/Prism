import hashlib
import json
import os
import tempfile
import threading
from pathlib import Path, PurePosixPath


MAX_ITEMS = 20_000
MAX_SETTINGS_BYTES = 1_000_000


class GalleryCatalog:
    """Постоянный каталог только тех изображений, которые зарегистрировал Prism."""

    def __init__(self, path):
        self.path = Path(path)
        self._lock = threading.RLock()

    def _read(self):
        if not self.path.exists():
            return []
        data = json.loads(self.path.read_text(encoding='utf-8'))
        if not isinstance(data, dict) or not isinstance(data.get('items'), list):
            raise ValueError('Некорректный каталог галереи')
        items = data['items']
        for item in items:
            if not isinstance(item, dict):
                raise ValueError('Некорректный каталог галереи')
            if item.get('kind') not in ('art', 'grid'):
                item['kind'] = 'art'
            item.setdefault('parentId', None)
            if item['kind'] == 'grid':
                item['parentId'] = None
                item['childIds'] = [value for value in item.get('childIds', []) if isinstance(value, str)]
        return items

    def _write(self, items):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=self.path.parent, suffix='.tmp', delete=False) as file:
                temporary = Path(file.name)
                json.dump({'version': 2, 'items': items[:MAX_ITEMS]}, file, ensure_ascii=False, separators=(',', ':'))
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

    def list_items(self):
        with self._lock:
            return sorted(self._read(), key=self._sort_key, reverse=True)

    @staticmethod
    def _item_id(image):
        source = '\0'.join((image['type'], image['subfolder'], image['filename']))
        return hashlib.sha256(source.encode('utf-8')).hexdigest()[:24]

    @staticmethod
    def _sort_key(item):
        return item.get('createdAt', 0), item.get('kind') == 'grid'

    def register(self, generation):
        if not isinstance(generation, dict):
            raise ValueError('Некорректная запись генерации')
        settings = generation.get('settings', {})
        if not isinstance(settings, dict) or len(json.dumps(settings, ensure_ascii=False)) > MAX_SETTINGS_BYTES:
            raise ValueError('Некорректные или слишком большие параметры генерации')
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
        prompt_id = str(generation.get('promptId', ''))[:200]
        created_at = generation.get('createdAt', 0)
        if not isinstance(created_at, (int, float)) or created_at < 0:
            created_at = 0

        with self._lock:
            existing = {item.get('id'): item for item in self._read()}
            registered = []
            parent_id = self._item_id(grid) if grid else None
            child_ids = [self._item_id(image) for image in images]
            if grid:
                grid_item = {
                    'id': parent_id,
                    'image': grid,
                    'promptId': prompt_id,
                    'createdAt': created_at,
                    'characters': characters,
                    'favorite': bool(existing.get(parent_id, {}).get('favorite', False)),
                    'kind': 'grid',
                    'parentId': None,
                    'childIds': child_ids,
                    'settings': settings,
                }
                existing[parent_id] = grid_item
                registered.append(grid_item)
            for index, image in enumerate(images):
                item_id = child_ids[index]
                item = {
                    'id': item_id,
                    'image': image,
                    'promptId': prompt_id,
                    'createdAt': created_at,
                    'characters': characters,
                    'favorite': bool(existing.get(item_id, {}).get('favorite', False)),
                    'kind': 'art',
                    'parentId': parent_id,
                    'frameIndex': index,
                    'settings': settings,
                }
                existing[item_id] = item
                registered.append(item)
            items = sorted(existing.values(), key=self._sort_key, reverse=True)
            self._write(items)
            return registered

    def set_favorite(self, item_id, favorite):
        if not isinstance(item_id, str) or not isinstance(favorite, bool):
            raise ValueError('Некорректное изменение избранного')
        with self._lock:
            items = self._read()
            item = next((value for value in items if value.get('id') == item_id), None)
            if item is None:
                raise ValueError('Арт не найден в галерее')
            item['favorite'] = favorite
            self._write(items)
            return item
