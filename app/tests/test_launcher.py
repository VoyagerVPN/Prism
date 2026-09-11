import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]


class LauncherCheck(unittest.TestCase):
    def test_stop_uses_process_identity_when_prism_route_is_unavailable(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            root = Path(directory)
            shutil.copyfile(ROOT / 'Start.ps1', root / 'Start.ps1')
            probe = ThreadingHTTPServer(('127.0.0.1', 0), BaseHTTPRequestHandler)
            port = probe.server_port
            probe.server_close()
            script = root / 'main.py'
            script.write_text(
                """import json,sys
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/queue':
            raw=json.dumps({'queue_running':[],'queue_pending':[]}).encode()
            self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(raw)
        else:self.send_response(404);self.end_headers()
    def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',int(sys.argv[1])),Handler).serve_forever()
""",
                encoding='utf-8',
            )
            config = json.loads((ROOT / 'prism.json').read_text(encoding='utf-8-sig'))
            config.update({'port': port, 'python': sys.executable})
            config_path = root / 'config.json'
            config_path.write_text(json.dumps(config), encoding='utf-8')
            process = subprocess.Popen(
                [sys.executable, str(script), str(port)],
                cwd=root,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            try:
                for _ in range(100):
                    try:
                        urllib.request.urlopen(f'http://127.0.0.1:{port}/queue', timeout=.2).close()
                        break
                    except OSError:
                        time.sleep(.05)
                result = subprocess.run(
                    ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(root / 'Start.ps1'), '-Action', 'Stop', '-Config', str(config_path)],
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                process.wait(timeout=10)
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=10)

    def test_status_rejects_preview_and_accepts_real_backend(self):
        responses = {'/system_stats': {'system': {}}, '/prism/runtime': {'service': 'prism', 'version': 1}}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                raw = json.dumps(responses.get(self.path, {})).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(raw)

            def log_message(self, *args):
                pass

        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            for name in ('Start.ps1', 'Update.ps1', 'prism.json'):
                shutil.copyfile(ROOT / name, Path(directory) / name)
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            config = json.loads((ROOT / 'prism.json').read_text(encoding='utf-8-sig'))
            config['port'] = server.server_port
            path = Path(directory) / 'config.json'
            path.write_text(json.dumps(config), encoding='utf-8')
            def run(action='Status'):
                return subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(Path(directory) / 'Start.ps1'), '-Action', action, '-Config', str(path)], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
            try:
                self.assertNotEqual(run().returncode, 0)
                responses['/system_stats']['system']['comfyui_version'] = '0.34.0'
                result = run()
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                responses['/queue'] = {'queue_running': [[1, 'job']], 'queue_pending': []}
                result = run('Update')
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('PRISM_BUSY', result.stdout + result.stderr)
                responses['/prism/runtime'] = {'service': 'another-app'}
                self.assertNotEqual(run().returncode, 0)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def test_update_check_rejects_dirty_repo_and_finds_stable_release(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            root = Path(directory)
            for name in ('Start.ps1', 'Update.ps1', 'prism.json'):
                shutil.copyfile(ROOT / name, root / name)
            upstream = root / 'upstream'
            backend = root / 'backend'
            def git(*args):
                return subprocess.run(['git', *map(str, args)], check=True, capture_output=True)
            git('init', upstream)
            (upstream / 'README.md').write_text('v1')
            (upstream / 'requirements.txt').write_text('# no external dependencies\n')
            git('-C', upstream, 'add', '.')
            git('-C', upstream, '-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '-m', 'initial')
            git('-C', upstream, 'tag', 'v1.0.0')
            (upstream / 'README.md').write_text('v2')
            git('-C', upstream, 'add', '.')
            git('-C', upstream, '-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '-m', 'release')
            git('-C', upstream, 'tag', 'v2.0.0')
            git('-C', upstream, 'tag', 'v3.0.0-rc1')
            git('clone', upstream, backend)
            git('-C', backend, 'checkout', '--detach', 'v1.0.0')
            config = json.loads((ROOT / 'prism.json').read_text(encoding='utf-8-sig'))
            config['backend_root'] = str(backend)
            # Свободный порт: updater не должен трогать реальный ComfyUI.
            probe = ThreadingHTTPServer(('127.0.0.1', 0), BaseHTTPRequestHandler)
            config['port'] = probe.server_port
            probe.server_close()
            path = root / 'config.json'
            path.write_text(json.dumps(config), encoding='utf-8')
            def run(action='CheckUpdate'):
                return subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(root / 'Start.ps1'), '-Action', action, '-Config', str(path)], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
            (backend / 'README.md').write_text('local edit')
            result = run()
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('PRISM_DIRTY', result.stdout + result.stderr)
            git('-C', backend, 'checkout', '--', 'README.md')
            result = run()
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('v2.0.0', result.stdout)
            self.assertNotIn('v3.0.0-rc1', result.stdout)
            os.environ['PIP_CACHE_DIR'] = str(ROOT / '.cache' / 'pip')
            subprocess.run([shutil.which('python'), '-m', 'venv', str(root / 'python')], check=True, capture_output=True)
            config['python'] = str(root / 'python' / 'Scripts' / 'python.exe')
            path.write_text(json.dumps(config), encoding='utf-8')
            result = run('Update')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual((backend / 'README.md').read_text(), 'v2')
            backups = list((root / '.cache' / 'updates').iterdir())
            self.assertEqual(len(backups), 1)
            self.assertTrue((backups[0] / 'source.zip').is_file())
            self.assertEqual(json.loads((backups[0] / 'prism.json').read_text(encoding='utf-8-sig'))['backend_root'], str(backend))
            (backend / 'main.py').write_text('import time; time.sleep(60)\n')
            process = subprocess.Popen([config['python'], 'main.py'], cwd=backend, creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                result = run('Start')
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('PRISM_STARTING', result.stdout + result.stderr)
            finally:
                # Завершаем также дочерний интерпретатор Windows venv redirector.
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
                process.wait(timeout=10)


if __name__ == '__main__':
    unittest.main()
