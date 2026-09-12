import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lora_library


class Response:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, _limit):
        return self.payload


root = Path(__file__).resolve().parents[1] / '.cache'
with tempfile.TemporaryDirectory(dir=root) as directory:
    directory = Path(directory)
    path = directory / 'test.safetensors'
    path.write_bytes(b'weights')
    version = {'id': 2, 'modelId': 1, 'name': 'v1', 'baseModel': 'Illustrious', 'trainedWords': ['hero'], 'model': {'name': 'Hero'}}
    header = {'base_model': 'Illustrious', 'base_source': 'import', 'triggers': []}
    with patch.object(lora_library, 'CACHE', directory / 'civitai'):
        with patch.object(lora_library, 'urlopen', side_effect=[Response(version), OSError('model endpoint unavailable')]):
            lora_library.lookup('Character/test.safetensors', path)
        entry = lora_library.local_entry('Character/test.safetensors', path, header)
        assert entry['metadataStatus'] == 'partial'
        assert 'частично' in entry['warning']

        with patch.object(lora_library, 'urlopen', side_effect=OSError('offline')):
            try:
                lora_library.lookup('Character/test.safetensors', path)
            except OSError:
                pass
            else:
                raise AssertionError('Сетевая ошибка должна вернуться вызывающему коду')
        entry = lora_library.local_entry('Character/test.safetensors', path, header)
        assert entry['metadataStatus'] == 'failed'
        assert 'offline' in entry['warning']

print('Persistent CivitAI complete/partial/failed state: OK')
