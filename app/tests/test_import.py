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
    def test_anima_training_metadata_selects_base_and_keeps_training_checkpoint(self):
        header = {'__metadata__': {'ss_base_model_version': 'anima', 'modelspec.architecture': 'anima-preview/lora', 'ss_network_module': 'networks.lora_anima', 'ss_sd_model_name': 'anima-preview3-base.safetensors'}, 'lora_unet_blocks_0_cross_attn_k_proj.lora_down.weight': {'dtype': 'F32', 'shape': [32, 1024], 'data_offsets': [0, 131072]}}
        result = inspect_header(header, 'slavya.safetensors')
        self.assertEqual(result['kind'], 'loras')
        self.assertEqual(result['base'], 'anima')
        self.assertEqual(result['trainingModel'], 'anima-preview3-base.safetensors')
        self.assertIsNone(result['category'])

    def test_metadata_requires_category_and_does_not_promote_title_to_fact(self):
        header = {'__metadata__': {'modelspec.architecture': 'stable-diffusion-xl-v1-base/lora', 'modelspec.title': 'MarcelineIllustrious'}, 'lora_unet_x.lora_down.weight': {'dtype': 'F32', 'shape': [1], 'data_offsets': [0, 4]}}
        result = inspect_header(header, 'Marceline.safetensors')
        self.assertEqual(result['kind'], 'loras')
        self.assertEqual(result['base'], 'stable-diffusion-xl-v1-base')
        self.assertIsNone(result['suggestedBase'])
        self.assertIsNone(result['category'])

    def test_custom_declared_base_is_not_reclassified(self):
        header = {'__metadata__': {'base_model': 'Моя база v3', 'modelspec.architecture': 'stable-diffusion-xl-v1-base/lora'}, 'lora_x.lora_down.weight': {'dtype': 'F32', 'shape': [1], 'data_offsets': [0, 4]}}
        result = inspect_header(header, 'hero.safetensors')
        self.assertEqual(result['base'], 'Моя база v3')

    def test_missing_metadata_does_not_guess_base_from_anime_name(self):
        header = {'lora_x.lora_down.weight': {'dtype': 'F32', 'shape': [1], 'data_offsets': [0, 4]}}
        result = inspect_header(header, 'anime-style.safetensors')
        self.assertIsNone(result['base'])
        self.assertIsNone(result['suggestedBase'])

    def test_base_list_starts_empty_and_remembers_only_added_values(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]/'.cache') as directory:
            registry = Path(directory)/'import-bases.json'
            self.assertEqual(model_import.read_bases(registry), [])
            model_import.remember_base('Illustrious', registry)
            model_import.remember_base('illustrious', registry)
            model_import.remember_base('Моя база v3', registry)
            self.assertEqual(model_import.read_bases(registry), ['Illustrious', 'Моя база v3'])
            for base in ('', '..', '../outside', 'CON', 'test.', 'bad:name'):
                with self.assertRaises(ValueError):
                    model_import.validate_base(base)

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

