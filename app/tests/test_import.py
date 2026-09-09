import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from model_import import inspect_header
import model_import


class ImportChecks(unittest.TestCase):
    def test_metadata_requires_category_and_does_not_promote_title_to_fact(self):
        header = {'__metadata__': {'modelspec.architecture': 'stable-diffusion-xl-v1-base/lora', 'modelspec.title': 'MarcelineIllustrious'}, 'lora_unet_x.lora_down.weight': {'dtype': 'F32', 'shape': [1], 'data_offsets': [0, 4]}}
        result = inspect_header(header, 'Marceline.safetensors')
        self.assertEqual(result['kind'], 'loras')
        self.assertEqual(result['base'], 'SDXL')
        self.assertEqual(result['suggestedBase'], 'Illustrious')
        self.assertIsNone(result['category'])

    def test_install_validates_and_never_overwrites(self):
        cache = Path(__file__).resolve().parents[1] / '.cache'
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            root = Path(directory)
            source = root / 'upload.part'
            header = {'lora_x.lora_down.weight': {'dtype': 'F32', 'shape': [1], 'data_offsets': [0, 4]}}
            raw = json.dumps(header).encode()
            source.write_bytes(struct.pack('<Q', len(raw)) + raw + b'\0' * 4)
            result = model_import.install_model(source, root, 'test.safetensors', 'loras', 'Illustrious', 'Character')
            target = root / 'Character/Illustrious/test.safetensors'
            self.assertEqual(result['name'], 'Character/Illustrious/test.safetensors')
            self.assertEqual(target.read_bytes(), source.read_bytes())
            with self.assertRaises(FileExistsError):
                model_import.install_model(source, root, 'test.safetensors', 'loras', 'Illustrious', 'Character')
            for filename in ('../test.safetensors', 'a\\test.safetensors', 'test.exe', 'CON.safetensors'):
                with self.assertRaises(ValueError):
                    model_import.install_model(source, root, filename, 'loras', 'SDXL', 'Character')
            source.write_bytes(b'broken')
            with self.assertRaises(ValueError):
                model_import.install_model(source, root, 'broken.safetensors', 'loras', 'SDXL', 'Character')


if __name__ == '__main__':
    unittest.main()

