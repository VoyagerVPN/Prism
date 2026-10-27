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


def file_digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def download_verified(url, target, size, sha256):
    target = Path(target)
    if target.exists():
        if target.stat().st_size == size and file_digest(target) == sha256:
            print(f'Проверен существующий файл: {target}', flush=True)
            return
        raise RuntimeError(f'PRISM_MODEL_CONFLICT: {target} уже существует с другим содержимым; файл сохранён.')
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + '.part')
    offset = partial.stat().st_size if partial.exists() else 0
    if offset > size:
        raise RuntimeError(f'PRISM_DOWNLOAD_SIZE: проверьте и удалите лишний частичный файл {partial}')
    if offset < size:
        request = urllib.request.Request(url, headers={'Range': f'bytes={offset}-'} if offset else {})
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status == 206:
                content_range = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', response.headers.get('Content-Range', ''))
                if not content_range or int(content_range[1]) != offset or int(content_range[3]) != size:
                    raise RuntimeError('PRISM_DOWNLOAD_RANGE: сервер вернул неверный диапазон; частичный файл сохранён.')
            elif response.status == 200:
                offset = 0
            else:
                raise RuntimeError(f'PRISM_DOWNLOAD_HTTP: {response.status}')
            last_report = 0
            with partial.open('ab' if offset else 'wb') as stream:
                while chunk := response.read(1024 * 1024):
                    if offset + len(chunk) > size:
                        raise RuntimeError('PRISM_DOWNLOAD_SIZE: ответ больше ожидаемого файла.')
                    stream.write(chunk)
                    offset += len(chunk)
                    if time.monotonic() - last_report > 10:
                        print(f'Загрузка: {offset / 1e9:.2f} / {size / 1e9:.2f} ГБ', flush=True)
                        last_report = time.monotonic()
    if partial.stat().st_size != size:
        raise RuntimeError(f'PRISM_DOWNLOAD_INCOMPLETE: повторите установку; загрузка продолжится из {partial}')
    if file_digest(partial) != sha256:
        partial.unlink()
        raise RuntimeError('PRISM_DOWNLOAD_HASH: SHA256 не совпал. Повреждённый частичный файл удалён; повторите загрузку.')
    # rename в Windows не заменяет неожиданно появившийся пользовательский файл.
    partial.rename(target)


def installation_plan(root, device, model, port):
    root = Path(root).resolve()
    if device not in ('nvidia', 'cpu') or model not in ('sdxl', 'none'):
        raise ValueError('Неизвестный профиль установки')
    if not 1024 <= port <= 65535:
        raise ValueError('Порт должен быть от 1024 до 65535')
    return {
        'backend': str(root / '.runtime' / 'ComfyUI'),
        'python': str(root / '.runtime' / 'venv' / 'Scripts' / 'python.exe'),
        'models': str(root / '.runtime' / 'models'),
        'url': f'http://127.0.0.1:{port}/prism/',
        'model_bytes': 6938078334 if model == 'sdxl' else 0,
        'device': device,
    }


def prepare_installation(root, device, model, port):
    root = Path(root).resolve()
    plan = installation_plan(root, device, model, port)
    runtime = root / '.runtime'
    marker = runtime / 'prism-install.json'
    for name in ('prism.local.json', 'prism.json'):
        config = root / 'app' / name
        if not config.is_file():
            continue
        settings = json.loads(config.read_text(encoding='utf-8-sig'))
        backend = (config.parent / settings['backend_root']).resolve()
        if backend != Path(plan['backend']) and (name == 'prism.local.json' or backend.exists()):
            raise RuntimeError('PRISM_EXISTING_CONFIG: уже настроен другой ComfyUI. Для чистой установки распакуйте Prism в новую папку.')
        if name == 'prism.local.json' and settings.get('port') != port:
            raise RuntimeError('PRISM_PORT_CONFIG: другой порт уже сохранён в app/prism.local.json. Измените конфиг при остановленном backend.')
        break
    if runtime.exists() and any(runtime.iterdir()) and not marker.is_file():
        raise RuntimeError('PRISM_FOREIGN_RUNTIME: .runtime не создан Prism; выберите пустую папку.')
    if marker.exists():
        saved = json.loads(marker.read_text(encoding='utf-8-sig'))
        if saved.get('root') != str(root) or saved.get('device') != device:
            raise RuntimeError('PRISM_PROFILE_CHANGED: путь или устройство изменились. Используйте отдельную папку.')
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
    plan = prepare_installation(root, device, model, port)
    runtime = root / '.runtime'
    marker = runtime / 'prism-install.json'
    state = json.loads(marker.read_text(encoding='utf-8-sig'))
    backend, python = Path(plan['backend']), Path(plan['python'])
    # Работающая среда не меняется во время установки зависимостей.
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError(f'PRISM_PORT: порт {port} занят. Остановите эту установку или выберите -Port <свободный>.')
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
            raise RuntimeError(f'PRISM_COMMAND: код {result.returncode}. {(result.stdout or "") + (result.stderr or "") or "См. вывод команды выше."}')
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
        raise RuntimeError('PRISM_BACKEND_ORIGIN: .runtime/ComfyUI принадлежит другому репозиторию.')
    if not (backend / 'main.py').is_file():
        run(['git', '-C', backend, 'checkout', '--detach', manifest['comfy_commit']])
    revision = run(['git', '-C', backend, 'rev-parse', 'HEAD'], capture=True)
    if revision != state.get('comfy_commit', manifest['comfy_commit']):
        raise RuntimeError('PRISM_BACKEND_REVISION: ComfyUI обновлён отдельно. Setup не откатывает версии; см. README про обновление.')
    dirty = run(['git', '-C', backend, 'status', '--porcelain', '--untracked-files=no'], capture=True)
    if dirty:
        raise RuntimeError('PRISM_BACKEND_DIRTY: исходники ComfyUI изменены; сохраните изменения перед установкой.')

    requirements_lock = root / 'scripts' / 'requirements-lock.txt'
    fingerprint = hashlib.sha256((json.dumps(manifest, sort_keys=True) + device + requirements_lock.read_text(encoding='utf-8')).encode()).hexdigest()
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
        check += '; assert torch.cuda.is_available(), "CUDA недоступна: обновите драйвер NVIDIA"; print(torch.cuda.get_device_name(0)); assert torch.cuda.get_device_properties(0).total_memory >= 8_000_000_000, "Для начального SDXL-профиля нужно от 8 ГБ VRAM"'
    run([python, '-I', '-X', 'utf8', '-X', f'pycache_prefix={cache / "pycache"}', '-c', check])
    if model == 'sdxl':
        entry = manifest['model']
        download_verified(entry['url'], Path(plan['models']) / 'StableDiffusion' / entry['name'],
                          entry['bytes'], entry['sha256'])
    Path(plan['models']).mkdir(parents=True, exist_ok=True)
    write_launch_config(root, device, port)
    state.update({'complete': True, 'comfy_commit': revision, 'port': port})
    marker.write_text(json.dumps(state, indent=2), encoding='utf-8')
    packages = run([uv, 'pip', 'freeze', '--python', python], capture=True)
    (runtime / 'installed-packages.txt').write_text(packages + '\n', encoding='utf-8')
    print(f'Установка завершена. Запуск: Prism.bat\nПанель: {plan["url"]}', flush=True)
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--uv', required=True)
    parser.add_argument('--device', choices=('nvidia', 'cpu'), default='nvidia')
    parser.add_argument('--model', choices=('sdxl', 'none'), default='sdxl')
    parser.add_argument('--port', type=int)
    args = parser.parse_args()
    install_environment(args.root, args.uv, args.device, args.model, args.port)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(f'Установка не завершена: {error}', file=sys.stderr, flush=True)
        sys.exit(1)
