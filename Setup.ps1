param(
    [ValidateSet('Nvidia','CPU')][string]$Device = 'Nvidia',
    [ValidateSet('SDXL','None')][string]$Model = 'SDXL',
    [ValidateRange(0,65535)][int]$Port = 0,
    [switch]$AcceptDownloads,
    [switch]$NoLaunch,
    [switch]$Plan
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$ProgressPreference = 'SilentlyContinue'
$manifest = Get-Content -LiteralPath "$PSScriptRoot\scripts\install-manifest.json" -Raw | ConvertFrom-Json
$installLock = $null
$transcriptStarted = $false

try {
    Write-Host "Prism: отдельные Python $($manifest.python_version), ComfyUI $($manifest.comfy_release) и PyTorch $($manifest.torch_version)."
    Write-Host "Установка: $PSScriptRoot\.runtime. Кэши и журнал: $PSScriptRoot\.cache."
    Write-Host 'Windows 10/11 x64; Git и Microsoft VC++ Runtime x64. Права администратора скрипту не нужны.'
    Write-Host 'Для SDXL: 16 ГБ RAM (рекомендуется 32); NVIDIA от 8 ГБ VRAM и актуальный драйвер для CUDA 12.8.'
    Write-Host 'CPU: отдельный медленный режим без требования NVIDIA; первый кадр может занять много минут.'
    Write-Host 'Оставьте 40 ГБ свободного места: Python/ComfyUI/PyTorch, распаковка и кэши. Загрузка окружения: несколько ГБ.'
    if ($Model -eq 'SDXL') {
        Write-Host 'Дополнительно будет загружен SDXL Base от Stability AI: 6,94 ГБ. Refiner и другие модели не загружаются.'
        Write-Host "Условия использования модели: $($manifest.model.license)"
    } else { Write-Host 'Без модели. До импорта совместимого checkpoint генерация недоступна.' }
    if ($Plan) { return }
    if (-not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
        throw 'Поддерживается Windows x64. Запустите 64-разрядный Windows PowerShell.'
    }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'PRISM_GIT: установите Git for Windows https://git-scm.com/download/win и откройте PowerShell заново.'
    }
    $runtime = Join-Path $PSScriptRoot '.runtime'
    $marker = Join-Path $runtime 'prism-install.json'
    $existingInstall = $null
    if (Test-Path -LiteralPath $marker) {
        $existingInstall = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
        if ($existingInstall.root -ne $PSScriptRoot -or $existingInstall.device -ne $Device.ToLowerInvariant()) {
            throw 'PRISM_PROFILE_CHANGED: путь или устройство изменились. Используйте отдельную папку.'
        }
    } elseif ((Test-Path -LiteralPath $runtime) -and @(Get-ChildItem -LiteralPath $runtime -Force).Count) {
        throw 'PRISM_FOREIGN_RUNTIME: каталог .runtime уже содержит чужие файлы. Выберите пустую папку.'
    }
    $localConfig = Join-Path $PSScriptRoot 'app\prism.local.json'
    $config = if (Test-Path -LiteralPath $localConfig) { $localConfig } else { Join-Path $PSScriptRoot 'app\prism.json' }
    if (Test-Path -LiteralPath $config) {
        $settings = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
        $backend = if ([IO.Path]::IsPathRooted($settings.backend_root)) { [IO.Path]::GetFullPath($settings.backend_root) } else { [IO.Path]::GetFullPath((Join-Path "$PSScriptRoot\app" $settings.backend_root)) }
        if ($backend -ne (Join-Path $runtime 'ComfyUI') -and ((Test-Path -LiteralPath $backend) -or $config -eq $localConfig)) {
            throw 'PRISM_EXISTING_CONFIG: уже настроен другой ComfyUI. Для новой установки используйте другую папку.'
        }
    }
    if (-not (Test-Path -LiteralPath "$env:WINDIR\System32\vcruntime140_1.dll")) {
        throw 'PRISM_VC_RUNTIME: установите Microsoft VC++ Redistributable x64 https://aka.ms/vc14/vc_redist.x64.exe'
    }
    $ram = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
    if ($ram -lt 15GB) { throw 'PRISM_RAM: для начального профиля SDXL требуется компьютер с 16 ГБ RAM или больше.' }
    if ($Device -eq 'Nvidia') {
        $adapters = @(Get-CimInstance Win32_VideoController | Where-Object Name -Match 'NVIDIA')
        if (-not $adapters.Count) { throw 'PRISM_GPU: NVIDIA не обнаружена. Для CPU повторите с -Device CPU. AMD/Intel этим установщиком не настраиваются.' }
        Write-Host "Видеоадаптер: $($adapters.Name -join ', '). CUDA и объём VRAM будут проверены установленным PyTorch."
    }
    # Переиспользуем блокировку лончера: зависимостями нельзя заниматься, пока backend ещё запускается без слушающего порта.
    $launcherCache = Join-Path $PSScriptRoot 'app\.cache\runtime'
    New-Item -ItemType Directory -Path $launcherCache -Force | Out-Null
    try { $installLock = [IO.File]::Open("$launcherCache\launcher.lock", 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'PRISM_INSTALL_BUSY: установка или запуск Prism уже выполняется. Дождитесь завершения и повторите Setup.' }
    $free = ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($PSScriptRoot))).AvailableFreeSpace
    $required = 40GB
    if ($null -ne $existingInstall) {
        $required = 3GB
        $modelPath = Join-Path $runtime "models\StableDiffusion\$($manifest.model.name)"
        if ($Model -eq 'SDXL' -and -not (Test-Path -LiteralPath $modelPath)) {
            $partialSize = if (Test-Path -LiteralPath "$modelPath.part") { (Get-Item -LiteralPath "$modelPath.part").Length } else { 0 }
            $required += [math]::Max(0, $manifest.model.bytes - $partialSize)
        }
        if (-not (Test-Path -LiteralPath "$runtime\venv\Scripts\python.exe")) { $required = 40GB }
    }
    if ($free -lt $required) { throw "PRISM_DISK: свободно $([math]::Round($free/1GB,1)) ГБ; требуется ещё $([math]::Round($required/1GB,1)) ГБ." }
    if (-not $AcceptDownloads) {
        $answer = Read-Host 'Загрузить и установить указанные компоненты? Ознакомьтесь с лицензией модели. Введите Y для продолжения'
        if ($answer -notmatch '^(y|yes|д|да)$') { Write-Host 'Установка отменена.'; return }
    }
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
        if ($process.ExitCode -ne 0) { throw "PRISM_COMMAND: $Executable завершился с кодом $($process.ExitCode). Повторите Setup.ps1 после устранения ошибки выше." }
        return ($lines -join "`n")
    }

    $uvRoot = "$bootstrap\uv-$($manifest.uv_version)"
    $uv = "$uvRoot\uv.exe"
    if (-not (Test-Path -LiteralPath $uv)) {
        $archive = "$bootstrap\uv-$($manifest.uv_version).zip"
        $download = "$archive.part"
        Write-Host 'Загрузка uv из официального релиза Astral...'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/astral-sh/uv/releases/download/$($manifest.uv_version)/uv-x86_64-pc-windows-msvc.zip" -OutFile $download
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $manifest.uv_sha256) { throw 'PRISM_UV_HASH: контрольная сумма uv не совпала. Установка остановлена.' }
        Move-Item -LiteralPath $download -Destination $archive -Force
        Expand-Archive -LiteralPath $archive -DestinationPath $uvRoot -Force
    }
    $null = Invoke-Hidden $uv @('python', 'install', $manifest.python_version, '--no-bin', '--no-registry', '--no-config')
    $bootstrapPython = Invoke-Hidden $uv @('python', 'find', '--managed-python', $manifest.python_version, '--no-config')
    $arguments = @('-I', '-X', 'utf8', '-X', "pycache_prefix=$PSScriptRoot\.cache\pycache", "$PSScriptRoot\scripts\install.py", '--root', $PSScriptRoot, '--uv', $uv, '--device', $Device.ToLowerInvariant(), '--model', $Model.ToLowerInvariant())
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
