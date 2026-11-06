param(
    [ValidateSet('Start','Status','Stop','CheckUpdate','Update')][string]$Action = 'Start',
    [string]$Config = "$PSScriptRoot\prism.local.json",
    [switch]$NoBrowser
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
. "$PSScriptRoot\Language.ps1"
$prismLanguage = Get-PrismLanguage $PSScriptRoot
function Get-LauncherText([string]$Russian, [string]$English) {
    if ($prismLanguage -eq 'ru') { return $Russian }
    return $English
}

function Resolve-AppPath([string]$Path) {
    if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
    return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Path))
}
function Test-Ready {
    try {
        $stats = Invoke-RestMethod "$url/system_stats" -TimeoutSec 2
        $identity = Invoke-RestMethod "$url/prism/runtime" -TimeoutSec 2
        return ($null -ne $stats.system.PSObject.Properties['comfyui_version'] -and $identity.service -eq 'prism')
    } catch { return $false }
}
function Get-ConfiguredProcessRoot($Process) {
    if ($null -eq $Process -or $Process.CommandLine -notmatch 'main\.py') { return $null }
    if ($Process.ExecutablePath -eq $python) { return $Process }
    # Windows venv запускает базовый интерпретатор через redirector. Сам по себе общий Python не доказывает принадлежность среде.
    if ([IO.Path]::GetFileName($Process.ExecutablePath) -notin @('python.exe','pythonw.exe')) { return $null }
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.ParentProcessId)"
    if ($null -ne $parent -and $parent.ExecutablePath -eq $python -and $parent.CommandLine -match 'main\.py') { return $parent }
    return $null
}

$lifetime = $null
try {
    if (-not (Test-Path -LiteralPath $Config -PathType Leaf)) {
        throw (Get-LauncherText "PRISM_CONFIG_MISSING: не найден $Config. Откройте Setup.bat и выберите способ установки. Для ручного подключения заполните app/prism.local.json по примеру app/prism.example.json." "PRISM_CONFIG_MISSING: $Config was not found. Open Setup.bat and choose an installation method. To connect manually, fill in app/prism.local.json using app/prism.example.json.")
    }
    $settings = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
    $comfyRoot = Resolve-AppPath $settings.backend_root
    $python = Resolve-AppPath $settings.python
    $models = Resolve-AppPath $settings.models_root
    if ($Action -eq 'Start' -and $settings.PSObject.Properties['managed_install'] -and $settings.managed_install) {
        $installMarker = Join-Path (Split-Path -Parent $comfyRoot) 'prism-install.json'
        if (-not (Test-Path -LiteralPath $installMarker) -or -not (Get-Content -LiteralPath $installMarker -Raw | ConvertFrom-Json).complete) {
            throw (Get-LauncherText 'PRISM_SETUP_INCOMPLETE: установка не завершена. Повторите Setup.ps1 с прежними параметрами.' 'PRISM_SETUP_INCOMPLETE: installation is incomplete. Run Setup.ps1 again with the same arguments.')
        }
    }
    $port = [int]$settings.port
    if ($port -lt 1024 -or $port -gt 65535) { throw (Get-LauncherText 'Порт должен быть в диапазоне 1024–65535.' 'The port must be between 1024 and 65535.') }
    $url = "http://127.0.0.1:$port"
    $cache = Join-Path $PSScriptRoot '.cache'
    $logs = Join-Path $cache 'runtime'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $variables = @{
        PYTHONPYCACHEPREFIX = "$cache\pycache"; PIP_CACHE_DIR = "$cache\pip"
        UV_CACHE_DIR = "$cache\uv"; HF_HOME = "$cache\huggingface"
        TORCH_HOME = "$cache\torch"; XDG_CACHE_HOME = $cache
        TORCHINDUCTOR_CACHE_DIR = "$cache\torchinductor"; TRITON_CACHE_DIR = "$cache\triton"
        CUDA_CACHE_PATH = "$cache\cuda"; TEMP = "$cache\tmp"; TMP = "$cache\tmp"
        MPLCONFIGDIR = "$cache\matplotlib"; NUMBA_CACHE_DIR = "$cache\numba"
        YOLO_CONFIG_DIR = $cache; YOLO_OFFLINE = '1'; YOLO_AUTOINSTALL = '0'
        HF_HUB_OFFLINE = '1'; NO_ALBUMENTATIONS_UPDATE = '1'
        PIP_DISABLE_PIP_VERSION_CHECK = '1'; PYTHONUNBUFFERED = '1'
        PYTHONNOUSERSITE = '1'; PYTHONUTF8 = '1'
    }
    foreach ($name in $variables.Keys) { [Environment]::SetEnvironmentVariable($name, $variables[$name], 'Process') }
    New-Item -ItemType Directory -Path "$cache\tmp" -Force | Out-Null
    if ($Action -eq 'Status') {
        if (-not (Test-Ready)) { throw (Get-LauncherText 'Prism не готов: нет ComfyUI или на порту другой сервис.' 'Prism is not ready: ComfyUI is unavailable or another service is using the port.') }
        Write-Output (Get-LauncherText "Prism готов: $url/prism/" "Prism is ready: $url/prism/")
        exit 0
    }
    $lock = [IO.File]::Open("$logs\launcher.lock", 'OpenOrCreate', 'ReadWrite', 'None')
    try {
        if ($Action -in @('CheckUpdate','Update')) {
            & "$PSScriptRoot\Update.ps1" -CheckOnly:($Action -eq 'CheckUpdate')
            exit 0
        }
        $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        if ($Action -eq 'Stop') {
            if (-not $listeners.Count) { Write-Output (Get-LauncherText 'Backend уже остановлен.' 'The backend is already stopped.'); exit 0 }
            $ownerIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
            if ($ownerIds.Count -ne 1) { throw (Get-LauncherText 'Порт обслуживают несколько процессов; они не будут остановлены.' 'Multiple processes are listening on the port; they will not be stopped.') }
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($ownerIds[0])"
            if ($null -eq (Get-ConfiguredProcessRoot $owner)) { throw (Get-LauncherText 'Процесс не принадлежит настроенному ComfyUI.' 'The process does not belong to the configured ComfyUI.') }
            $queue = Invoke-RestMethod "$url/queue" -TimeoutSec 5
            if ($queue.queue_running.Count -or $queue.queue_pending.Count) { throw (Get-LauncherText 'Очередь не пуста; завершите задания перед остановкой.' 'The queue is not empty; finish the jobs before stopping.') }
            Stop-Process -Id $owner.ProcessId
            Wait-Process -Id $owner.ProcessId -Timeout 20 -ErrorAction SilentlyContinue
            Write-Output (Get-LauncherText 'ComfyUI остановлен.' 'ComfyUI stopped.')
            exit 0
        }
        if (Test-Path -LiteralPath "$logs\update-incomplete.txt") { throw (Get-LauncherText 'Предыдущее обновление не завершено. См. .cache/runtime/update-incomplete.txt.' 'The previous update did not finish. See .cache/runtime/update-incomplete.txt.') }
        if (-not ('PrismProcessJob' -as [type])) { Add-Type -Path "$PSScriptRoot\ProcessLifetime.cs" }
        $lifetime = [PrismProcessJob]::new()
        if ($listeners.Count) {
            if (-not (Test-Ready)) { throw (Get-LauncherText "Порт $port занят другим или ещё не готовым сервисом." "Port $port is occupied by another service or one that is not ready yet.") }
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listeners[0].OwningProcess)"
            $processRoot = Get-ConfiguredProcessRoot $owner
            if ($null -eq $processRoot) { throw (Get-LauncherText 'На порту ComfyUI из другой Python-среды.' 'ComfyUI on this port uses a different Python environment.') }
            $lifetime.Assign([int]$processRoot.ProcessId)
            # У redirector уже есть собственная Job для дочернего Python; закрытие родителя завершает и её.
        } else {
            $starting = @(Get-CimInstance Win32_Process | Where-Object {
                if ($_.ExecutablePath -ne $python -or $_.CommandLine -notmatch 'main\.py') { return $false }
                # Независимый backend на другом порту не блокирует эту установку.
                $backendPort = [regex]::Match($_.CommandLine, '(?:^|\s)--port(?:=|\s+)["'']?(\d+)')
                if ($backendPort.Success) { return ([int]$backendPort.Groups[1].Value -eq $port) }
                return ($port -eq 8188)
            })
            if ($starting.Count) { throw (Get-LauncherText 'PRISM_STARTING: backend уже запущен, но ещё не готов. Проверьте журнал; второй процесс не создан.' 'PRISM_STARTING: the backend is already starting but is not ready. Check the log; a second process was not started.') }
            foreach ($path in @($python, "$comfyRoot\main.py", $models)) {
                if (-not (Test-Path -LiteralPath $path)) { throw (Get-LauncherText "Не найдено: $path. Для новой установки запустите Setup.ps1 из корня Prism; для существующей проверьте $Config." "Not found: $path. For a new installation, run Setup.ps1 from the Prism root; otherwise, check $Config.") }
            }
            $bridge = Join-Path $comfyRoot 'custom_nodes\prism'
            if (-not (Test-Path -LiteralPath $bridge)) {
                New-Item -ItemType Junction -Path $bridge -Target $PSScriptRoot | Out-Null
            } elseif ((Get-Item -LiteralPath $bridge).LinkType -ne 'Junction' -or (Get-Item -LiteralPath $bridge).Target -ne $PSScriptRoot) {
                throw (Get-LauncherText "Каталог $bridge уже принадлежит другой установке." "The directory $bridge already belongs to another installation.")
            }
            $paths = Get-Content -LiteralPath "$PSScriptRoot\model-paths.json" -Raw | ConvertFrom-Json
            $paths.prism.base_path = $models
            $paths | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$logs\model-paths.yaml" -Encoding utf8
            $listenAddresses = '127.0.0.1'
            if ($settings.lan_interface) {
                $lan = Get-NetIPAddress -InterfaceAlias $settings.lan_interface -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                    Where-Object AddressState -eq 'Preferred' | Select-Object -First 1 -ExpandProperty IPAddress
                if ($lan) { $listenAddresses += ",$lan" }
            }
            $arguments = @('main.py','--listen',$listenAddresses,'--port',"$port",'--extra-model-paths-config',"`"$logs\model-paths.yaml`"") + $settings.arguments
            Write-Output (Get-LauncherText "Запускаю ComfyUI и ожидаю готовности. Журнал: $logs\server.stderr.log" "Starting ComfyUI and waiting for it to become ready. Log: $logs\server.stderr.log")
            $server = Start-Process -FilePath $python -WorkingDirectory $comfyRoot -WindowStyle Hidden -PassThru `
                -ArgumentList $arguments -RedirectStandardOutput "$logs\server.stdout.log" -RedirectStandardError "$logs\server.stderr.log"
            try { $lifetime.Assign($server.Id) }
            catch {
                & taskkill.exe /PID $server.Id /T /F | Out-Null
                throw
            }
            $server.Id | Set-Content -LiteralPath "$logs\server.pid"
            $deadline = [DateTime]::UtcNow.AddSeconds([int]$settings.startup_timeout_seconds)
            while (-not (Test-Ready)) {
                $server.Refresh()
                if ($server.HasExited) { throw (Get-LauncherText "ComfyUI завершился. См. $logs\server.stderr.log" "ComfyUI exited. See $logs\server.stderr.log") }
                if ([DateTime]::UtcNow -gt $deadline) { throw (Get-LauncherText "Истекло ожидание запуска. См. $logs\server.stderr.log" "Startup timed out. See $logs\server.stderr.log") }
                Start-Sleep -Milliseconds 700
            }
        }
        Write-Output (Get-LauncherText "Prism готов: $url/prism/" "Prism is ready: $url/prism/")
        if (-not $NoBrowser) { Start-Process "$url/prism/" }
    } finally { $lock.Dispose() }
    & "$PSScriptRoot\Show-Logs.ps1" -LogDirectory $logs
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if ($null -ne $lifetime) { $lifetime.Dispose() }
}
