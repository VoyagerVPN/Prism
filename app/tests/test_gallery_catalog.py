from pathlib import Path
import tempfile
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gallery_catalog import GalleryCatalog


class GalleryCatalogTests(unittest.TestCase):
    def test_prism_generation_is_split_into_art_cards_and_favorite_persists(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / '.cache') as directory:
            path = Path(directory) / 'gallery.json'
            catalog = GalleryCatalog(path)
            generation = {
                'promptId': 'job-1',
                'createdAt': 1234,
                'characters': [{'name': 'Алиса', 'lora': 'Character/alice.safetensors'}],
                'settings': {'positive': 'portrait', 'seed': 42},
                'outputs': [
                    {'filename': 'frame-1.png', 'subfolder': 'Prism', 'type': 'output'},
                    {'filename': 'frame-2.png', 'subfolder': 'Prism', 'type': 'output'},
                    {'filename': 'grid.png', 'subfolder': 'Prism', 'type': 'output'},
                ],
                'gridOutput': {'filename': 'grid.png', 'subfolder': 'Prism', 'type': 'output'},
            }

            items = catalog.register(generation)
            self.assertEqual([item['image']['filename'] for item in items], ['grid.png', 'frame-1.png', 'frame-2.png'])
            grid, *frames = items
            self.assertEqual(grid['kind'], 'grid')
            self.assertIsNone(grid['parentId'])
            self.assertEqual(grid['childIds'], [item['id'] for item in frames])
            self.assertTrue(all(item['kind'] == 'art' for item in frames))
            self.assertTrue(all(item['parentId'] == grid['id'] for item in frames))
            self.assertTrue(all(item['characters'][0]['name'] == 'Алиса' for item in items))
            self.assertTrue(all(item['favorite'] is False for item in items))

            favorite = catalog.set_favorite(items[0]['id'], True)
            self.assertTrue(favorite['favorite'])
            reloaded = GalleryCatalog(path)
            self.assertTrue(next(item for item in reloaded.list_items() if item['id'] == items[0]['id'])['favorite'])

            reloaded.register(generation)
            self.assertTrue(next(item for item in reloaded.list_items() if item['id'] == items[0]['id'])['favorite'])

    def test_catalog_rejects_paths_outside_comfy_output(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / '.cache') as directory:
            catalog = GalleryCatalog(Path(directory) / 'gallery.json')
            with self.assertRaises(ValueError):
                catalog.register({'outputs': [{'filename': '../secret.png', 'type': 'output'}]})
            with self.assertRaises(ValueError):
                catalog.register({'outputs': [{'filename': 'input.png', 'type': 'input'}]})

    def test_version_one_items_remain_regular_art(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / '.cache') as directory:
            path = Path(directory) / 'gallery.json'
            path.write_text('{"version":1,"items":[{"id":"old","createdAt":1,"image":{"filename":"old.png","subfolder":"","type":"output"}}]}', encoding='utf-8')
            item = GalleryCatalog(path).list_items()[0]
            self.assertEqual(item['kind'], 'art')
            self.assertIsNone(item['parentId'])


if __name__ == '__main__':
    unittest.main()
