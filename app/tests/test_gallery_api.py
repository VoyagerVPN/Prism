import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

sys.modules['server'] = types.SimpleNamespace(PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef())))
sys.modules['folder_paths'] = types.SimpleNamespace()
spec = importlib.util.spec_from_file_location('dashboard_gallery_test', Path(__file__).resolve().parents[1] / '__init__.py', submodule_search_locations=[str(Path(__file__).resolve().parents[1])])
dashboard = importlib.util.module_from_spec(spec)
sys.modules['dashboard_gallery_test'] = dashboard
spec.loader.exec_module(dashboard)


class GalleryApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_register_list_and_favorite_routes(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / '.cache') as directory:
            catalog = dashboard.GalleryCatalog(Path(directory) / 'gallery.json')
            app = web.Application()
            app.router.add_get('/gallery', dashboard.get_gallery)
            app.router.add_post('/gallery', dashboard.post_gallery)
            app.router.add_patch('/gallery/favorite', dashboard.patch_gallery_favorite)
            with patch.object(dashboard, 'gallery_catalog', catalog):
                async with TestClient(TestServer(app)) as client:
                    response = await client.post('/gallery', json={
                        'promptId': 'job', 'createdAt': 7, 'settings': {'operation': 'txt2img', 'seed': 9},
                        'workflow': {'save': {'class_type': 'SaveImage', 'inputs': {}}},
                        'characters': [{'name': 'Алиса', 'lora': 'Character/alice.safetensors'}],
                        'outputs': [{'filename': 'alice.png', 'subfolder': 'Prism', 'type': 'output'}],
                    })
                    self.assertEqual(response.status, 200, await response.text())
                    registered = await response.json()
                    item = registered['items'][0]
                    self.assertEqual(registered['operation']['outputArtIds'], [item['id']])
                    self.assertEqual(registered['operation']['workflow']['save']['class_type'], 'SaveImage')
                    self.assertFalse(item['favorite'])
                    changed = await client.patch('/gallery/favorite', json={'id': item['id'], 'favorite': True})
                    self.assertTrue((await changed.json())['item']['favorite'])
                    listed = await client.get('/gallery')
                    snapshot = await listed.json()
                    self.assertEqual(snapshot['version'], 3)
                    self.assertTrue(snapshot['items'][0]['favorite'])
                    self.assertEqual(snapshot['operations'][0]['promptId'], 'job')
                    invalid = await client.post('/gallery', data='{', headers={'Content-Type': 'application/json'})
                    self.assertEqual(invalid.status, 400)


if __name__ == '__main__':
    unittest.main()
