from pathlib import Path
import queue
import subprocess
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]


class LogCheck(unittest.TestCase):
    def test_console_follows_both_backend_streams(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            for name in ('stdout', 'stderr'):
                (Path(directory) / f'server.{name}.log').write_text(f'{name}-initial\n', encoding='utf-8')
            process = subprocess.Popen(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(ROOT / 'Show-Logs.ps1'), '-LogDirectory', directory], creationflags=subprocess.CREATE_NO_WINDOW, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
            lines = queue.Queue()
            thread = threading.Thread(target=lambda: [lines.put(line.strip()) for line in process.stdout], daemon=True)
            thread.start()
            try:
                initial = {lines.get(timeout=10), lines.get(timeout=10)}
                self.assertEqual(initial, {'stdout-initial', 'stderr-initial'})
                for name in ('stdout', 'stderr'):
                    with (Path(directory) / f'server.{name}.log').open('a', encoding='utf-8') as stream:
                        stream.write(f'{name}-live\n')
                live = {lines.get(timeout=10), lines.get(timeout=10)}
                self.assertEqual(live, {'stdout-live', 'stderr-live'})
                (Path(directory) / 'server.stderr.log').write_text('restart\n', encoding='utf-8')
                self.assertEqual(lines.get(timeout=10), 'restart')
            finally:
                process.terminate()
                process.wait(timeout=10)
                thread.join(timeout=2)
                process.stdout.close()


if __name__ == '__main__':
    unittest.main()
