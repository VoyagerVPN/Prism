param(
    [ValidateSet('Start','Status','Stop','CheckUpdate','Update')][string]$Action = 'Start',
    [string]$Config = "$PSScriptRoot\prism.json",
    [switch]$NoBrowser
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()

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

try {
    $settings = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
    $comfyRoot = Resolve-AppPath $settings.backend_root
    $python = Resolve-AppPath $settings.python
    $models = Resolve-AppPath $settings.models_root
    $port = [int]$settings.port
    if ($port -lt 1024 -or $port -gt 65535) { throw 'Порт должен быть в диапазоне 1024–65535.' }
    $url = "http://127.0.0.1:$port"
    $cache = Join-Path $PSScriptRoot '.cache'
    $logs = Join-Path $cache 'runtime'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $variables = @{
        PYTHONPYCACHEPREFIX = "$cache\pycache"; PIP_CACHE_DIR = "$cache\pip"
        UV_CACHE_DIR = "$cache\uv"; HF_HOME = "$cache\huggingface"
        TORCH_HOME = "$cache\torch"; XDG_CACHE_HOME = $cache
        MPLCONFIGDIR = "$cache\matplotlib"; NUMBA_CACHE_DIR = "$cache\numba"
        YOLO_CONFIG_DIR = $cache; YOLO_OFFLINE = '1'; YOLO_AUTOINSTALL = '0'
        HF_HUB_OFFLINE = '1'; NO_ALBUMENTATIONS_UPDATE = '1'
        PIP_DISABLE_PIP_VERSION_CHECK = '1'; PYTHONUNBUFFERED = '1'
    }
    foreach ($name in $variables.Keys) { [Environment]::SetEnvironmentVariable($name, $variables[$name], 'Process') }
    if ($Action -eq 'Status') {
        if (-not (Test-Ready)) { throw 'Prism не готов: нет ComfyUI или на порту другой сервис.' }
        Write-Output "Prism готов: $url/prism/"
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
            if (-not $listeners.Count) { Write-Output 'Backend уже остановлен.'; exit 0 }
            $ownerIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
            if ($ownerIds.Count -ne 1) { throw 'Порт обслуживают несколько процессов; они не будут остановлены.' }
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($ownerIds[0])"
            if ($owner.ExecutablePath -ne $python -or $owner.CommandLine -notmatch 'main\.py') { throw 'Процесс не принадлежит настроенному ComfyUI.' }
            $queue = Invoke-RestMethod "$url/queue" -TimeoutSec 5
            if ($queue.queue_running.Count -or $queue.queue_pending.Count) { throw 'Очередь не пуста; завершите задания перед остановкой.' }
            Stop-Process -Id $owner.ProcessId
            Wait-Process -Id $owner.ProcessId -Timeout 20 -ErrorAction SilentlyContinue
            Write-Output 'ComfyUI остановлен.'
            exit 0
        }
        if (Test-Path -LiteralPath "$logs\update-incomplete.txt") { throw 'Предыдущее обновление не завершено. См. .cache/runtime/update-incomplete.txt.' }
        if ($listeners.Count) {
            if (-not (Test-Ready)) { throw "Порт $port занят другим или ещё не готовым сервисом." }
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listeners[0].OwningProcess)"
            if ($owner.ExecutablePath -ne $python) { throw 'На порту ComfyUI из другой Python-среды.' }
        } else {
            $starting = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $python -and $_.CommandLine -match 'main\.py' })
            if ($starting.Count) { throw 'PRISM_STARTING: backend уже запущен, но ещё не готов. Проверьте журнал; второй процесс не создан.' }
            foreach ($path in @($python, "$comfyRoot\main.py", $models)) {
                if (-not (Test-Path -LiteralPath $path)) { throw "Не найдено: $path. Проверьте prism.json." }
            }
            $bridge = Join-Path $comfyRoot 'custom_nodes\prism'
            if (-not (Test-Path -LiteralPath $bridge)) {
                New-Item -ItemType Junction -Path $bridge -Target $PSScriptRoot | Out-Null
            } elseif ((Get-Item -LiteralPath $bridge).LinkType -ne 'Junction' -or (Get-Item -LiteralPath $bridge).Target -ne $PSScriptRoot) {
                throw "Каталог $bridge уже принадлежит другой установке."
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
            Write-Output "Запускаю ComfyUI и ожидаю готовности. Журнал: $logs\server.stderr.log"
            $server = Start-Process -FilePath $python -WorkingDirectory $comfyRoot -WindowStyle Hidden -PassThru `
                -ArgumentList $arguments -RedirectStandardOutput "$logs\server.stdout.log" -RedirectStandardError "$logs\server.stderr.log"
            $server.Id | Set-Content -LiteralPath "$logs\server.pid"
            $deadline = [DateTime]::UtcNow.AddSeconds([int]$settings.startup_timeout_seconds)
            while (-not (Test-Ready)) {
                $server.Refresh()
                if ($server.HasExited) { throw "ComfyUI завершился. См. $logs\server.stderr.log" }
                if ([DateTime]::UtcNow -gt $deadline) { throw "Истекло ожидание запуска. Backend не остановлен; см. $logs\server.stderr.log" }
                Start-Sleep -Milliseconds 700
            }
        }
        Write-Output "Prism готов: $url/prism/"
        if (-not $NoBrowser) { Start-Process "$url/prism/" }
    } finally { $lock.Dispose() }
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
