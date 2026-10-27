param([switch]$CheckOnly)
# Запускается через Start.ps1: использует его конфигурацию, кэши и блокировку.
function Invoke-Git([string[]]$Arguments) {
    $result = & git -C $comfyRoot @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git завершился с ошибкой: $($Arguments -join ' ')" }
    return $result
}

$listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count) {
    if (-not (Test-Ready)) { throw 'На порту другой сервис; обновление остановлено.' }
    $queue = Invoke-RestMethod "$url/queue" -TimeoutSec 5
    if ($queue.queue_running.Count -or $queue.queue_pending.Count) { throw 'PRISM_BUSY: очередь не пуста.' }
    if (-not $CheckOnly) { throw 'Сначала остановите ComfyUI через Stop-ComfyUI.bat.' }
}
if (Invoke-Git -Arguments @('status','--porcelain')) { throw 'PRISM_DIRTY: в ComfyUI есть локальные изменения. Сохраните их перед обновлением.' }
$before = Invoke-Git -Arguments @('rev-parse','HEAD')
Invoke-Git -Arguments @('fetch','origin','--tags') | Out-Host
$release = Invoke-Git -Arguments @('tag','--list','v*','--sort=-v:refname') |
    Where-Object { $_ -match '^v\d+\.\d+\.\d+$' } | Select-Object -First 1
if (-not $release) { throw 'Стабильный релиз ComfyUI не найден.' }
$target = Invoke-Git -Arguments @('rev-parse',"$release^{commit}")
Write-Output "Текущая ревизия: $before. Стабильный релиз: $release ($target)."
if ($CheckOnly -or $before -eq $target) { return }

# Защита от запуска ещё не слушающего порт backend из этой установки.
$running = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $python -and $_.CommandLine -match 'main\.py' })
if ($running.Count) { throw 'ComfyUI ещё работает. Дождитесь его остановки.' }
$backup = Join-Path $cache ('updates\' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$before | Set-Content -LiteralPath "$backup\revision.txt"
Invoke-Git -Arguments @('archive','--format=zip','-o',"$backup\source.zip",'HEAD') | Out-Host
$packages = @(& $python -m pip freeze)
if ($LASTEXITCODE -ne 0) { throw 'Не удалось сохранить список Python-пакетов.' }
Set-Content -LiteralPath "$backup\packages.txt" -Value ($packages -join "`n") -Encoding utf8
$torch = @($packages | Where-Object { $_ -match '^(torch|torchvision|torchaudio)==' })
Set-Content -LiteralPath "$backup\torch-constraints.txt" -Value ($torch -join "`n") -Encoding utf8
foreach ($name in @('user','extra_model_paths.yaml')) {
    $source = Join-Path $comfyRoot $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $backup -Recurse }
}
Copy-Item -LiteralPath $Config -Destination "$backup\prism.json"
$installMarker = Join-Path (Split-Path -Parent $comfyRoot) 'prism-install.json'
$installation = $null
if ($settings.PSObject.Properties['managed_install'] -and $settings.managed_install) {
    $installation = Get-Content -LiteralPath $installMarker -Raw | ConvertFrom-Json
    Copy-Item -LiteralPath $installMarker -Destination "$backup\prism-install.json"
}
Invoke-Git -Arguments @('show',"${release}:requirements.txt") |
    Set-Content -LiteralPath "$backup\requirements-next.txt" -Encoding utf8
& $python -m pip install --dry-run -r "$backup\requirements-next.txt" -c "$backup\torch-constraints.txt"
if ($LASTEXITCODE -ne 0) { throw "Зависимости несовместимы; рабочая установка не изменена. См. $backup" }

"Обновление $release не завершено. Резервная копия: $backup. Восстановите код из source.zip и зависимости из packages.txt перед удалением этого маркера." |
    Set-Content -LiteralPath "$logs\update-incomplete.txt" -Encoding utf8
if ($null -ne $installation) {
    $installation.complete = $false
    $installation | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $installMarker -Encoding utf8
}
Invoke-Git -Arguments @('checkout','--detach',$release) | Out-Host
& $python -m pip install -r "$comfyRoot\requirements.txt" -c "$backup\torch-constraints.txt"
if ($LASTEXITCODE -ne 0) { throw "Ошибка установки зависимостей; запуск заблокирован. Резервная копия: $backup" }
& $python -m pip check
if ($LASTEXITCODE -ne 0) { throw "Обнаружен конфликт зависимостей; запуск заблокирован. См. $backup" }
Remove-Item -LiteralPath "$logs\update-incomplete.txt"
if ($null -ne $installation) {
    $installation.comfy_commit = $target
    $installation.complete = $true
    $installation | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $installMarker -Encoding utf8
}
Write-Output "ComfyUI обновлён до $release. Резервная копия: $backup. Запустите Prism.bat."
