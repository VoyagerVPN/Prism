import sys
import tempfile
import unittest
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT))


class CharacterStoreContract(unittest.TestCase):
    def test_characters_can_be_saved_and_reloaded_without_comfyui(self):
        from prism_core import CharacterStore

        cache = APP_ROOT / '.cache'
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            store = CharacterStore(Path(directory) / 'characters.json')
            initial = store.read()
            characters = {
                'Тест': {
                    'name': 'Тест',
                    'lora': 'None',
                    'strength': 1.0,
                    'appearance': 'Описание',
                    'outfits': {'Обычный': 'Куртка'},
                    'activeOutfitName': 'Обычный',
                    'outfitEnabled': True,
                }
            }

            saved = store.save(characters, initial['revision'])

            self.assertEqual(saved['characters'], characters)
            self.assertIsNotNone(saved['revision'])
            self.assertEqual(store.read(), saved)

    def test_stale_character_revision_is_reported_as_a_conflict(self):
        from prism_core import CharacterStore, RevisionConflict

        cache = APP_ROOT / '.cache'
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            store = CharacterStore(Path(directory) / 'characters.json')
            initial_revision = store.read()['revision']
            store.save({'Первая': {'name': 'Первая'}}, initial_revision)

            with self.assertRaisesRegex(RevisionConflict, 'изменены в другой вкладке'):
                store.save({'Вторая': {'name': 'Вторая'}}, initial_revision)

    def test_invalid_character_payload_is_distinct_from_storage_failure(self):
        from prism_core import CharacterStore, InvalidDocument

        cache = APP_ROOT / '.cache'
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            store = CharacterStore(Path(directory) / 'characters.json')

            with self.assertRaisesRegex(InvalidDocument, 'не более чем 1000 персонажами'):
                store.save([], None)


class PresetStoreContract(unittest.TestCase):
    def test_presets_can_be_saved_and_reloaded_without_comfyui(self):
        from prism_core import PresetStore

        cache = APP_ROOT / '.cache'
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            store = PresetStore(Path(directory) / 'model-presets.json')
            preset = {
                'checkpoint': 'model.safetensors',
                'steps': 30,
                'cfg': 4,
                'sampler': 'er_sde',
                'scheduler': 'simple',
                'advancedToggle': True,
                'clipSkip': 1,
                'vae': 'None',
            }

            saved = store.save({'Anima': preset}, store.read()['revision'])

            self.assertEqual(saved['presets'], {'Anima': preset})
            self.assertIsNotNone(saved['revision'])
            self.assertEqual(store.read(), saved)

    def test_stale_preset_revision_is_reported_as_a_conflict(self):
        from prism_core import PresetStore, RevisionConflict

        cache = APP_ROOT / '.cache'
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            store = PresetStore(Path(directory) / 'model-presets.json')
            initial_revision = store.read()['revision']
            preset = {
                'checkpoint': 'model.safetensors', 'steps': 30, 'cfg': 4,
                'sampler': 'er_sde', 'scheduler': 'simple',
                'advancedToggle': True, 'clipSkip': 1, 'vae': 'None',
            }
            store.save({'Anima': preset}, initial_revision)

            with self.assertRaisesRegex(RevisionConflict, 'изменены в другой вкладке'):
                store.save({}, initial_revision)

    def test_invalid_preset_payload_is_reported_as_invalid_document(self):
        from prism_core import InvalidDocument, PresetStore

        cache = APP_ROOT / '.cache'
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            store = PresetStore(Path(directory) / 'model-presets.json')
            invalid = {
                'Anima': {
                    'checkpoint': 'model.safetensors', 'steps': 30, 'cfg': True,
                    'sampler': 'er_sde', 'scheduler': 'simple',
                    'advancedToggle': True, 'clipSkip': 1, 'vae': 'None',
                }
            }

            with self.assertRaisesRegex(InvalidDocument, 'некорректное значение cfg'):
                store.save(invalid, None)


if __name__ == '__main__':
    unittest.main()
