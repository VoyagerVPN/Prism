import importlib.util
import json
import hashlib
import threading
import subprocess
import shutil
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('prism_install', ROOT / 'scripts' / 'install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'nt', 'Windows bootstrap')
    def test_setup_cannot_change_environment_while_launcher_is_starting(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'app' / '.cache' / 'runtime').mkdir(parents=True)
            shutil.copyfile(ROOT / 'Setup.ps1', root / 'Setup.ps1')
            shutil.copyfile(ROOT / 'scripts' / 'install-manifest.json', root / 'scripts' / 'install-manifest.json')
            lock = str(root / 'app' / '.cache' / 'runtime' / 'launcher.lock').replace("'", "''")
            holder = subprocess.Popen(['powershell.exe', '-NoProfile', '-Command',
                f"$lock=[IO.File]::Open('{lock}','OpenOrCreate','ReadWrite','None'); Write-Output 'ready'; Start-Sleep -Seconds 60"],
                creationflags=subprocess.CREATE_NO_WINDOW, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertEqual(holder.stdout.readline().strip(), 'ready')
                result = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                    '-File', str(root / 'Setup.ps1'), '-Device', 'CPU', '-Model', 'None', '-AcceptDownloads', '-NoLaunch'],
                    creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('PRISM_INSTALL_BUSY', result.stdout + result.stderr)
                self.assertFalse((root / '.runtime').exists())
            finally:
                holder.kill()
                holder.wait(timeout=10)
                holder.stdout.close()
                holder.stderr.close()

    def test_plan_is_local_and_does_not_create_environment(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            root = Path(directory)
            plan = installer.installation_plan(root, 'nvidia', 'sdxl', 8197)
            self.assertEqual(plan['url'], 'http://127.0.0.1:8197/prism/')
            self.assertEqual(plan['model_bytes'], 6938078334)
            self.assertEqual(Path(plan['backend']), root / '.runtime' / 'ComfyUI')
            self.assertEqual(list(root.iterdir()), [])

    def test_setup_refuses_foreign_runtime_and_preserves_its_files(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            root = Path(directory)
            runtime = root / '.runtime'
            runtime.mkdir()
            (runtime / 'important.txt').write_text('keep')
            with self.assertRaisesRegex(RuntimeError, 'PRISM_FOREIGN_RUNTIME'):
                installer.prepare_installation(root, 'cpu', 'none', 8197)
            self.assertEqual((runtime / 'important.txt').read_text(), 'keep')
            self.assertEqual(len(list(runtime.iterdir())), 1)

    def test_repeat_setup_resumes_same_profile_but_refuses_device_change(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            root = Path(directory)
            first = installer.prepare_installation(root, 'cpu', 'none', 8197)
            (root / '.runtime' / 'user-model.safetensors').write_bytes(b'keep')
            resumed = installer.prepare_installation(root, 'cpu', 'sdxl', 8197)
            self.assertEqual(resumed['url'], first['url'])
            with self.assertRaisesRegex(RuntimeError, 'PRISM_PROFILE_CHANGED'):
                installer.prepare_installation(root, 'nvidia', 'none', 8197)
            self.assertEqual((root / '.runtime' / 'user-model.safetensors').read_bytes(), b'keep')

    def test_existing_working_backend_is_never_reconfigured(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            root = Path(directory)
            (root / 'app').mkdir()
            backend = root / 'existing-backend'
            backend.mkdir()
            config = root / 'app' / 'prism.json'
            original = json.dumps({'backend_root': str(backend)})
            config.write_text(original)
            with self.assertRaisesRegex(RuntimeError, 'PRISM_EXISTING_CONFIG'):
                installer.prepare_installation(root, 'cpu', 'none', 8197)
            self.assertEqual(config.read_text(), original)
            self.assertFalse((root / '.runtime').exists())

    def test_model_download_resumes_and_publishes_only_verified_file(self):
        data = b'known model bytes for a local HTTP fixture'
        ranges = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                ranges.append(self.headers.get('Range'))
                start = int(self.headers.get('Range', 'bytes=0-').split('=')[1].split('-')[0])
                self.send_response(206 if start else 200)
                if start:
                    self.send_header('Content-Range', f'bytes {start}-{len(data)-1}/{len(data)}')
                self.send_header('Content-Length', str(len(data)-start))
                self.end_headers()
                self.wfile.write(data[start:])

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
                target = Path(directory) / 'model.safetensors'
                target.with_suffix('.safetensors.part').write_bytes(data[:6])
                installer.download_verified(f'http://127.0.0.1:{server.server_port}/model', target,
                                            len(data), hashlib.sha256(data).hexdigest())
                self.assertEqual(target.read_bytes(), data)
                self.assertEqual(ranges, ['bytes=6-'])
                installer.download_verified('http://127.0.0.1:1/unreachable', target,
                                            len(data), hashlib.sha256(data).hexdigest())
                target.write_bytes(b'private existing file')
                with self.assertRaisesRegex(RuntimeError, 'PRISM_MODEL_CONFLICT'):
                    installer.download_verified('http://127.0.0.1:1/unreachable', target,
                                                len(data), hashlib.sha256(data).hexdigest())
                self.assertEqual(target.read_bytes(), b'private existing file')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_new_config_is_loopback_only_and_repeat_setup_preserves_user_tuning(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            root = Path(directory)
            (root / 'app').mkdir()
            installer.write_launch_config(root, 'cpu', 8197)
            config = root / 'app' / 'prism.local.json'
            settings = json.loads(config.read_text())
            self.assertEqual(settings['backend_root'], '../.runtime/ComfyUI')
            self.assertEqual(settings['lan_interface'], '')
            self.assertIn('--cpu', settings['arguments'])
            settings['arguments'].append('--disable-smart-memory')
            config.write_text(json.dumps(settings))
            installer.write_launch_config(root, 'cpu', 8197)
            self.assertEqual(json.loads(config.read_text()), settings)

    def test_repeat_setup_never_claims_a_port_different_from_saved_config(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            root = Path(directory)
            (root / 'app').mkdir()
            installer.prepare_installation(root, 'cpu', 'none', 8197)
            installer.write_launch_config(root, 'cpu', 8197)
            with self.assertRaisesRegex(RuntimeError, 'PRISM_PORT_CONFIG'):
                installer.prepare_installation(root, 'cpu', 'none', 8198)


if __name__ == '__main__':
    unittest.main()
