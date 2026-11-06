"""Перевод сообщений существующих серверных компонентов на границе HTTP API.

Каталог содержит только сообщения Prism; имена файлов и другие пользовательские
значения не переводятся. Неизвестные сообщения внешних библиотек сохраняются.
"""
import json
import locale


MESSAGES = {
    'Отсутствует версия данных': 'Missing data revision',
    'Отсутствует версия данных персонажей': 'Missing character data revision',
    'Слишком большой или некорректный заголовок': 'The header is invalid or too large',
    'Уточните тип, базовую модель и категорию': 'Choose a type, base model and category',
    'Не передан файл': 'No file was provided',
    'Не переданы параметры импорта': 'Import parameters were not provided',
    'Некорректный параметр импорта': 'Invalid import parameter',
    'Некорректная настройка метаданных Civitai': 'Invalid Civitai metadata setting',
    'Файл больше 32 ГБ': 'The file exceeds 32 GB',
    'Такой файл уже есть в выбранной папке. Существующий файл сохранён.': 'A file with this name already exists in the selected folder. The existing file was preserved.',
    'Слишком большая или некорректная запись галереи': 'The gallery entry is invalid or too large',
    'Некорректное изменение избранного': 'Invalid favorite update',
    'Путь изображения выходит за пределы output': 'The image path is outside the output directory',
    'Исходный арт больше недоступен': 'The original image is no longer available',
    'Некорректное назначение изображения': 'Invalid image assignment',
    'Выберите цель изображения': 'Choose an image target',
    'Персонаж не найден': 'Character not found',
    'Изображение Civitai принадлежит другой LoRA': 'The Civitai image belongs to another LoRA',
    'Некорректное изображение Civitai': 'Invalid Civitai image',
    'Изображение отсутствует в метаданных этой LoRA': 'The image is absent from this LoRA’s metadata',
    'LoRA не найдена в зарегистрированной библиотеке': 'LoRA not found in the registered library',
    'Файл LoRA недоступен': 'The LoRA file is unavailable',
    'Выберите категорию LoRA': 'Choose a LoRA category',
    'Превью отсутствует': 'Preview unavailable',
    'Не указано имя LoRA': 'No LoRA name was provided',
    'Обновление уже выполняется. Повторите позже.': 'An update is already in progress. Try again later.',
    'Укажите название базы до 120 символов без символов пути и служебных имён Windows.': 'Enter a base name of up to 120 characters, without path characters or reserved Windows names.',
    'Некорректный список добавленных баз': 'Invalid list of added bases',
    'Некорректный заголовок safetensors': 'Invalid safetensors header',
    'Метаданные должны содержать строки': 'Metadata values must be strings',
    'В файле нет описания весов': 'The file has no weight descriptions',
    'Недопустимое имя файла; нужен .safetensors без пути': 'Invalid file name; use a .safetensors name without a path',
    'Выберите тип, базовую модель и категорию': 'Choose a type, base model and category',
    'Выбранный тип не совпадает со структурой весов': 'The chosen type does not match the weights',
    'Путь выходит за каталог моделей': 'The path is outside the models directory',
    'Файл слишком короткий': 'The file is too short',
    'Размер заголовка safetensors недопустим': 'Invalid safetensors header size',
    'Заголовок файла обрезан': 'The file header is truncated',
    'В файле нет весов': 'The file contains no weights',
    'Некорректный тип операции': 'Invalid operation type',
    'Некорректный каталог галереи': 'Invalid gallery catalog',
    'Некорректный журнал операций': 'Invalid operation history',
    'Некорректные или слишком большие параметры операции': 'Operation settings are invalid or too large',
    'Некорректный или слишком большой workflow операции': 'The operation workflow is invalid or too large',
    'Некорректный идентификатор операции': 'Invalid operation ID',
    'Некорректный prompt_id операции': 'Invalid operation prompt_id',
    'Некорректное время операции': 'Invalid operation time',
    'Галерея принимает только output-файлы ComfyUI': 'The gallery accepts only ComfyUI output files',
    'Некорректное имя изображения': 'Invalid image name',
    'Некорректная папка изображения': 'Invalid image folder',
    'Некорректный список персонажей': 'Invalid character list',
    'Некорректный персонаж': 'Invalid character',
    'Арт не найден в галерее': 'Image not found in the gallery',
    'Некорректная запись генерации': 'Invalid generation record',
    'Некорректные или слишком большие параметры генерации': 'Generation settings are invalid or too large',
    'Некорректный или слишком большой workflow генерации': 'The generation workflow is invalid or too large',
    'У генерации нет изображений': 'The generation has no images',
    'У генерации нет артов': 'The generation has no artwork',
    'Некорректный prompt_id генерации': 'Invalid generation prompt_id',
    'Недопустимый адрес изображения Civitai': 'Invalid Civitai image URL',
    'Изображение Civitai превышает 32 МБ': 'The Civitai image exceeds 32 MB',
    'Поддерживаются изображения JPEG, PNG и WebP': 'JPEG, PNG and WebP images are supported',
    'Civitai перенаправил изображение на недопустимый адрес': 'Civitai redirected the image to an invalid URL',
    'Некорректный каталог изображений Prism': 'Invalid Prism image catalog',
    'Некорректный источник изображения': 'Invalid image source',
    'Изображение отсутствует или превышает 32 МБ': 'The image is missing or exceeds 32 MB',
    'Изображение не найдено': 'Image not found',
    'Некорректная LoRA': 'Invalid LoRA',
    'Файл категорий больше 2 МБ': 'The categories file exceeds 2 MB',
    'Некорректный файл категорий библиотеки': 'Invalid library categories file',
    'В библиотеке уже сохранено 10000 категорий': 'The library already has 10,000 saved categories',
    'Некорректный ответ Civitai': 'Invalid response from Civitai',
    'Файл изменился во время поиска. Повторите обновление.': 'The file changed during lookup. Try updating again.',
    'Файл метаданных больше 2 МБ': 'The metadata file exceeds 2 MB',
    'Некорректный JSON': 'Invalid JSON',
    'Ответ Civitai больше 2 МБ': 'The Civitai response exceeds 2 MB',
    'Этот файл не найден на Civitai. Локальные данные сохранены.': 'This file was not found on Civitai. Local data was preserved.',
    'Civitai ограничил доступ к метаданным этого файла.': 'Civitai restricted access to this file’s metadata.',
    'Ответ карточки Civitai больше 2 МБ': 'The Civitai model response exceeds 2 MB',
    'Некорректная карточка модели Civitai': 'Invalid Civitai model response',
    'База персонажей превышает 2 МБ': 'The character database exceeds 2 MB',
    'Персонажи изменены в другой вкладке. Обновите страницу перед сохранением.': 'Characters changed in another tab. Refresh the page before saving.',
    'Ожидается объект с не более чем 1000 персонажами': 'Expected an object with at most 1,000 characters',
    'Некорректная запись персонажа': 'Invalid character record',
    'Каталог контента превышает 2 МБ': 'The content catalog exceeds 2 MB',
    'Каталог контента изменён в другой вкладке. Обновите страницу перед сохранением.': 'The content catalog changed in another tab. Refresh the page before saving.',
    'Совместимые recipes не должны быть пустыми или повторяться': 'Compatible recipes must be non-empty and unique',
    'Некорректная backend-реализация контента': 'Invalid content backend binding',
    'Некорректный путь backend-модели контента': 'Invalid content backend model path',
    'Некорректный prompt backend контента': 'Invalid content backend prompt',
    'Некорректная workflow-реализация контента': 'Invalid content workflow binding',
    'Техническая backend-реализация требует имя': 'A technical backend binding requires a name',
    'Параметры backend-реализации должны быть объектом': 'Backend binding parameters must be an object',
    'Ожидается объект с не более чем 5000 сущностями контента': 'Expected an object with at most 5,000 content entities',
    'Content entity требует стабильный semantic ID без пути файла': 'A content entity requires a stable semantic ID without a file path',
    'База пресетов превышает 2 МБ': 'The presets database exceeds 2 MB',
    'Пресеты изменены в другой вкладке. Обновите страницу перед сохранением.': 'Presets changed in another tab. Refresh the page before saving.',
    'Ожидается объект с не более чем 1000 пресетами': 'Expected an object with at most 1,000 presets',
    'Некорректное имя или состав пресета модели': 'Invalid model preset name or contents',
}

PREFIXES = {
    'Не удалось прочитать characters.json: ': 'Could not read characters.json: ',
    'Не удалось сохранить characters.json: ': 'Could not save characters.json: ',
    'Не удалось прочитать content.json: ': 'Could not read content.json: ',
    'Не удалось сохранить content.json: ': 'Could not save content.json: ',
    'Не удалось прочитать model-presets.json: ': 'Could not read model-presets.json: ',
    'Не удалось сохранить model-presets.json: ': 'Could not save model-presets.json: ',
    'Не удалось сохранить файл: ': 'Could not save the file: ',
    'Не удалось получить метрики процесса: ': 'Could not get process metrics: ',
    'Не удалось прочитать галерею: ': 'Could not read the gallery: ',
    'Не удалось записать галерею: ': 'Could not write the gallery: ',
    'Не удалось записать избранное: ': 'Could not save favorites: ',
    'Не удалось сохранить изображение: ': 'Could not save the image: ',
    'LoRA сохранена, но метаданные Civitai не загружены: ': 'LoRA was saved, but Civitai metadata could not be loaded: ',
    'Файл сохранён, но название базы не удалось запомнить: ': 'The file was saved, but its base name could not be remembered: ',
    'Повреждённый safetensors: ': 'Corrupt safetensors file: ',
    'Некорректное поле операции: ': 'Invalid operation field: ',
    'Не удалось прочитать метаданные: ': 'Could not read metadata: ',
    'Метаданные Civitai загружены частично: ': 'Civitai metadata was partially loaded: ',
    'Не удалось загрузить метаданные Civitai: ': 'Could not load Civitai metadata: ',
}
SUFFIXES = {
    ': некорректный список одежды': ': invalid outfit list',
    ': некорректная сила LoRA': ': invalid LoRA strength',
    ': некорректный переключатель одежды': ': invalid outfit toggle',
    ': некорректный портрет персонажа': ': invalid character portrait',
    ': некорректный тип или состав content entity': ': invalid content entity type or contents',
    ': content entity требует отображаемое имя': ': content entity requires a display name',
    ': некорректная область применения': ': invalid scope',
    ': content entity требует backend binding': ': content entity requires a backend binding',
    ': некорректное имя модели или алгоритма': ': invalid model or algorithm name',
    ': некорректный переключатель дополнительных параметров': ': invalid advanced settings toggle',
    ' должен быть строкой': ' must be a string',
    ' должен быть массивом строк': ' must be an array of strings',
}
LABELS = {
    'Совместимые recipes': 'Compatible recipes',
    'Положительный prompt binding': 'Positive prompt binding',
    'Отрицательный prompt binding': 'Negative prompt binding',
}


def read_language(path, accept_language=''):
    try:
        value = json.loads(path.read_text(encoding='utf-8-sig')).get('language')
        if value in ('en', 'ru'):
            return value
    except (OSError, ValueError, AttributeError):
        pass
    language = accept_language.split(',', 1)[0] or (locale.getlocale()[0] or '')
    return 'ru' if language.lower().replace('_', '-').split('-', 1)[0] == 'ru' else 'en'


def localize_message(value, language):
    message = str(value)
    if language != 'en':
        return message
    if message in MESSAGES:
        return MESSAGES[message]
    for source, target in PREFIXES.items():
        if message.startswith(source):
            return target + localize_message(message[len(source):], language)
    if message.startswith('Civitai вернул HTTP ') and message.endswith('. Повторите позже.'):
        code = message[len('Civitai вернул HTTP '):-len('. Повторите позже.')]
        if code.isdigit():
            return f'Civitai returned HTTP {code}. Try again later.'
    if message.startswith('Некорректный параметр ') and message.endswith(' backend-модели'):
        field = message[len('Некорректный параметр '):-len(' backend-модели')]
        return f'Invalid backend model parameter {field}'
    if ': некорректное значение ' in message:
        name, field = message.rsplit(': некорректное значение ', 1)
        return f'{name}: invalid value {field}'
    for source, target in SUFFIXES.items():
        if message.endswith(source):
            label = message[:-len(source)]
            return LABELS.get(label, label) + target
    return message
