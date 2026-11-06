import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'Connect.ps1'


class ConnectTest(unittest.TestCase):
    def run_ps(self, code, *args):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            driver = Path(directory) / 'test.ps1'
            driver.write_text(
                "param($script,$folder,$python)\n$ErrorActionPreference='Stop'\n. $script\n" + code,
                encoding='utf-8-sig',
            )
            return subprocess.run(
                ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(driver), str(SCRIPT), *map(str, args)],
                capture_output=True, encoding='utf-8', errors='replace', timeout=60,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )

    def test_prefers_comfy_environment_to_system_python(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            comfy = Path(directory) / 'ComfyUI'
            bundled = comfy.parent / 'python_embeded' / 'python.exe'
            bundled.parent.mkdir()
            bundled.touch()
            venv = comfy / 'venv' / 'Scripts' / 'python.exe'
            venv.parent.mkdir(parents=True)
            venv.touch()
            result = self.run_ps('Find-PrismPython $folder | ConvertTo-Json', comfy)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)[:2], [str(venv), str(bundled)])

    def test_skips_python_without_comfy_dependencies(self):
        result = self.run_ps(
            "function Find-PrismPython { 'bad.exe'; 'good.exe' }\n"
            "function Test-PrismPython { param($Python) if ($Python -eq 'bad.exe') { throw 'Missing torch' } }\n"
            "Resolve-PrismPython $folder $folder",
            ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'good.exe')

    def test_autofills_only_a_unique_usable_comfy(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            home = Path(directory)
            app = home / 'Prism' / 'app'
            app.mkdir(parents=True)
            comfy = home / 'ComfyUI'
            (comfy / 'models').mkdir(parents=True)
            (comfy / 'main.py').touch()
            code = (
                "function Resolve-PrismPython { 'C:/Test/python.exe' }\n"
                "Find-PrismConnection $folder -AdditionalRoots @() | ConvertTo-Json"
            )
            result = self.run_ps(code, app)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['comfy'], str(comfy))

            portable = home / 'ComfyUI_windows_portable' / 'ComfyUI'
            (portable / 'models').mkdir(parents=True)
            (portable / 'main.py').touch()
            result = self.run_ps(code, app)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), '')

    def test_rejects_folder_without_comfy_entrypoint(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            result = self.run_ps('Resolve-PrismComfyRoot $folder', directory)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('main.py', result.stderr)


if __name__ == '__main__':
    unittest.main()
