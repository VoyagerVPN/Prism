import os


def _bytes(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError, OverflowError):
        return 0


def _default_dependencies():
    import psutil
    import comfy.model_management as model_management

    return psutil.Process(os.getpid()), psutil.virtual_memory().total, model_management


def collect_runtime_metrics(*, process=None, ram_capacity=None, model_management=None):
    """Возвращает только память процесса Prism/ComfyUI, не общую загрузку системы."""
    if process is None or ram_capacity is None or model_management is None:
        default_process, default_capacity, default_management = _default_dependencies()
        process = process or default_process
        ram_capacity = default_capacity if ram_capacity is None else ram_capacity
        model_management = model_management or default_management

    primary = model_management.get_torch_device()
    devices = list(model_management.get_all_torch_devices())
    if primary not in devices:
        devices.insert(0, primary)
    else:
        devices = [primary, *[device for device in devices if device != primary]]

    result_devices = []
    for device in devices:
        capacity, reserved = model_management.get_total_memory(device, torch_total_too=True)
        _, allocator_cache = model_management.get_free_memory(device, torch_free_too=True)
        capacity = _bytes(capacity)
        reserved = min(capacity, _bytes(reserved)) if capacity else _bytes(reserved)
        allocator_cache = min(reserved, _bytes(allocator_cache))
        allocated = reserved - allocator_cache

        managed_model_bytes = 0
        managed_model_count = 0
        for loaded in tuple(getattr(model_management, 'current_loaded_models', ())):
            try:
                if loaded.device != device or loaded.model is None:
                    continue
                managed_model_bytes += _bytes(loaded.model_loaded_memory())
                managed_model_count += 1
            except (AttributeError, RuntimeError, ReferenceError):
                continue

        models = min(capacity, managed_model_bytes) if capacity else managed_model_bytes
        # Обычный PyTorch-аллокатор уже включает веса в allocated. Dynamic VRAM/AIMDO
        # может учитывать загруженные веса отдельно, поэтому объединяем множества без
        # двойного счёта и сохраняем явно оценочный характер такого результата.
        separate_model_allocator = managed_model_bytes > allocated
        working = allocated if separate_model_allocator else max(0, allocated - min(models, allocated))
        remaining = max(0, capacity - models) if capacity else working + allocator_cache
        working = min(working, remaining)
        cache = min(allocator_cache, max(0, remaining - working))
        used = models + working + cache
        result_devices.append({
            'name': model_management.get_torch_device_name(device),
            'type': getattr(device, 'type', None),
            'index': getattr(device, 'index', None),
            'vram': {
                'used': used,
                'capacity': capacity,
                'allocated': allocated,
                'models': models,
                'working': working,
                'cache': cache,
                'scope': 'comfy_managed_plus_pytorch',
                'estimated': separate_model_allocator,
                'managed_model_bytes': managed_model_bytes,
                'managed_model_count': managed_model_count,
            },
        })

    return {
        'process': {
            'pid': process.pid,
            'ram': {'used': _bytes(process.memory_info().rss), 'capacity': _bytes(ram_capacity)},
        },
        'devices': result_devices,
    }
