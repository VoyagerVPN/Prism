import math

from .versioned_store import VersionedJsonStore


class PresetStore(VersionedJsonStore):
    collection_key = 'presets'
    size_error = 'База пресетов превышает 2 МБ'
    conflict_error = 'Пресеты изменены в другой вкладке. Обновите страницу перед сохранением.'

    @staticmethod
    def validate(presets):
        if not isinstance(presets, dict) or len(presets) > 1000:
            raise ValueError('Ожидается объект с не более чем 1000 пресетами')
        strings = ('checkpoint', 'sampler', 'scheduler', 'vae')
        numbers = {'steps': (10, 60), 'cfg': (0, 15), 'clipSkip': (1, 4)}
        fields = set(strings) | set(numbers) | {'advancedToggle'}
        for name, preset in presets.items():
            if (
                not name.strip()
                or len(name) > 200
                or name == 'default'
                or not isinstance(preset, dict)
                or set(preset) != fields
            ):
                raise ValueError('Некорректное имя или состав пресета модели')
            if any(
                not isinstance(preset[key], str)
                or not preset[key]
                or len(preset[key]) > 4096
                for key in strings
            ):
                raise ValueError(f'{name}: некорректное имя модели или алгоритма')
            if not isinstance(preset['advancedToggle'], bool):
                raise ValueError(
                    f'{name}: некорректный переключатель дополнительных параметров'
                )
            for key, (low, high) in numbers.items():
                value = preset[key]
                if (
                    type(value) not in (int, float)
                    or not math.isfinite(value)
                    or not low <= value <= high
                    or (key != 'cfg' and int(value) != value)
                ):
                    raise ValueError(f'{name}: некорректное значение {key}')
