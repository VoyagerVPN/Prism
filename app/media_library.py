import hashlib
import json
import os
import re
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen


MAX_IMAGE_BYTES = 32 * 1024 * 1024
CIVITAI_IMAGE_HOSTS = frozenset(('image.civitai.com', 'blobs-b2.civitai.com'))


def fetch_civitai_image(url):
    parsed = urlparse(url) if isinstance(url, str) else None
    if not parsed or parsed.scheme != 'https' or parsed.hostname != 'image.civitai.com': raise ValueError('Недопустимый адрес изображения Civitai')
    request = Request(url, headers={'User-Agent': 'Prism/1.0', 'Accept': 'image/webp,image/png,image/jpeg'})
    with urlopen(request, timeout=30) as response:
        final_url = response.geturl() if hasattr(response, 'geturl') else url
        final = urlparse(final_url)
        if final.scheme != 'https' or final.hostname not in CIVITAI_IMAGE_HOSTS: raise ValueError('Civitai перенаправил изображение на недопустимый адрес')
        data = response.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES: raise ValueError('Изображение Civitai превышает 32 МБ')
    return data


class MediaLibrary:
    """Управляемые копии изображений, назначенных сущностям Prism."""

    def __init__(self, path):
        self.path = Path(path)
        self.files = self.path.parent / 'media'
        self._lock = threading.RLock()

    @staticmethod
    def _empty():
        return {'version': 1, 'assets': {}, 'loraCovers': {}}

    def _read(self):
        if not self.path.exists(): return self._empty()
        data = json.loads(self.path.read_text(encoding='utf-8-sig'))
        if not isinstance(data, dict) or data.get('version') != 1 or not isinstance(data.get('assets'), dict) or not isinstance(data.get('loraCovers'), dict):
            raise ValueError('Некорректный каталог изображений Prism')
        return data

    def _write(self, data):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle, temporary = tempfile.mkstemp(prefix=self.path.name + '.', suffix='.tmp', dir=self.path.parent)
        try:
            with os.fdopen(handle, 'w', encoding='utf-8') as output:
                json.dump(data, output, ensure_ascii=False, separators=(',', ':'))
                output.flush(); os.fsync(output.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)

    @staticmethod
    def _extension(data):
        if data.startswith(b'\xff\xd8\xff'): return 'jpeg'
        if data.startswith(b'\x89PNG\r\n\x1a\n'): return 'png'
        if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP': return 'webp'
        raise ValueError('Поддерживаются изображения JPEG, PNG и WebP')

    @staticmethod
    def _source(value):
        if not isinstance(value, dict) or value.get('kind') not in ('gallery', 'civitai'):
            raise ValueError('Некорректный источник изображения')
        result = {'kind': value['kind']}
        for key in ('id', 'lora'):
            item = value.get(key)
            if item is not None:
                if not isinstance(item, str) or not item or len(item) > 2048: raise ValueError('Некорректный источник изображения')
                result[key] = item
        return result

    def import_file(self, path, source):
        path = Path(path)
        if not path.is_file() or path.stat().st_size > MAX_IMAGE_BYTES: raise ValueError('Изображение отсутствует или превышает 32 МБ')
        with path.open('rb') as image:
            data = image.read(MAX_IMAGE_BYTES + 1)
        return self.import_bytes(data, source)

    def import_bytes(self, data, source):
        if not isinstance(data, bytes) or not data or len(data) > MAX_IMAGE_BYTES: raise ValueError('Изображение отсутствует или превышает 32 МБ')
        extension = self._extension(data); source = self._source(source)
        media_id = hashlib.sha256(data).hexdigest(); filename = f'{media_id}.{extension}'
        with self._lock:
            self.files.mkdir(parents=True, exist_ok=True)
            target = self.files / filename
            if not target.exists():
                temporary = target.with_suffix(target.suffix + '.tmp')
                temporary.write_bytes(data); os.replace(temporary, target)
            catalog = self._read()
            catalog['assets'].setdefault(media_id, {'file': filename, 'source': source})
            self._write(catalog)
            return {'id': media_id, 'source': catalog['assets'][media_id]['source']}

    def path_for(self, media_id):
        if not isinstance(media_id, str) or not re.fullmatch(r'[0-9a-f]{64}', media_id): raise ValueError('Изображение не найдено')
        with self._lock:
            asset = self._read()['assets'].get(media_id)
            if not isinstance(asset, dict) or not isinstance(asset.get('file'), str): raise ValueError('Изображение не найдено')
            path = (self.files / asset['file']).resolve()
            if path.parent != self.files.resolve() or not path.is_file(): raise ValueError('Изображение не найдено')
            return path

    def set_lora_cover(self, name, media_id):
        if not isinstance(name, str) or not name or len(name) > 2048: raise ValueError('Некорректная LoRA')
        with self._lock:
            catalog = self._read()
            if media_id not in catalog['assets']: raise ValueError('Изображение не найдено')
            catalog['loraCovers'][name.replace('\\', '/')] = media_id
            self._write(catalog)
            return {'id': media_id, 'source': catalog['assets'][media_id]['source']}

    def lora_cover(self, name):
        with self._lock:
            catalog = self._read(); media_id = catalog['loraCovers'].get(name.replace('\\', '/'))
            asset = catalog['assets'].get(media_id)
            return {'id': media_id, 'source': asset['source']} if isinstance(asset, dict) else None

    def lora_covers(self):
        with self._lock:
            catalog = self._read()
            return {
                name: {'id': media_id, 'source': catalog['assets'][media_id]['source']}
                for name, media_id in catalog['loraCovers'].items()
                if isinstance(catalog['assets'].get(media_id), dict)
            }
