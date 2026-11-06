"""Установка Prism в принадлежащее ему окружение; пакеты устанавливает uv."""
from pathlib import Path
import argparse
import json
import hashlib
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request


def translate(ru, en):
    language = os.environ.get('PRISM_LANGUAGE', '').lower()
    if language not in ('ru', 'en'):
        if os.name == 'nt':
            import ctypes
            language = 'ru' if ctypes.windll.kernel32.GetUserDefaultUILanguage() & 0x3ff == 0x19 else 'en'
        else:
            import locale
            language = 'ru' if (locale.getlocale()[0] or '').lower().startswith('ru') else 'en'
    return ru if language == 'ru' else en


def file_digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def download_verified(url, target, size, sha256):
    target = Path(target)
    if target.exists():
        if target.stat().st_size == size and file_digest(target) == sha256:
            print(translate('Проверен существующий файл: {target}', 'Verified existing file: {target}').format(target=target), flush=True)
            return
        raise RuntimeError(translate('PRISM_MODEL_CONFLICT: {target} уже существует с другим содержимым; файл сохранён.', 'PRISM_MODEL_CONFLICT: {target} already exists with different content; the file was preserved.').format(target=target))
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + '.part')
    offset = partial.stat().st_size if partial.exists() else 0
    if offset > size:
        raise RuntimeError(translate('PRISM_DOWNLOAD_SIZE: проверьте и удалите лишний частичный файл {partial}', 'PRISM_DOWNLOAD_SIZE: check and remove the oversized partial file {partial}').format(partial=partial))
    if offset < size:
        request = urllib.request.Request(url, headers={'Range': f'bytes={offset}-'} if offset else {})
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status == 206:
                content_range = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', response.headers.get('Content-Range', ''))
                if not content_range or int(content_range[1]) != offset or int(content_range[3]) != size:
                    raise RuntimeError(translate('PRISM_DOWNLOAD_RANGE: сервер вернул неверный диапазон; частичный файл сохранён.', 'PRISM_DOWNLOAD_RANGE: the server returned an invalid range; the partial file was preserved.'))
            elif response.status == 200:
                offset = 0
            else:
                raise RuntimeError(f'PRISM_DOWNLOAD_HTTP: {response.status}')
            last_report = 0
            with partial.open('ab' if offset else 'wb') as stream:
                while chunk := response.read(1024 * 1024):
                    if offset + len(chunk) > size:
                        raise RuntimeError(translate('PRISM_DOWNLOAD_SIZE: ответ больше ожидаемого файла.', 'PRISM_DOWNLOAD_SIZE: the response exceeds the expected file size.'))
                    stream.write(chunk)
                    offset += len(chunk)
                    if time.monotonic() - last_report > 10:
                        print(translate('Загрузка: {current:.2f} / {total:.2f} ГБ', 'Downloading: {current:.2f} / {total:.2f} GB').format(current=offset / 1e9, total=size / 1e9), flush=True)
                        last_report = time.monotonic()
    if partial.stat().st_size != size:
        raise RuntimeError(translate('PRISM_DOWNLOAD_INCOMPLETE: повторите установку; загрузка продолжится из {partial}', 'PRISM_DOWNLOAD_INCOMPLETE: retry setup; the download will resume from {partial}').format(partial=partial))
    if file_digest(partial) != sha256:
        partial.unlink()
        raise RuntimeError(translate('PRISM_DOWNLOAD_HASH: SHA256 не совпал. Повреждённый частичный файл удалён; повторите загрузку.', 'PRISM_DOWNLOAD_HASH: SHA256 did not match. The corrupt partial file was removed; retry the download.'))
    # rename в Windows не заменяет неожиданно появившийся пользовательский файл.
    partial.rename(target)


def selected_models(manifest, selection):
    catalog = {'sdxl': {**manifest['model'], 'directory': 'StableDiffusion'}, **manifest['optional_models']}
    keys = [] if selection == 'none' else selection.split(',')
    if any(key not in catalog for key in keys) or len(set(keys)) != len(keys):
        raise ValueError(translate('Неизвестный или повторный выбор моделей', 'Unknown or duplicate model selection'))
    return [catalog[key] for key in keys]


def installation_plan(root, device, model, port, manifest=None):
    root = Path(root).resolve()
    if device not in ('nvidia', 'cpu'):
        raise ValueError(translate('Неизвестный профиль установки', 'Unknown installation profile'))
    if not 1024 <= port <= 65535:
        raise ValueError(translate('Порт должен быть от 1024 до 65535', 'Port must be between 1024 and 65535'))
    if manifest is None:
        manifest = json.loads(Path(__file__).with_name('install-manifest.json').read_text(encoding='utf-8'))
    models = selected_models(manifest, model)
    return {
        'backend': str(root / '.runtime' / 'ComfyUI'),
        'python': str(root / '.runtime' / 'venv' / 'Scripts' / 'python.exe'),
        'models': str(root / '.runtime' / 'models'),
        'url': f'http://127.0.0.1:{port}/prism/',
        'model_bytes': sum(entry['bytes'] for entry in models),
        'device': device,
    }


def prepare_installation(root, device, model, port, manifest=None):
    root = Path(root).resolve()
    plan = installation_plan(root, device, model, port, manifest)
    runtime = root / '.runtime'
    marker = runtime / 'prism-install.json'
    config = root / 'app' / 'prism.local.json'
    if config.is_file():
        settings = json.loads(config.read_text(encoding='utf-8-sig'))
        backend = (config.parent / settings['backend_root']).resolve()
        if backend != Path(plan['backend']):
            raise RuntimeError(translate('PRISM_EXISTING_CONFIG: уже настроен другой ComfyUI. Для чистой установки распакуйте Prism в новую папку.', 'PRISM_EXISTING_CONFIG: another ComfyUI is configured. Extract Prism to a new folder for a clean installation.'))
        if settings.get('port') != port:
            raise RuntimeError(translate('PRISM_PORT_CONFIG: другой порт уже сохранён в app/prism.local.json. Измените конфиг при остановленном backend.', 'PRISM_PORT_CONFIG: a different port is saved in app/prism.local.json. Stop the backend before editing the config.'))
    if runtime.exists() and any(runtime.iterdir()) and not marker.is_file():
        raise RuntimeError(translate('PRISM_FOREIGN_RUNTIME: .runtime не создан Prism; выберите пустую папку.', 'PRISM_FOREIGN_RUNTIME: .runtime was not created by Prism; choose an empty folder.'))
    if marker.exists():
        saved = json.loads(marker.read_text(encoding='utf-8-sig'))
        if saved.get('root') != str(root) or saved.get('device') != device:
            raise RuntimeError(translate('PRISM_PROFILE_CHANGED: путь или устройство изменились. Используйте отдельную папку.', 'PRISM_PROFILE_CHANGED: the path or device changed. Use a separate folder.'))
    runtime.mkdir(exist_ok=True)
    if not marker.exists():
        marker.write_text(json.dumps({'root': str(root), 'device': device, 'complete': False}), encoding='utf-8')
    return plan


def write_launch_config(root, device, port):
    target = Path(root) / 'app' / 'prism.local.json'
    if target.exists():
        return
    settings = {
        'backend_root': '../.runtime/ComfyUI',
        'python': '../.runtime/venv/Scripts/python.exe',
        'models_root': '../.runtime/models',
        'port': port, 'lan_interface': '', 'startup_timeout_seconds': 300,
        'arguments': ['--preview-method', 'none'] + (['--cpu'] if device == 'cpu' else []),
        'managed_install': True,
    }
    with target.open('x', encoding='utf-8') as stream:
        json.dump(settings, stream, ensure_ascii=False, indent=2)


def install_environment(root, uv, device, model, port):
    root = Path(root).resolve()
    manifest = json.loads((root / 'scripts' / 'install-manifest.json').read_text(encoding='utf-8'))
    config = root / 'app' / 'prism.local.json'
    if port is None:
        port = json.loads(config.read_text(encoding='utf-8-sig'))['port'] if config.exists() else 8188
    plan = prepare_installation(root, device, model, port, manifest)
    runtime = root / '.runtime'
    marker = runtime / 'prism-install.json'
    state = json.loads(marker.read_text(encoding='utf-8-sig'))
    backend, python = Path(plan['backend']), Path(plan['python'])
    # Работающая среда не меняется во время установки зависимостей.
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError(translate('PRISM_PORT: порт {port} занят. Остановите эту установку или выберите -Port <свободный>.', 'PRISM_PORT: port {port} is in use. Stop the running installation or choose an available port with -Port.').format(port=port))
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(('UV_', 'PIP_', 'PYTHON', 'CONDA')) and key not in ('VIRTUAL_ENV',)}
    cache = root / '.cache'
    env.update({
        'UV_CACHE_DIR': str(cache / 'uv'), 'UV_PYTHON_INSTALL_DIR': str(runtime / 'python'),
        'UV_PYTHON_CACHE_DIR': str(cache / 'python-downloads'), 'UV_PYTHON_INSTALL_BIN': '0',
        'UV_PYTHON_INSTALL_REGISTRY': '0', 'UV_PYTHON_NO_REGISTRY': '1',
        'UV_NO_MODIFY_PATH': '1', 'UV_NO_CONFIG': '1', 'UV_MANAGED_PYTHON': '1',
        'UV_LINK_MODE': 'copy',
        'UV_INDEX_URL': 'https://pypi.org/simple',
        'PIP_CACHE_DIR': str(cache / 'pip'), 'PIP_CONFIG_FILE': 'NUL',
        'PIP_DISABLE_PIP_VERSION_CHECK': '1', 'PYTHONNOUSERSITE': '1', 'PYTHONUTF8': '1',
        'PYTHONPYCACHEPREFIX': str(cache / 'pycache'),
        'HF_HOME': str(cache / 'huggingface'), 'TORCH_HOME': str(cache / 'torch'),
        'TORCHINDUCTOR_CACHE_DIR': str(cache / 'torchinductor'), 'TRITON_CACHE_DIR': str(cache / 'triton'),
        'CUDA_CACHE_PATH': str(cache / 'cuda'),
        'XDG_CACHE_HOME': str(cache), 'TEMP': str(cache / 'tmp'), 'TMP': str(cache / 'tmp'),
        'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never',
        'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': 'NUL',
    })
    (cache / 'tmp').mkdir(parents=True, exist_ok=True)

    def run(args, *, capture=False, cwd=root):
        print('> ' + subprocess.list2cmdline(list(map(str, args))), flush=True)
        result = subprocess.run(list(map(str, args)), cwd=cwd, env=env, shell=False,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                                text=True, encoding='utf-8', errors='replace',
                                stdout=subprocess.PIPE if capture else None,
                                stderr=subprocess.PIPE if capture else subprocess.STDOUT)
        if result.returncode:
            detail = (result.stdout or '') + (result.stderr or '') or translate('См. вывод команды выше.', 'See the command output above.')
            raise RuntimeError(translate('PRISM_COMMAND: код {code}. {detail}', 'PRISM_COMMAND: exit code {code}. {detail}').format(code=result.returncode, detail=detail))
        if capture and result.stderr:
            print(result.stderr, file=sys.stderr, end='', flush=True)
        return (result.stdout or '').strip()

    # Завершённый профиль можно перепроверить и дополнить моделью без переустановки.
    state['complete'] = False
    marker.write_text(json.dumps(state, indent=2), encoding='utf-8')
    if not python.exists():
        run([uv, 'python', 'install', manifest['python_version'], '--no-bin', '--no-registry'])
        managed = run([uv, 'python', 'find', '--managed-python', manifest['python_version']], capture=True)
        run([uv, 'venv', '--python', managed, '--seed', runtime / 'venv'])
    if not backend.exists():
        run(['git', 'clone', '--no-checkout', '--filter=blob:none', 'https://github.com/Comfy-Org/ComfyUI.git', backend])
    origin = run(['git', '-C', backend, 'remote', 'get-url', 'origin'], capture=True)
    if origin != 'https://github.com/Comfy-Org/ComfyUI.git':
        raise RuntimeError(translate('PRISM_BACKEND_ORIGIN: .runtime/ComfyUI принадлежит другому репозиторию.', 'PRISM_BACKEND_ORIGIN: .runtime/ComfyUI belongs to a different repository.'))
    if not (backend / 'main.py').is_file():
        run(['git', '-C', backend, 'checkout', '--detach', manifest['comfy_commit']])
    revision = run(['git', '-C', backend, 'rev-parse', 'HEAD'], capture=True)
    if revision != state.get('comfy_commit', manifest['comfy_commit']):
        raise RuntimeError(translate('PRISM_BACKEND_REVISION: ComfyUI обновлён отдельно. Setup не откатывает версии; см. README про обновление.', 'PRISM_BACKEND_REVISION: ComfyUI was updated separately. Setup does not roll back versions; see README for updates.'))
    dirty = run(['git', '-C', backend, 'status', '--porcelain', '--untracked-files=no'], capture=True)
    if dirty:
        raise RuntimeError(translate('PRISM_BACKEND_DIRTY: исходники ComfyUI изменены; сохраните изменения перед установкой.', 'PRISM_BACKEND_DIRTY: ComfyUI sources were modified; save the changes before installation.'))

    requirements_lock = root / 'scripts' / 'requirements-lock.txt'
    package_manifest = {key: value for key, value in manifest.items() if key != 'optional_models'}
    fingerprint = hashlib.sha256((json.dumps(package_manifest, sort_keys=True) + device + requirements_lock.read_text(encoding='utf-8')).encode()).hexdigest()
    if state.get('packages_fingerprint') != fingerprint:
        index = manifest['cuda_index'] if device == 'nvidia' else 'https://download.pytorch.org/whl/cpu'
        torch = [f'{name}=={manifest[key]}' for name, key in
                 [('torch', 'torch_version'), ('torchvision', 'torchvision_version'), ('torchaudio', 'torchaudio_version')]]
        run([uv, 'pip', 'install', '--python', python, '--only-binary', ':all:', '--index-url', index, *torch])
        constraints = runtime / 'torch-constraints.txt'
        constraints.write_text('\n'.join(torch) + '\n', encoding='utf-8')
        run([uv, 'pip', 'install', '--python', python, '--only-binary', ':all:',
             '--index-url', 'https://pypi.org/simple', '-r', backend / 'requirements.txt',
             '-r', requirements_lock, '-c', constraints])
        run([uv, 'pip', 'check', '--python', python])
        state['packages_fingerprint'] = fingerprint
        marker.write_text(json.dumps(state, indent=2), encoding='utf-8')
    else:
        run([uv, 'pip', 'check', '--python', python])
    check = 'import torch, torch._dynamo, aiohttp, safetensors, PIL, psutil; print("PyTorch:", torch.__version__)'
    if device == 'nvidia':
        cuda_error = translate('CUDA недоступна: обновите драйвер NVIDIA', 'CUDA is unavailable: update the NVIDIA driver')
        vram_error = translate('Для начального SDXL-профиля нужно от 8 ГБ VRAM', 'The starter SDXL profile requires at least 8 GB VRAM')
        check += f'; assert torch.cuda.is_available(), {cuda_error!r}; print(torch.cuda.get_device_name(0)); assert torch.cuda.get_device_properties(0).total_memory >= 8_000_000_000, {vram_error!r}'
    run([python, '-I', '-X', 'utf8', '-X', f'pycache_prefix={cache / "pycache"}', '-c', check])
    for entry in selected_models(manifest, model):
        download_verified(entry['url'], Path(plan['models']) / entry['directory'] / entry['name'],
                          entry['bytes'], entry['sha256'])
    Path(plan['models']).mkdir(parents=True, exist_ok=True)
    write_launch_config(root, device, port)
    state.update({'complete': True, 'comfy_commit': revision, 'port': port})
    marker.write_text(json.dumps(state, indent=2), encoding='utf-8')
    packages = run([uv, 'pip', 'freeze', '--python', python], capture=True)
    (runtime / 'installed-packages.txt').write_text(packages + '\n', encoding='utf-8')
    print(translate('Установка завершена. Запуск: Prism.bat\nПанель: {url}', 'Installation complete. Start with Prism.bat\nInterface: {url}').format(url=plan['url']), flush=True)
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--uv', required=True)
    parser.add_argument('--device', choices=('nvidia', 'cpu'), default='nvidia')
    parser.add_argument('--model', default='none', help=translate('Ключи моделей через запятую или none', 'Comma-separated model keys or none'))
    parser.add_argument('--port', type=int)
    args = parser.parse_args()
    install_environment(args.root, args.uv, args.device, args.model, args.port)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(translate('Установка не завершена: {error}', 'Installation did not complete: {error}').format(error=error), file=sys.stderr, flush=True)
        sys.exit(1)
