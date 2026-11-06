param(
    [ValidateSet('Nvidia','CPU')][string]$Device = 'Nvidia',
    [ValidateSet('en','ru')][string]$Language,
    [ValidateSet('SDXL','None')][string]$Model = 'None',
    [switch]$Upscaler,
    [switch]$AnimeUpscaler,
    [ValidateRange(0,65535)][int]$Port = 0,
    [switch]$AcceptDownloads,
    [switch]$NoLaunch,
    [switch]$Plan
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$ProgressPreference = 'SilentlyContinue'
. "$PSScriptRoot\app\Language.ps1"
if (-not $Language) { $Language = Get-PrismLanguage "$PSScriptRoot\app" }
$env:PRISM_LANGUAGE = $Language
$strings = if ($Language -eq 'ru') { @{
    setup='Установка Prism'; folder='Папка'; profile='Профиль'; environment='Окружение'; caches='Кэши и журнал'; system='Системные компоненты'; component='Компонент'; value='Значение'; optional='Дополнительные модели'; model='Модель'; purpose='Назначение'; download='Загрузка'; generation='Генерация'; upscale='Апскейл изображений'; anime='Апскейл аниме'; prompt='Номера моделей через запятую (Enter — без моделей)'; invalid='Введите номера из таблицы.'; none='без моделей'; selected='Выбрано'; terms='Условия'; reserve='Запас для окружения'; remaining='Осталось скачать моделей'; required='Требуется свободного места'; free='Свободно'; disk='Диск'; space='Место'; gb='ГБ'; mb='МБ'; gib='ГиБ'; windows='Поддерживается Windows x64. Запустите 64-разрядный Windows PowerShell.'; git='PRISM_GIT: установите Git for Windows https://git-scm.com/download/win и откройте PowerShell заново.'; profileChanged='PRISM_PROFILE_CHANGED: путь или устройство изменились. Используйте отдельную папку.'; foreign='PRISM_FOREIGN_RUNTIME: каталог .runtime уже содержит чужие файлы. Выберите пустую папку.'; existing='PRISM_EXISTING_CONFIG: уже настроен другой ComfyUI. Для новой установки используйте другую папку.'; vc='PRISM_VC_RUNTIME: установите Microsoft VC++ Redistributable x64 https://aka.ms/vc14/vc_redist.x64.exe'; ram='PRISM_RAM: для начального профиля SDXL требуется компьютер с 16 ГБ RAM или больше.'; gpu='PRISM_GPU: NVIDIA не обнаружена. Для CPU повторите с -Device CPU. AMD/Intel этим установщиком не настраиваются.'; busy='PRISM_INSTALL_BUSY: установка или запуск Prism уже выполняется. Дождитесь завершения и повторите Setup.'; noSpace='PRISM_DISK: недостаточно свободного места для установки и выбранных моделей.'; confirm='Продолжить установку? [y/N]'; cancelled='Установка отменена.'; command='PRISM_COMMAND: {0} завершился с кодом {1}. Повторите Setup.ps1 после устранения ошибки выше.'; fetchingUv='Загрузка uv из официального релиза Astral...'; uvHash='PRISM_UV_HASH: контрольная сумма uv не совпала. Установка остановлена.'
} } else { @{
    setup='Prism setup'; folder='Folder'; profile='Profile'; environment='Environment'; caches='Cache and log'; system='System components'; component='Component'; value='Value'; optional='Optional models'; model='Model'; purpose='Purpose'; download='Download'; generation='Generation'; upscale='Image upscaling'; anime='Anime upscaling'; prompt='Model numbers separated by commas (Enter for no models)'; invalid='Enter numbers from the table.'; none='no models'; selected='Selected'; terms='Terms'; reserve='Environment space'; remaining='Models left to download'; required='Free space required'; free='Available'; disk='Disk'; space='Space'; gb='GB'; mb='MB'; gib='GiB'; windows='Windows x64 is required. Run 64-bit Windows PowerShell.'; git='PRISM_GIT: install Git for Windows from https://git-scm.com/download/win and reopen PowerShell.'; profileChanged='PRISM_PROFILE_CHANGED: the path or device changed. Use a separate folder.'; foreign='PRISM_FOREIGN_RUNTIME: .runtime already contains unrelated files. Choose an empty folder.'; existing='PRISM_EXISTING_CONFIG: another ComfyUI is already configured. Use a separate folder for a new installation.'; vc='PRISM_VC_RUNTIME: install Microsoft VC++ Redistributable x64 from https://aka.ms/vc14/vc_redist.x64.exe'; ram='PRISM_RAM: the starter SDXL profile requires at least 16 GB RAM.'; gpu='PRISM_GPU: NVIDIA was not detected. For CPU, retry with -Device CPU. This installer does not configure AMD or Intel GPUs.'; busy='PRISM_INSTALL_BUSY: Prism is already installing or starting. Wait for it to finish and retry Setup.'; noSpace='PRISM_DISK: insufficient free space for the installation and selected models.'; confirm='Continue installation? [y/N]'; cancelled='Installation cancelled.'; command='PRISM_COMMAND: {0} exited with code {1}. Resolve the error above and retry Setup.ps1.'; fetchingUv='Downloading uv from the official Astral release...'; uvHash='PRISM_UV_HASH: the uv checksum did not match. Setup stopped.'
} }
$manifest = Get-Content -LiteralPath "$PSScriptRoot\scripts\install-manifest.json" -Raw | ConvertFrom-Json
$installLock = $null
$transcriptStarted = $false

$choices = @(
    [pscustomobject]@{ Number = '1'; Key = 'sdxl'; Label = 'SDXL Base'; Use = $strings.generation; Directory = 'StableDiffusion'; Entry = $manifest.model }
    [pscustomobject]@{ Number = '2'; Key = 'upscale'; Label = 'Real-ESRGAN ×4'; Use = $strings.upscale; Directory = $manifest.optional_models.upscale.directory; Entry = $manifest.optional_models.upscale }
    [pscustomobject]@{ Number = '3'; Key = 'anime'; Label = 'Real-ESRGAN Anime ×4'; Use = $strings.anime; Directory = $manifest.optional_models.anime.directory; Entry = $manifest.optional_models.anime }
)
$selected = @(
    if ($Model -eq 'SDXL') { 'sdxl' }
    if ($Upscaler) { 'upscale' }
    if ($AnimeUpscaler) { 'anime' }
)

function Format-DownloadSize([long]$Bytes) {
    if ($Bytes -ge 1e9) { return ('{0:N2} {1}' -f ($Bytes / 1e9), $strings.gb) }
    return ('{0:N1} {1}' -f ($Bytes / 1e6), $strings.mb)
}

try {
    Write-Host $strings.setup
    Write-Host "$($strings.folder): $PSScriptRoot"
    ([ordered]@{
        ($strings.profile) = $Device.ToUpperInvariant()
        'Python' = $manifest.python_version
        'ComfyUI' = $manifest.comfy_release
        'PyTorch' = $manifest.torch_version
        ($strings.environment) = '.runtime'
        ($strings.caches) = '.cache'
        'Windows' = '10/11 x64'
        ($strings.system) = 'Git, VC++ x64'
    }).GetEnumerator() | Format-Table @{Name=$strings.component;Expression={$_.Key}}, @{Name=$strings.value;Expression={$_.Value}} -AutoSize | Out-Host
    Write-Host $strings.optional
    $choices | Format-Table @{Name='№';Expression={$_.Number}},
        @{Name=$strings.model;Expression={$_.Label}}, @{Name=$strings.purpose;Expression={$_.Use}},
        @{Name=$strings.download;Expression={Format-DownloadSize $_.Entry.bytes}} -AutoSize | Out-Host
    if (-not $Plan -and -not $AcceptDownloads -and -not $PSBoundParameters.ContainsKey('Model') -and -not $selected.Count) {
        do {
            $answer = Read-Host $strings.prompt
            $numbers = @(if ($answer.Trim()) { $answer.Trim() -split '\s*,\s*' })
            $invalid = @($numbers | Where-Object { $_ -notin $choices.Number })
            if ($invalid.Count) { Write-Host $strings.invalid }
        } while ($invalid.Count)
        $selected = @($choices | Where-Object Number -In $numbers | Select-Object -ExpandProperty Key)
    }
    $selectedChoices = @($choices | Where-Object Key -In $selected)
    $selection = if ($selectedChoices.Count) { $selectedChoices.Label -join ', ' } else { $strings.none }
    Write-Host "$($strings.selected): $selection"
    $selectedChoices | Select-Object -ExpandProperty Entry | Select-Object -ExpandProperty license -Unique |
        ForEach-Object { Write-Host "$($strings.terms): $_" }
    $runtime = Join-Path $PSScriptRoot '.runtime'
    $marker = Join-Path $runtime 'prism-install.json'
    $existingInstall = if (Test-Path -LiteralPath $marker -PathType Leaf) {
        Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
    }
    $environmentSpace = if ($Device -eq 'CPU') { 5GB } else { 14GB }
    if ($existingInstall -and $existingInstall.PSObject.Properties['complete'] -and $existingInstall.complete -and
        $existingInstall.device -eq $Device.ToLowerInvariant() -and
        (Test-Path -LiteralPath "$runtime\venv\Scripts\python.exe" -PathType Leaf)) {
        $environmentSpace = 3GB
    }
    $modelSpace = 0L
    foreach ($choice in $selectedChoices) {
        $entry = $choice.Entry
        $modelPath = Join-Path $runtime ("models\{0}\{1}" -f $choice.Directory, $entry.name)
        if (Test-Path -LiteralPath $modelPath -PathType Leaf) { continue }
        $partialSize = if (Test-Path -LiteralPath "$modelPath.part" -PathType Leaf) {
            (Get-Item -LiteralPath "$modelPath.part").Length
        } else { 0 }
        $modelSpace += [math]::Max(0L, [long]$entry.bytes - $partialSize)
    }
    $required = $environmentSpace + $modelSpace
    $free = ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($PSScriptRoot))).AvailableFreeSpace
    ([ordered]@{
        ($strings.reserve) = '{0:N1} {1}' -f ($environmentSpace / 1GB), $strings.gib
        ($strings.remaining) = Format-DownloadSize $modelSpace
        ($strings.required) = '{0:N1} {1}' -f ($required / 1GB), $strings.gib
        ($strings.free) = '{0:N1} {1}' -f ($free / 1GB), $strings.gib
    }).GetEnumerator() | Format-Table @{Name=$strings.disk;Expression={$_.Key}}, @{Name=$strings.space;Expression={$_.Value}} -AutoSize | Out-Host
    if ($Plan) { return }
    if (-not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
        throw $strings.windows
    }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw $strings.git
    }
    if ($null -ne $existingInstall) {
        if ($existingInstall.root -ne $PSScriptRoot -or $existingInstall.device -ne $Device.ToLowerInvariant()) {
            throw $strings.profileChanged
        }
    } elseif ((Test-Path -LiteralPath $runtime) -and @(Get-ChildItem -LiteralPath $runtime -Force).Count) {
        throw $strings.foreign
    }
    $localConfig = Join-Path $PSScriptRoot 'app\prism.local.json'
    if (Test-Path -LiteralPath $localConfig) {
        $settings = Get-Content -LiteralPath $localConfig -Raw | ConvertFrom-Json
        $backend = if ([IO.Path]::IsPathRooted($settings.backend_root)) { [IO.Path]::GetFullPath($settings.backend_root) } else { [IO.Path]::GetFullPath((Join-Path "$PSScriptRoot\app" $settings.backend_root)) }
        if ($backend -ne (Join-Path $runtime 'ComfyUI')) {
            throw $strings.existing
        }
    }
    if (-not (Test-Path -LiteralPath "$env:WINDIR\System32\vcruntime140_1.dll")) {
        throw $strings.vc
    }
    $ram = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
    if ($ram -lt 15GB) { throw $strings.ram }
    if ($Device -eq 'Nvidia') {
        $adapters = @(Get-CimInstance Win32_VideoController | Where-Object Name -Match 'NVIDIA')
        if (-not $adapters.Count) { throw $strings.gpu }
    }
    # Переиспользуем блокировку лончера: зависимостями нельзя заниматься, пока backend ещё запускается без слушающего порта.
    $launcherCache = Join-Path $PSScriptRoot 'app\.cache\runtime'
    New-Item -ItemType Directory -Path $launcherCache -Force | Out-Null
    try { $installLock = [IO.File]::Open("$launcherCache\launcher.lock", 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw $strings.busy }
    if ($free -lt $required) { throw $strings.noSpace }
    if (-not $AcceptDownloads) {
        $answer = Read-Host $strings.confirm
        if ($answer -notmatch '^(y|yes|д|да)$') { Write-Host $strings.cancelled; return }
    }
    Set-PrismLanguage "$PSScriptRoot\app" $Language
    $bootstrap = Join-Path $PSScriptRoot '.cache\bootstrap'
    New-Item -ItemType Directory -Path $bootstrap -Force | Out-Null
    Start-Transcript -LiteralPath "$bootstrap\setup.log" -Append | Out-Null
    $transcriptStarted = $true
    Get-ChildItem Env: | Where-Object Name -Match '^(UV_|PIP_|PYTHON|CONDA)' | ForEach-Object {
        [Environment]::SetEnvironmentVariable($_.Name, $null, 'Process')
    }
    $env:UV_CACHE_DIR = "$PSScriptRoot\.cache\uv"
    $env:UV_PYTHON_INSTALL_DIR = "$bootstrap\python"
    $env:UV_PYTHON_CACHE_DIR = "$PSScriptRoot\.cache\python-downloads"
    $env:UV_PYTHON_INSTALL_BIN = '0'
    $env:UV_PYTHON_INSTALL_REGISTRY = '0'
    $env:UV_PYTHON_NO_REGISTRY = '1'
    $env:UV_NO_MODIFY_PATH = '1'
    $env:UV_NO_CONFIG = '1'
    $env:UV_MANAGED_PYTHON = '1'
    $env:PYTHONNOUSERSITE = '1'
    $env:PYTHONUTF8 = '1'
    $env:PYTHONPYCACHEPREFIX = "$PSScriptRoot\.cache\pycache"
    $env:PIP_CACHE_DIR = "$PSScriptRoot\.cache\pip"
    $env:PIP_CONFIG_FILE = 'NUL'
    $env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
    $env:UV_LINK_MODE = 'copy'
    $env:TEMP = "$PSScriptRoot\.cache\tmp"
    $env:TMP = $env:TEMP
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
    Remove-Item Env:PYTHONPATH, Env:PYTHONHOME, Env:VIRTUAL_ENV, Env:CONDA_PREFIX -ErrorAction SilentlyContinue

    function Invoke-Hidden([string]$Executable, [string[]]$Arguments) {
        $info = [Diagnostics.ProcessStartInfo]::new()
        $info.FileName = $Executable
        $info.WorkingDirectory = $PSScriptRoot
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
        # Аргументы Windows CRT: сохраняем пробелы и завершающие обратные слеши.
        $info.Arguments = ($Arguments | ForEach-Object { '"' + ([regex]::Replace([regex]::Replace($_, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1')) + '"' }) -join ' '
        $process = [Diagnostics.Process]::Start($info)
        $errorsTask = $process.StandardError.ReadToEndAsync()
        $lines = [Collections.Generic.List[string]]::new()
        while (-not $process.StandardOutput.EndOfStream) {
            $line = $process.StandardOutput.ReadLine()
            $lines.Add($line)
            Write-Host $line
        }
        $process.WaitForExit()
        $errors = $errorsTask.Result
        if ($errors) { Write-Host $errors }
        if ($process.ExitCode -ne 0) { throw ($strings.command -f $Executable, $process.ExitCode) }
        return ($lines -join "`n")
    }

    $uvRoot = "$bootstrap\uv-$($manifest.uv_version)"
    $uv = "$uvRoot\uv.exe"
    if (-not (Test-Path -LiteralPath $uv)) {
        $archive = "$bootstrap\uv-$($manifest.uv_version).zip"
        $download = "$archive.part"
        Write-Host $strings.fetchingUv
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/astral-sh/uv/releases/download/$($manifest.uv_version)/uv-x86_64-pc-windows-msvc.zip" -OutFile $download
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $manifest.uv_sha256) { throw $strings.uvHash }
        Move-Item -LiteralPath $download -Destination $archive -Force
        Expand-Archive -LiteralPath $archive -DestinationPath $uvRoot -Force
    }
    $null = Invoke-Hidden $uv @('python', 'install', $manifest.python_version, '--no-bin', '--no-registry', '--no-config')
    $bootstrapPython = Invoke-Hidden $uv @('python', 'find', '--managed-python', $manifest.python_version, '--no-config')
    $modelArgument = if ($selected.Count) { $selected -join ',' } else { 'none' }
    $arguments = @('-I', '-X', 'utf8', '-X', "pycache_prefix=$PSScriptRoot\.cache\pycache", "$PSScriptRoot\scripts\install.py", '--root', $PSScriptRoot, '--uv', $uv, '--device', $Device.ToLowerInvariant(), '--model', $modelArgument)
    if ($Port) { $arguments += @('--port', "$Port") }
    $null = Invoke-Hidden $bootstrapPython.Trim() $arguments
    $installLock.Dispose()
    $installLock = $null
    if (-not $NoLaunch) { & "$PSScriptRoot\app\Start.ps1" }
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if ($null -ne $installLock) { $installLock.Dispose() }
    if ($transcriptStarted) { try { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null } catch { } }
}
