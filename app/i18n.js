import i18next from './vendor-i18next.js';
import {staticMessages} from './static_messages.js';

const storageKey = 'prism_language_v1';
const resources = {
  en: {translation: {...Object.fromEntries(Object.entries(staticMessages).map(([source,value])=>[`static.${source}`,value])), common: {cancel: 'Cancel'}, gallery: {imageCount_one: '{{count}} image', imageCount_other: '{{count}} images'}, settings: {
    title: 'Prism settings', scope: 'Preferences for this browser, except language.', language: 'Language', variants: 'Initial character variants',
    variantsHelp: 'Names used when creating a character from a card or manually. You can clear or change them later. Additional variants are created without a name.',
    appearance: 'Initial appearance name', outfit: 'Initial outfit name', outfitEnabled: 'Enable outfit for new characters', prompt: 'Prompt',
    weight: 'Show the strength of connected content', always: 'Always', modified: 'Only when changed', weightHelp: 'Changes the display only. Strength and prompt content are preserved.',
    import: 'LoRA import', metadata: 'Automatically download Civitai metadata', metadataHelp: 'After saving a LoRA, Prism sends its file hash to Civitai and retrieves its name, author, triggers, preview and description.',
    defaults: 'Defaults', cancel: 'Cancel', save: 'Save', notSaved: 'Not saved: {{message}}', languageSaveFailed:'Could not save the language. Check the connection to Prism and try again.', defaultVariant: 'Default', invalidName:'Name must be at most 200 characters and cannot use reserved names.', invalid:'Invalid Prism preferences.'
  }}},
  ru: {translation: {common: {cancel: 'Отмена'}, gallery: {imageCount_one: '{{count}} изображение', imageCount_few: '{{count}} изображения', imageCount_many: '{{count}} изображений', imageCount_other: '{{count}} изображения'}, settings: {
    title: 'Настройки Prism', scope: 'Предпочтения для этого браузера, кроме языка.', language: 'Язык', variants: 'Первичные варианты персонажа',
    variantsHelp: 'Имена при первом создании персонажа из карточки или вручную. Впоследствии их можно стереть или изменить. Дополнительные варианты создаются без имени.',
    appearance: 'Начальное имя внешности', outfit: 'Начальное имя комплекта одежды', outfitEnabled: 'Включать одежду у нового персонажа', prompt: 'Промпт',
    weight: 'Показывать интенсивность подключённого контента', always: 'Всегда', modified: 'Только изменённую', weightHelp: 'Меняет только отображение. Интенсивность и содержимое промпта сохраняются.',
    import: 'Импорт LoRA', metadata: 'Автоматически загружать метаданные Civitai', metadataHelp: 'После сохранения LoRA Prism передаёт Civitai хеш файла и получает название, автора, триггеры, превью и описание.',
    defaults: 'Значения по умолчанию', cancel: 'Отмена', save: 'Сохранить', notSaved: 'Не сохранено: {{message}}', languageSaveFailed:'Не удалось сохранить язык. Проверьте подключение к Prism и повторите попытку.'
  }}},
};
resources.en.translation.firstRun={
  title:'Getting started with Prism', intro:'Prism runs inside ComfyUI. ComfyUI and your chosen model generate the images.',
  connection:'Connection', connectionBefore:'The interface uses the backend at this page’s address. For another installation, open its address ending in', connectionAfter:'. To start locally:',
  model:'Model', modelBefore:'A good starting point is', modelLink:'SDXL Base by Stability AI', modelAfter:': a single .safetensors checkpoint, about 6.94 GB, with its own terms of use. Setup.ps1 can download it and verify its SHA256. Alternatively, import a compatible SDXL checkpoint. Separate UNet and LoRA files require their own components.',
  import:'Add model file', firstImage:'Your first image', exampleHelp:'Prepare an example: one 512 × 512 image, 20 steps, without additional processing. Check the text in Create and click Generate. The first image includes loading weights into memory. The result will appear in the workspace and gallery.',
  example:'Prepare example', extra:'FaceDetailer, Face Swap and upscaling require additional models and nodes. They are not required for your first image.', check:'Check again', close:'Close',
  checking:'Checking models…', available:'Available models: {{count}}. {{names}}', missing:'No model found. Install SDXL through Setup.ps1 or add a model file, then check again.', noExample:' The example below is intended for an SDXL checkpoint. Choose your model in Create and use its recipe.', notChecked:'Model readiness was not checked.', error:'Could not check ComfyUI: {{message}}. Check the page address and startup log, then try again.'
};
resources.ru.translation.firstRun={
  title:'Первый запуск Prism', intro:'Prism работает внутри ComfyUI. Генерацию выполняют ComfyUI и выбранная вами модель.',
  connection:'Подключение', connectionBefore:'Панель использует backend по адресу этой страницы. Для другой установки откройте её адрес с окончанием', connectionAfter:'. Локальный запуск:',
  model:'Модель', modelBefore:'Для начала подойдёт', modelLink:'SDXL Base от Stability AI', modelAfter:': один checkpoint .safetensors, около 6,94 ГБ, с собственными условиями использования. Setup.ps1 может загрузить его с проверкой SHA256. Либо добавьте совместимый SDXL checkpoint через импорт. Отдельные UNet и LoRA требуют своих компонентов.',
  import:'Добавить файл модели', firstImage:'Первое изображение', exampleHelp:'Подготовьте пример: один кадр 512 × 512, 20 шагов, без дополнительных обработок. Проверьте текст во вкладке «Создание» и нажмите «Запуск». Первый кадр включает загрузку весов в память. Результат появится в рабочей области и галерее.',
  example:'Подготовить пример', extra:'Для FaceDetailer, Face Swap и увеличения нужны дополнительные модели и узлы. Для первого изображения они не требуются.', check:'Проверить снова', close:'Закрыть',
  checking:'Проверка моделей…', available:'Доступно моделей: {{count}}. {{names}}', missing:'Модель не найдена. Установите SDXL через Setup.ps1 или добавьте файл модели, затем проверьте снова.', noExample:' Пример ниже предназначен для SDXL checkpoint. Выберите вашу модель в «Создании» и используйте её рецепт.', notChecked:'Готовность моделей не проверена.', error:'Не удалось проверить ComfyUI: {{message}}. Проверьте адрес страницы и журнал запуска, затем повторите проверку.'
};
resources.en.translation.progress={
  running:'Running', preparing:'Preparing workflow', overall:'Overall progress {{percent}}%', frame:'Image {{current}}/{{total}} · {{stage}}',
  pass:'Pass {{current}}/{{total}}', step:'Step {{current}}/{{total}}', processing:'Processing',
  stages:{CheckpointLoaderSimple:'Loading model',UNETLoader:'Loading model',CLIPLoader:'Loading text model',DualCLIPLoader:'Loading text model',VAELoader:'Loading VAE',LoraLoader:'Applying connected content',CLIPTextEncode:'Preparing prompt',EmptyLatentImage:'Preparing latent',KSampler:'Diffusion',KSamplerAdvanced:'Diffusion',SamplerCustom:'Diffusion',SamplerCustomAdvanced:'Diffusion',VAEDecode:'Decoding',VAEEncode:'Encoding Hires',UpscaleModelLoader:'Loading upscaler',ImageUpscaleWithModel:'Neural upscaling',ImageScale:'Scaling',FaceDetailer:'Face detail',ReActorFaceSwap:'Face swap',SaveImage:'Saving image',ImageBatch:'Preparing batch',ImageGrid:'Preparing grid',GetImageSize:'Preparing grid',LoadImage:'Loading image',LoadImageOutput:'Loading source image'}
};
resources.en.translation.main={
  job:{submitting:'Submitting',queued:'Queued',running:'Running',reconnecting:'Reconnecting',unknown:'Status unknown',cancelling:'Cancelling',cancelled:'Cancelled',failed:'Error',succeeded:'Done',lost:'Job disconnected'},
  submittingDetail:'Sending the captured workflow to ComfyUI', queuedDetail:'Waiting to start · Overall progress {{percent}}%', reconnectingLabel:'Reconnecting · {{percent}}%', lastStage:'Last stage: {{stage}}', cancellingLabel:'Cancelling job', recordedProgress:'Recorded progress {{percent}}%', checkingJob:'Checking job status', lastProgress:'Last progress {{percent}}%',
  preparingFile:'Preparing file', checkingInputs:'Checking settings and source files', connected:'Connected', disconnected:'Disconnected',
  needFace:'FaceDetailer and bbox/face_yolov8m.pt are required', needSwap:'ReActorFaceSwap and inswapper_128.onnx are required', needUpscale:'An upscaling node and weights are required', unavailable:'Unavailable: {{value}}', noModels:'ComfyUI did not find any checkpoint models. Check the paths and refresh the list.',
  queuedJobs:'Jobs: {{count}}', modelAdded:'Model added and selected for generation.', modelAddedNeedsComponents:'Model file added. Generation requires compatible components and a supported recipe.', abandoned:'Stopped tracking the unknown job. It was not resubmitted.', scanning:'Searching for model files on disk…', scanComplete:'List updated: {{total}} models, {{added}} new.', scanFailed:'Could not refresh the list: {{message}}', notComfy:'The server did not identify itself as ComfyUI'
};
resources.en.translation.metrics={
  ramDetail:'Process RSS', ramTitle:'Prism/ComfyUI, PID {{pid}}: process RSS {{used}} of {{capacity}} system RAM.', ramUnavailable:'Process RAM metric is unavailable.',
  vramDetail:'models {{models}} · working {{working}} · cache {{cache}}', noData:'PyTorch: no data', estimate:'estimated ',
  vramTitle:'Prism/ComfyUI on {{device}}: {{estimate}}{{used}} of {{capacity}} according to the Comfy model manager and PyTorch. Models {{models}}, working tensors {{working}}, cache reserve {{cache}}. Memory used by third-party CUDA libraries is not included.', vramUnavailable:'Process VRAM metric is unavailable.'
};
resources.en.translation.archive={
  noCharacter:'No character', removeFavorite:'Remove from favorites', addFavorite:'Add to favorites', emptyFilter:'No images match the selected filter.', empty:'Prism images will appear here after your first generation.',
  openGrid:'Open grid', openImage:'Open image', grid_one:'Grid with {{count}} image', grid_other:'Grid with {{count}} images', imageNamed:'Image: {{names}}', imageUnnamed:'Image without a specified character', gridLabel:'Grid · {{count}}',
  edit:'Edit', generation:'Generation', fromSource:'{{operation}} · from source', continue:'Continue from this image', openGeneration:'Open image in generation', useAs:'Use image as…', useAsHelp:'Use as a character portrait or library item cover', assignError:'Could not assign image: {{message}}', favoriteError:'Could not update favorites: {{message}}', registerError:'Image was saved to disk but not added to the gallery: {{message}}'
};
resources.en.translation.galleryView={
  gridFavorite:'A batch grid cannot be added to favorites', content:'Content', prompt:'Prompt', archived:'The result is available in the gallery. This recipe was moved to a separate Prism branch.',
  selectFirst:'Select a finished image first', selectFrame:'Select an individual image from the batch', refineSaved:'Refine is available only for a saved result', waitImage:'Wait for the selected image to load', refine:'Refine the selected image at high resolution', noFiles:'The job completed, but SaveImage returned no files.',
  group:'Group: {{label}}', groupCount:'Results in group', result:'Result {{index}}, Seed {{seed}}', unknown:'unknown', chooseFrame:'Select image {{index}}', frame:'Image {{index}}', unavailableFrame:'Image {{index}} is unavailable',
  downloadGrid:'Download PNG grid', downloadFrame:'Download selected image', repeatBatch:'Repeat batch', repeatFrame:'Repeat image', noGraph:'The exact graph was not saved for this older record', grid:'Grid', showBatch:'Show entire batch', gridTitle:'Grid', image:'Image {{index}}',
  character:'Character: {{name}}', gridInfo:'Grid', frameInfo:'Image: {{index}}/{{total}}', variation:'Variation: {{seed}}, strength {{strength}}', model:'Model', unknownModel:'Unknown', batchSeed:' batch', size:'Size: {{width}}x{{height}}', applySettings:'Apply all settings from the selected generation to the form', chooseFrameInGrid:'Select an image in the grid first', oldBatchSeed:'Only the shared seed was saved for this older batch', takeSeed:'Use the selected image seed', restoreError:'Could not restore the selected image operation.', downloadError:'Could not download image: {{message}}'
};
resources.en.translation.dialog={name:'Name',save:'Save',confirm:'Confirm',delete:'Delete',notice:'Notice',understood:'OK',cancel:'Cancel'};
resources.en.translation.model={
  unsupported:'Unsupported model recipe.', missingAnima:'Missing Anima components: {{names}}', unavailable:'Model {{name}} is unavailable.',
  qwenLora:'LoRA “{{name}}” is intended for Qwen Image 2.1 and is incompatible with SDXL and Anima.', incompatible:'LoRA “{{name}}” is not compatible with Anima. Choose an Anima LoRA or change the model.', animaOnly:'LoRA “{{name}}” is intended only for Anima. Choose a compatible LoRA or change the model.',
  node:'Node {{node}} is unavailable. Check that the extension loaded in ComfyUI.', tooFew:'{{node}}: not enough {{name}} inputs.', missing:'{{node}}: {{name}} is missing.', unsupportedInput:'{{node}}: input {{name}} is not supported by this version of ComfyUI.', invalidLink:'Invalid connection {{id}}.{{name}}.', wrongType:'{{id}}.{{name}}: expected {{expected}}, got {{actual}}.', unavailableValue:'{{node}}: {{name}} = {{value}} is unavailable.', invalidValue:'{{node}}: invalid value {{name}} = {{value}}.'
};
resources.en.translation.api={
  saveJob:'Could not save the job in the browser: {{message}}', busy:'Wait for the current job to finish or cancel it.', wrongId:'The server returned a different job ID.', socketMessage:'ComfyUI message error: {{message}}', interrupted:'The connection to ComfyUI was interrupted.',
  missingGrid:': grid is missing', batchCount:'The batch returned {{actual}} files instead of {{expected}}{{detail}}.', notCompleted:'ComfyUI did not complete the job.', lost:'The job is absent from the server queue and history. Automatic retry is disabled.'
};
resources.en.translation.presets={invalid:'Invalid response from preset storage', dirty:'Modified — save changes or restore saved settings', saved:'Saved to JSON', current:'Current settings — no preset', none:'No preset', missing:' — model missing', unavailable:'Presets are unavailable: {{message}}. Refresh the page to retry.', notApplied:'Preset was not applied: model {{name}} is missing.', saving:'Saving…', notSaved:'Not saved: {{message}}. Refresh the page to retry.', namePrompt:'Name for the current model settings:', newTitle:'New model preset', duplicate:'This name is already in use. Choose another or save changes to the selected preset.', delete:'Delete preset “{{name}}”? The current model settings will remain in the form.'};
resources.en.translation.formats={locale:'en-US',pixels:'{{count}} px',edit:'Edit format “{{name}}”',delete:'Delete format “{{name}}”',deleteConfirm:'Delete format “{{name}}” ({{width}} × {{height}} px)?',add:'Add format',saveError:'Could not save formats in the browser. Free some space and try again.',name:'Name',width:'Width, px',height:'Height, px',editTitle:'Edit format',newTitle:'New format',multiple:'256–2048 px, a multiple of 8',invalid:'Enter a name and dimensions between 256 and 2048 px, in multiples of 8.',duplicate:'A format with these dimensions already exists.',readError:'Could not read the format list. Default formats are shown; saving or deleting will replace the list in this browser.',sizeError:'Enter a value between 256 and 2048 pixels, in multiples of 8.'};
resources.en.translation.controls={select:'Select value',choose:'Choose…',noResults:'No results',searchLabel:'Search: {{label}}',search:'Search…'};
resources.en.translation.storage={unavailable:'Unavailable: {{value}}',fromSnapshot:'{{name}} (from snapshot)',saveError:'Settings were not saved: {{message}}',invalid:'Invalid settings format',restoreError:'Could not restore settings: {{message}}',promptError:'Could not restore prompt: {{message}}'};
resources.en.translation.preview={hide:'Hide generation preview',show:'Show generation preview'};
resources.en.translation.workflow={invalid:'Invalid value “{{label}}”: {{value}}',sourceWidth:'Source width',sourceHeight:'Source height',refineOutput:'Refine is available only for a saved output image.',sourcePath:'Invalid source image path.',refineBuild:'Could not build the Refine workflow.',sourceMissing:'The Hires workflow has no source image.',batchCount:'Number of images: 1, 4 or 9',variation:'Variation',variationSeed:'Variation seed',chooseModel:'Choose an available model.',incompatible:'“{{name}}” was prepared for {{recipe}} and is incompatible with the current model. Remove and add this content again.',unsupportedBackend:'The {{kind}} backend for “{{id}}” is not yet connected to the compiler.',promptText:'Prompts must be text.',width:'Width',height:'Height',faceSource:'Face Swap requires a source face file.',chooseUpscaler:'Choose an available upscaling model.'};
resources.en.translation.promptValidation={invalidContentString:'Invalid {{label}} for content.',positive:'positive prompt',negative:'negative prompt',binding:'Invalid content backend binding.',backendLora:'Invalid content backend LoRA.',bindingName:'A content backend binding requires a name.',bindingParams:'Invalid backend binding parameters.',contentPart:'Invalid content item in prompt.',contentId:'Invalid content semantic ID.',contentType:'Invalid content type.',contentName:'Content requires a display name.',contentScope:'Invalid content scope.',contentTarget:'Invalid content target.',snapshot:'Content requires a reproducible snapshot.',contentParams:'Invalid content parameters.',recipe:'Invalid content snapshot recipe.',characterInstance:'Invalid character instance.',character:'Invalid character in prompt.',variants:'Invalid character variants.',trigger:'Invalid character trigger.',tags:'Invalid character tag state.',prompt:'Invalid prompt.',part:'Invalid prompt item.',text:'Invalid prompt text.',lora:'Invalid LoRA or strength (−1 to 2).',duplicateCharacter:'Duplicate character instance ID.',unknownPart:'Unknown prompt item.',promptString:'Prompt must be text.',weightConflict:'Backend LoRA “{{name}}” must have the same strength in all content items.'};
resources.en.translation.batch={invalidIndex:'Invalid image index',invalidSeed:'Invalid image seed',canvas:'The browser could not create the grid image',png:'Could not create the grid PNG'};
resources.en.translation.import={
  purposes:{
    Character:{title:'Add character',name:'Character name',attach:'Add model to a character…',target:'Character',label:'Character'},
    Concept:{title:'Add concept',name:'Concept name',attach:'Add to an existing concept…',target:'Concept',label:'Concept'},
    Style:{title:'Add style',name:'Style name',attach:'Add to an existing style…',target:'Style',label:'Style'},
    Clothing:{title:'Add clothing',name:'Clothing name',attach:'Add to saved clothing…',target:'Clothing',label:'Clothing'},
    Pose:{title:'Add pose',name:'Pose name',attach:'Add to a saved pose…',target:'Pose',label:'Pose'},
    Object:{title:'Add object',name:'Object name',attach:'Add to an existing object…',target:'Object',label:'Object'},
    Background:{title:'Add background',name:'Background name',attach:'Add to an existing background…',target:'Background',label:'Background'},
    Effect:{title:'Add effect',name:'Effect name',attach:'Add to an existing effect…',target:'Effect',label:'Effect'},
    Processing:{title:'Add processing',name:'Processing name',attach:'Add to existing processing…',target:'Processing',label:'Processing'}
  },
  choosePurpose:'Choose a purpose',base:'Base model',chooseBase:'Choose or enter a name',universe:'Universe',chooseUniverse:'Enter a universe',choose:'Choose…',addLora:'Add LoRA',addModel:'Add model',name:'Name',replaceNote:'The new model will replace the character’s previous model. Their name, appearance and outfit will be preserved.',attachNote:'The model will be connected to the selected card.',retry:'Retry saving card',replaceModel:'Replace character model',attachModel:'Connect model',model:'Model',unknownType:'File type not identified',baseValue:'Base: {{name}}',baseRequired:'Specify a base model',chooseContent:'Choose what you want to add to the library.',openCharacter:'The character card will open after saving.',openCard:'The added card will open in the library after saving.',modelReady:'After adding the model, you can select it for generation.',
  checking:'Checking file…',uploading:'Uploading: {{percent}}%',uploadError:'Upload error: HTTP {{status}}',network:'Connection interrupted. The file may have been saved; check the library before retrying.',timeout:'The server did not respond. The file may have been saved; check the library before retrying.',cancelled:'Upload cancelled.',metadataWarning:'The card was saved. Civitai metadata was not loaded: {{message}}',duplicateCharacter:'This character already exists. Change the name or connect the model to them.',savingCard:'Saving card…',uploadingFile:'Uploading file…',refreshWarning:'The card was saved. The list was not refreshed: {{message}}',cardFailed:'The file was added, but the card was not saved: {{message}}',add:'Add',cancel:'Cancel',addToPrism:'Add to Prism',reading:'Reading file…',oneFile:'Choose one .safetensors file.',fileSize:'Allowed file size: up to 32 GB.',invalidHeader:'Invalid safetensors header.',metadataFailed:'Could not read metadata.',noEvidence:'No additional details provided.',noBase:'The file does not specify a base. Choose one in the file settings.',drop:'Drop the file here',release:'Release to add to Prism'
};
resources.en.translation.characters={saveHttp:'Save failed: HTTP {{status}}',invalidResponse:'Invalid response from character storage',edit:'Edit character',appearance:'Appearance',appearanceLabel:'Character appearance',technical:'Technical details',browse:'Open character library',loading:'Loading characters…',unavailable:'Characters unavailable: {{message}}. Refresh the page to retry.',sourceMissing:'The imported source has no backend name.',missing:'The selected character no longer exists.',nameRequired:'Enter a name for the new character.',duplicate:'Character “{{name}}” already exists. Change the name or select it to connect the model.',unknownAction:'Unknown action for imported character.',saveFailed:'Could not save character.',portraitHttp:'Could not assign portrait: HTTP {{status}}',portraitSaved:'Character portrait saved',saving:'Saving…',saved:'Changes saved',notSaved:'Not saved: {{message}}',none:'No character',unavailableLora:'Unavailable: {{name}}'};
resources.en.translation.category={Character:'Characters',Concept:'Concepts',Style:'Styles',Pose:'Poses',Clothing:'Clothing',Object:'Objects',Background:'Backgrounds',Utility:'Tools',Other:'Other',Effect:'Effects',Processing:'Processing',inbox:'Sources'};
resources.en.translation.contentAction={Character:'Create character',Concept:'Add concept',Style:'Add style',Pose:'Assign pose',Clothing:'Add clothing',Object:'Add object',Background:'Choose background',Effect:'Apply effect',Processing:'Apply processing',inbox:'Set up source'};
resources.en.translation.contentIntensity={Character:'Character likeness',Concept:'Concept strength',Style:'Style strength',Pose:'Pose accuracy',Clothing:'Clothing strength',Object:'Object strength',Background:'Background influence',Effect:'Effect strength',Processing:'Processing strength'};
resources.en.translation.characterEditor={
  nameRequired:'Enter a character name.',nameTaken:'This name is already in use.',deleted:'The character was deleted. Refresh the library.',setupFirst:'Set up the character first.',newVariant:'Name of the new variant',saveAppearance:'Save appearance',saveOutfit:'Save outfit',invalidVariant:'Invalid variant name.',missingCharacter:'The character is not in the library. Save its template first.',duplicateVariant:'A variant with this name already exists.',variantSaved:'Variant “{{name}}” saved in the library.',
  title:'Character setup',name:'Character name',appearance:'Appearance',appearancePlaceholder:'Face, hair and eyes of this variant…',outfit:'Outfit',editableOutfit:'Outfit being edited',outfitDescription:'Clothing and accessories',outfitPlaceholder:'Clothing and accessories for this outfit…',authorKeywords:'Author keywords',keywordsHelp:'Select a field and click the author’s tags. You can also enter or paste your own tags as a list; double-click a chip to edit it.',export:'Export .prism',deleteCharacter:'Delete character',universe:'Universe',universePlaceholder:'Enter a universe',description:'Character description',descriptionPlaceholder:'Character notes (not added to the prompt)',savedCharacter:'Saved character',technical:'Technical details',lora:'Appearance model (LoRA, optional)',loraLabel:'Character appearance model',noLora:'No additional model',missingLora:'Not installed: {{name}}',trigger:'Trigger word — shared by all variants',triggerPlaceholder:'Permanent character trigger',duplicateVariantShort:'A variant with this name already exists.',appearanceName:'Appearance name',outfitName:'Outfit name',variantName:'Variant name',add:'Add',duplicate:'Duplicate',appearanceVariant:' appearance variant',outfitVariant:' outfit',appearanceSelect:'Appearance variant',triggerTarget:'Trigger',clothingTarget:'Outfit',tagTargets:'Where to add tags',adding:'Adding: {{label}}{{variant}}',alreadyAdded:'Already added: {{labels}}',addTo:'Add to: {{label}}',noKeywords:'No author keywords. Enter your own tags in the fields above.',loraUnavailable:'Appearance model is not installed: {{name}}. You can save the character and then install the model or choose another.',deleteConfirm:'Delete character “{{name}}” and their outfits? The additional model will remain in the library.',checkName:'Check the name.',exported:'Card exported',saving:'Saving…'
};
resources.en.translation.variant={untitled:'Untitled · {{index}}',unlink:'Disable linked switching',link:'Link selected appearance and outfit',unpaired:' — the current combination has no pair',choose:'Choose: {{label}}',exclude:'Exclude',remove:'Remove',tagAction:'{{verb}} tag {{value}}',tagTitle:'{{verb}} tag',restore:'Restore',restorePrompt:'Restore to prompt',excludePrompt:'Exclude from prompt',characterTags:'Character tags',appearance:'Appearance',outfit:'Outfit',outfitDisabled:'Outfit disabled',noTags:'No tags'};
resources.en.translation.promptChar={headTitle:'Select character · Wheel: LoRA strength · Click again or press Enter for menu',headLabel:'Character {{name}}: variants and outfit',noOutfit:'No outfit',choiceTitle:'{{type}}: {{name}} · Select and use the wheel · Click again or press Enter for menu',chooseAppearance:'{{name}} · Choose appearance',chooseOutfit:'{{name}} · Choose outfit',inFrame:'In this image',options:'Character variants',variant:'Variant: {{type}}',enableOutfit:'Enable outfit',tags:'Appearance and outfit tags',saveAppearance:'Save appearance as variant',saveOutfit:'Save outfit as variant',openTemplate:'Open template in library',remove:'Remove character',done:'Done'};
resources.en.translation.promptEditor={description:'Image description',placeholder:'Describe the image…',content:'Content',noContent:'No content found',contentStrength:'Content: {{name}}, strength {{strength}}',typedContent:'{{type}}: {{name}}{{strength}}',strengthSuffix:' · strength {{strength}}',weightTitle:'{{name}} · Ctrl +/− or Ctrl+wheel: strength · Backspace: remove',contentTitle:'{{type}} · {{strengthHelp}}Backspace: remove',strengthHelp:'Ctrl +/− or Ctrl+wheel: strength · ',removeContent:'Remove content',removeNamed:'Remove content: {{name}}',character:'character',assigned:'Assigned to character',removeType:'Remove {{type}}'};
resources.en.translation.contentType={Character:'Character',Concept:'Concept',Style:'Style',Pose:'Pose',Clothing:'Clothing',Object:'Object',Background:'Background',Effect:'Effect',Processing:'Processing'};
resources.en.translation.contentRemove={Character:'character',Concept:'concept',Style:'style',Pose:'pose',Clothing:'clothing',Object:'object',Background:'background',Effect:'effect',Processing:'processing'};
resources.en.translation.library={
  title:'Library',category:'Category',categoryTitle:'Category: {{category}} · Change',changeCategory:'Change category: {{title}}',sourceCategory:'Source category: {{title}}',saving:'Saving…',noPreview:'No preview',previewUnavailable:'Preview unavailable',
  added:'Connected',more:'Details: {{title}}',universe:'Universe',source:'Appearance source',author:'Author',needsSetup:'Setup required',sourceStatus:'Source status',unavailable:'Technical source unavailable',noMatches:'No results found',empty:'The library is empty.',shown:'Showing {{visible}} of {{total}}{{error}}',all:'All',allBases:'All base models',
  searchPlaceholder:'Name, author or trigger…',search:'Search library',base:'Base model',add:'Add',addLibrary:'Add to library',createCharacter:'Create character',createHelp:'Create a character with or without an additional source',importCard:'Import .prism',loading:'Loading library…',contentUnavailable:'Content assignments unavailable: {{message}}',loadError:'Library unavailable: {{message}}',content:'content'
};
Object.assign(resources.en.translation.library,{
  descriptionMode:'Description view',description:'Description',needSubject:'Add a character to the prompt before assigning “{{name}}”.',assignSubject:'Assign to whom?',assignNamed:'Assign “{{name}}” to whom?',character:'Character',assign:'Assign',copied:'Copied',copyKeywords:'Copy all keywords',copyKeywordsFor:'Copy all keywords: {{title}}',noKeywords:'No keywords',copyPrompt:'Copy keywords:',sourceKeywords:'Source keywords',done:'Done',addCharacter:'Add character',addNamedCharacter:'Add character: {{name}}',createFrom:'Create character from {{title}}',setupSource:'Set source purpose: {{title}}',retryMetadata:'Retry downloading Civitai metadata',updateMetadata:'Update metadata from Civitai',searchingCivitai:'Searching Civitai…',updatedCivitai:'Updated from Civitai: {{title}}',coverHttp:'Could not assign cover: HTTP {{status}}',
  useImage:'Use image as…',targetType:'Target type',target:'Target',portrait:'Character portrait',cover:'Source cover',noTargets:'No targets are available for this purpose.',savingImage:'Saving image…',imageSaved:'Image saved',characterImages:'Character images',sourceImages:'Source images',currentPortrait:'Current portrait',currentCover:'Current cover',civitaiImage:'{{title}}: Civitai image',coverSaved:'Source cover saved',portraitSaved:'Portrait “{{name}}” saved',makePortrait:'Use as portrait',makeNamedPortrait:'Use as portrait for “{{name}}”',saveCharacterFirst:'Save the character first',makeCover:'Use as source cover',loadCivitai:'Load Civitai images',loadingCivitai:'Loading Civitai images…',
  close:'Close',createAnother:'Create another character',intensity:'Strength parameter',technical:'Technical details',baseVersion:'Base model and version',modelFile:'Model file',reveal:'Show file in File Explorer',tags:'Tags',triggers:'Triggers',copyTrigger:'Copy trigger',openCivitai:'Open on Civitai',newCharacter:'New character',noSource:'No additional source',cardTooLarge:'Card exceeds 2 MB.',importDraft:'The card will be saved when the editor closes. Cancel discards the import.',nameTaken:'The name is already in use. The card is open as a draft named “{{name}}”.',importError:'Could not import .prism: {{message}}'
});

resources.en.translation.gallery.frameNotAdded='The image is not yet in the gallery.';
resources.en.translation.library.warningValue='{{value}}';
resources.en.translation.contentRegistry={
  invalidResponse:'Invalid response from content storage.', keyMismatch:'The content entity key does not match its semantic ID.',
  notRegistered:'Content storage is not registered by the Prism server. Restart the backend after updating.',
  notJson:'Content storage returned a non-JSON response: HTTP {{status}}.', unavailable:'Content storage is unavailable: HTTP {{status}}',
  missingName:'The imported source has no backend name.', choosePurpose:'Choose a purpose for the LoRA.', cardName:'Enter a card name.',
  duplicate:'“{{name}}” is already in the library. Change the name or add to the existing card.',
  unknownAction:'Unknown action for the imported source.', saveFailed:'Could not save the source purpose.'
};
resources.en.translation.characterFormat={
  invalidField:'Invalid “{{field}}” field.',missing:'The file contains no character.',appearances:'Invalid appearance list.',
  variantSpaces:'The variant name has leading or trailing spaces.',appearanceMissing:'The selected appearance is missing.',appearancesMissing:'The appearance list is missing.',
  relativeLora:'The card must contain a relative LoRA name.',strength:'LoRA strength must be between −1 and 2.',outfits:'Invalid outfit list.',
  outfitSpaces:'The outfit name has leading or trailing spaces.',variantNames:'Invalid variant names.',variantName:'Invalid variant name.',
  linkMode:'Invalid link mode.',links:'Invalid variant links.',invalidPair:'Invalid or ambiguous variant pair.',outfitMissing:'The selected outfit is missing.',
  outfitEnabled:'Invalid outfit toggle.',metadata:'Invalid source metadata.',sourceUrl:'Invalid source URL.',sourceProtocol:'The source must be an HTTP or HTTPS URL.',
  invalidList:'Invalid {{key}} list.',tooLarge:'The card exceeds 2 MB.',invalidJson:'The .prism file must contain valid JSON.',unsupported:'Unsupported .prism format or version.',
  fields:{'Триггерворд':'Trigger word','Вариант внешности':'Appearance variant','Внешность':'Appearance','Комплект':'Outfit','Одежда':'Clothing','Название варианта':'Variant name','Имя':'Name','Вселенная':'Universe','Описание':'Description'}
};
resources.en.translation.contentValidation={
  object:'{{label}} must be an object.',stringArray:'{{label}} must be an array of strings.',recipes:'Compatible recipes must be non-empty and unique.',
  unknownBinding:'Unknown backend binding: {{kind}}.',loraName:'A LoRA binding requires a backend model name.',modelPath:'Invalid backend model path.',
  weight:'LoRA weight must be a finite number between −1 and 2.',bindingName:'A {{kind}} binding requires a stable name.',
  id:'Content ID must be a stable semantic ID in namespace:name form, without a file path.',unknownType:'Unknown content entity type: {{type}}.',
  namespace:'The content ID namespace must match the entity type.',displayName:'A content entity requires a display name.',scopes:'Scopes may only contain global and subject without duplicates.',
  bindings:'A content entity requires at least one backend binding.',catalogArray:'The content catalog must be an array.',duplicateId:'Duplicate content ID: {{id}}.',
  selectionId:'A semantic selection requires contentId.',missingEntity:'Content entity {{id}} is missing from the catalog.',selectionScope:'The selection scope must be global or subject.',
  scopeUnavailable:'Scope {{scope}} is unavailable for {{id}}.',subjectId:'Subject scope for {{id}} requires subjectId.',globalSubject:'Global scope does not accept subjectId.',
  incompatible:'{{id}} is incompatible with recipe {{recipe}}.',catalogRequired:'The resolver requires a content catalog.',selectionsArray:'Semantic selections must be an array.',
  recipeRequired:'A model recipe requires recipe.',conflictingWeights:'LoRA {{name}} has conflicting weights from {{first}} and {{second}}.',combinedLora:'LoRA {{name}} was combined for {{ids}}.',
  labels:{'Совместимые recipes':'Compatible recipes','Положительный prompt binding':'Positive prompt binding','Отрицательный prompt binding':'Negative prompt binding','Параметры binding':'Binding parameters','Параметры выбора':'Selection parameters'}
};

let activeLocalization=null;
export function setActiveLocalization(localization){activeLocalization=localization;}
export function translate(key,fallback,values={}) {
  return activeLocalization?.language==='en'
    ? activeLocalization.t(key,{...values,defaultValue:fallback,interpolation:{escapeValue:false}})
    : fallback;
}
export function translatePlural(key,count,fallback) {
  return activeLocalization?activeLocalization.t(key,{count,defaultValue:fallback,interpolation:{escapeValue:false}}):fallback;
}

function supportedLanguage(value) {
  if (typeof value !== 'string') return null;
  const language = value.toLowerCase().split(/[-_]/, 1)[0];
  return language === 'ru' || language === 'en' ? language : null;
}

export function createServerLanguageStore(fetchImpl = globalThis.fetch) {
  return {
    required: true,
    async getItem() {
      const response = await fetchImpl('/prism/language', {cache: 'no-store'});
      if (!response.ok) throw new Error('PRISM_LANGUAGE_READ');
      return (await response.json()).language;
    },
    async setItem(_key, language) {
      let response;
      try {
        response = await fetchImpl('/prism/language', {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({language}),
        });
      } catch (error) {
        throw new Error('PRISM_LANGUAGE_WRITE', {cause: error});
      }
      if (!response.ok) throw new Error('PRISM_LANGUAGE_WRITE');
    },
  };
}

export async function createLocalization({storage = globalThis.localStorage, installationLanguage, systemLanguage = globalThis.navigator?.language} = {}) {
  let saved;
  try { saved = await storage?.getItem(storageKey); }
  catch (error) {
    if (storage?.required) throw error;
    // Браузер может запретить доступ к хранилищу.
  }
  const language = supportedLanguage(saved) ?? supportedLanguage(installationLanguage) ?? supportedLanguage(systemLanguage) ?? 'en';
  const instance = i18next.createInstance();
  await instance.init({resources, lng: language, fallbackLng: 'en', supportedLngs: ['en', 'ru']});
  return {
    get language() { return instance.resolvedLanguage; },
    t: instance.t.bind(instance),
    async changeLanguage(value) {
      const next = supportedLanguage(value);
      if (!next) throw new RangeError('Unsupported language');
      await storage?.setItem(storageKey, next);
      await instance.changeLanguage(next);
    },
  };
}
