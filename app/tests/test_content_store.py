import sys
import tempfile
import unittest
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT))


class ContentStoreContract(unittest.TestCase):
    def test_semantic_content_can_be_saved_and_reloaded(self):
        from prism_core import ContentStore

        cache = APP_ROOT / '.cache'
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            store = ContentStore(Path(directory) / 'content.json')
            content = {
                'style:cinematic': {
                    'id': 'style:cinematic',
                    'type': 'Style',
                    'name': 'Кинематографический свет',
                    'scopes': ['global'],
                    'bindings': [
                        {
                            'kind': 'lora',
                            'name': 'Style/Illustrious/cinematic.safetensors',
                            'strength': 0.7,
                            'clipStrength': 0.5,
                            'compatibleRecipes': ['checkpoint'],
                        },
                        {
                            'kind': 'prompt',
                            'positive': ['cinematic lighting'],
                            'negative': ['flat light'],
                        },
                    ],
                }
            }

            saved = store.save(content, store.read()['revision'])

            self.assertEqual(saved['content'], content)
            self.assertIsNotNone(saved['revision'])
            self.assertEqual(store.read(), saved)

    def test_content_rejects_path_identity_and_unsafe_backend_path(self):
        from prism_core import ContentStore, InvalidDocument

        cache = APP_ROOT / '.cache'
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            store = ContentStore(Path(directory) / 'content.json')
            invalid_id = {
                'Style/file.safetensors': {
                    'id': 'Style/file.safetensors', 'type': 'Style', 'name': 'Style',
                    'scopes': ['global'], 'bindings': [{'kind': 'prompt', 'positive': ['style']}],
                }
            }
            invalid_source = {
                'style:test': {
                    'id': 'style:test', 'type': 'Style', 'name': 'Style',
                    'scopes': ['global'], 'bindings': [{'kind': 'lora', 'name': '../outside.safetensors'}],
                }
            }

            with self.assertRaisesRegex(InvalidDocument, 'semantic ID'):
                store.save(invalid_id, None)
            with self.assertRaisesRegex(InvalidDocument, 'backend'):
                store.save(invalid_source, None)

    def test_stale_content_revision_is_reported_as_a_conflict(self):
        from prism_core import ContentStore, RevisionConflict

        cache = APP_ROOT / '.cache'
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            store = ContentStore(Path(directory) / 'content.json')
            revision = store.read()['revision']
            store.save({
                'concept:first': {
                    'id': 'concept:first', 'type': 'Concept', 'name': 'Первый',
                    'scopes': ['global'], 'bindings': [{'kind': 'prompt', 'positive': ['first']}],
                }
            }, revision)

            with self.assertRaisesRegex(RevisionConflict, 'другой вкладке'):
                store.save({}, revision)


if __name__ == '__main__':
    unittest.main()
