import math
import re

from .versioned_store import VersionedJsonStore


class CharacterStore(VersionedJsonStore):
    collection_key = 'characters'
    size_error = 'База персонажей превышает 2 МБ'
    conflict_error = 'Персонажи изменены в другой вкладке. Обновите страницу перед сохранением.'

    @staticmethod
    def validate(characters):
        if not isinstance(characters, dict) or len(characters) > 1000:
            raise ValueError('Ожидается объект с не более чем 1000 персонажами')
        for name, character in characters.items():
            if not name.strip() or name == 'none' or not isinstance(character, dict):
                raise ValueError('Некорректная запись персонажа')
            for field in ('name', 'lora', 'appearance', 'outfit', 'activeOutfitName'):
                if field in character and not isinstance(character[field], str):
                    raise ValueError(f'{name}: {field} должен быть строкой')
            if 'outfits' in character and (
                not isinstance(character['outfits'], dict)
                or not all(isinstance(value, str) for value in character['outfits'].values())
            ):
                raise ValueError(f'{name}: некорректный список одежды')
            if 'strength' in character and (
                type(character['strength']) not in (int, float)
                or not math.isfinite(character['strength'])
            ):
                raise ValueError(f'{name}: некорректная сила LoRA')
            if 'outfitEnabled' in character and not isinstance(character['outfitEnabled'], bool):
                raise ValueError(f'{name}: некорректный переключатель одежды')
            portrait = character.get('portrait')
            if portrait is not None:
                source = portrait.get('source') if isinstance(portrait, dict) else None
                if (
                    not isinstance(portrait, dict)
                    or not isinstance(portrait.get('id'), str)
                    or not re.fullmatch(r'[0-9a-f]{64}', portrait['id'])
                    or not isinstance(source, dict)
                    or source.get('kind') not in ('gallery', 'civitai')
                    or not isinstance(source.get('id'), str)
                    or not source['id']
                ):
                    raise ValueError(f'{name}: некорректный портрет персонажа')
