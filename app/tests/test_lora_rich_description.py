from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch

from lora_library import local_entry


class LoraRichDescriptionTests(unittest.TestCase):
    def test_library_exposes_safe_rich_civitai_description_with_colors(self):
        root = Path(__file__).resolve().parents[1] / '.cache'
        with tempfile.TemporaryDirectory(dir=root) as directory:
            folder = Path(directory)
            model = folder / 'haaru.safetensors'
            model.write_bytes(b'weights')
            model.with_suffix('.cm-info.json').write_text(json.dumps({
                'ModelDescription': (
                    '<h2><span style="color: #ff6600; position: fixed" onclick="bad()">Illustrious</span></h2>'
                    '<ul><li><strong>Haaru</strong>: <span style="color: rgb(139, 92, 246)">style tags</span></li></ul>'
                    '<script>steal()</script><img src="https://tracker.invalid/pixel">'
                    '<a href="javascript:alert(1)">unsafe</a>'
                    '<a href="https://civitai.com/models/123" style="color: blue">Civitai</a>'
                    '<span style="color: #1234567">invalid color</span><a href="https://[">broken link</a>'
                ),
            }), encoding='utf-8')

            with patch('lora_library.CACHE', folder / 'civitai'), patch('lora_library.CATEGORY_PATH', folder / 'categories.json'):
                entry = local_entry('Style/haaru.safetensors', model, {'triggers': [], 'base_model': 'Illustrious'})

            self.assertIn('Illustrious', entry['description'])
            self.assertNotIn('steal()', entry['description'])
            rich = entry['descriptionHtml']
            self.assertIn('<h2><span style="color: #ff6600">Illustrious</span></h2>', rich)
            self.assertIn('<ul><li><strong>Haaru</strong>: <span style="color: rgb(139, 92, 246)">style tags</span></li></ul>', rich)
            self.assertIn('href="https://civitai.com/models/123"', rich)
            self.assertIn('style="color: blue"', rich)
            self.assertIn('<span>invalid color</span><a>broken link</a>', rich)
            for forbidden in ('script', 'onclick', 'position', '<img', 'javascript:', '#1234567', 'https://['):
                self.assertNotIn(forbidden, rich)


if __name__ == '__main__':
    unittest.main()
