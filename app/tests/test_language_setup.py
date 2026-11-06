import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


APP = Path(__file__).resolve().parents[1]


class LanguageSetupTest(unittest.TestCase):
    @unittest.skipUnless(os.name == 'nt', 'Windows launcher')
    def test_launcher_uses_saved_language_for_missing_configuration(self):
        import shutil
        with tempfile.TemporaryDirectory(dir=APP / '.cache') as directory:
            root = Path(directory)
            shutil.copyfile(APP / 'Start.ps1', root / 'Start.ps1')
            shutil.copyfile(APP / 'Language.ps1', root / 'Language.ps1')
            (root / 'data').mkdir()
            for language, expected in [('en', 'was not found'), ('ru', 'не найден')]:
                (root / 'data' / 'language.json').write_text(json.dumps({'language': language}), encoding='utf-8')
                result = subprocess.run(
                    ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(root / 'Start.ps1'), '-NoBrowser'],
                    creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True, text=True,
                    encoding='utf-8', errors='replace', timeout=30,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected, result.stdout + result.stderr)

    @unittest.skipUnless(os.name == 'nt', 'Windows setup')
    def test_connection_error_is_shown_in_the_selected_language(self):
        with tempfile.TemporaryDirectory(dir=APP / '.cache') as directory:
            driver = Path(directory) / 'error.ps1'
            driver.write_text("""param($script)
$ErrorActionPreference = 'Stop'
. $script
foreach ($language in @('en', 'ru')) {
  $env:PRISM_LANGUAGE = $language
  try { Resolve-PrismComfyRoot 'missing' } catch { $_.Exception.Message }
}
""", encoding='utf-8-sig')
            result = subprocess.run(
                ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(driver), str(APP / 'Connect.ps1')],
                creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True, text=True,
                encoding='utf-8', errors='replace', timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), [
                'Choose a ComfyUI folder containing main.py or a ComfyUI Portable root.',
                'Выберите папку ComfyUI с файлом main.py или корень ComfyUI Portable.',
            ])

    @unittest.skipUnless(os.name == 'nt', 'Windows setup')
    def test_setup_window_switches_labels_without_saving_until_confirmed(self):
        with tempfile.TemporaryDirectory(dir=APP / '.cache') as directory:
            root = Path(directory)
            driver = root / 'window.ps1'
            driver.write_text("""param($script, $helper, $appRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
. $helper
. $script
Set-PrismLanguage $appRoot 'ru'
$form = New-PrismConnectionForm $appRoot
try {
  $language = $form.Controls.Find('prism-language', $true)[0]
  $install = $form.Controls.Find('prism-install', $true)[0]
  $status = $form.Controls.Find('prism-connection-status', $true)[0]
  $install.Text
  $language.SelectedIndex = 0
  $install.Text
  $status.Tag = 'needComfy'
  $status.Text = 'Specify the ComfyUI folder.'
  $language.SelectedIndex = 1
  $status.Text
  Get-PrismLanguage $appRoot 'ru-RU'
} finally { $form.Dispose() }
""", encoding='utf-8-sig')
            result = subprocess.run(
                ['powershell.exe', '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', str(driver),
                 str(APP / 'Connect.ps1'), str(APP / 'Language.ps1'), str(root)],
                creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True, text=True,
                encoding='utf-8', errors='replace', timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), ['Установить', 'Install', 'Укажите папку ComfyUI.', 'ru'])

    @unittest.skipUnless(os.name == 'nt', 'Windows setup')
    def test_setup_language_is_shared_with_application_and_preserved(self):
        with tempfile.TemporaryDirectory(dir=APP / '.cache') as directory:
            root = Path(directory)
            driver = root / 'driver.ps1'
            driver.write_text("""param($helper, $appRoot)
. $helper
$ErrorActionPreference = 'Stop'
Get-PrismLanguage $appRoot 'ru-RU'
Get-PrismLanguage $appRoot 'de-DE'
Set-PrismLanguage $appRoot 'ru'
Get-PrismLanguage $appRoot 'en-US'
Set-PrismLanguage $appRoot 'EN'
""", encoding='utf-8-sig')
            result = subprocess.run(
                ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(driver),
                 str(APP / 'Language.ps1'), str(root)],
                creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True, text=True,
                encoding='utf-8', errors='replace', timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), ['ru', 'en', 'ru'])
            self.assertEqual(json.loads((root / 'data' / 'language.json').read_text(encoding='utf-8')), {'language': 'en'})


if __name__ == '__main__':
    unittest.main()
