param([switch]$CheckOnly)
# Запускается через Start.ps1: использует его конфигурацию, кэши и блокировку.
function Invoke-Git([string[]]$Arguments) {
    $result = & git -C $comfyRoot @Arguments
    if ($LASTEXITCODE -ne 0) { throw (Get-LauncherText "Git завершился с ошибкой: $($Arguments -join ' ')" "Git failed: $($Arguments -join ' ')") }
    return $result
}

$listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count) {
    if (-not (Test-Ready)) { throw (Get-LauncherText 'На порту другой сервис; обновление остановлено.' 'Another service is using the port; the update was stopped.') }
    $queue = Invoke-RestMethod "$url/queue" -TimeoutSec 5
    if ($queue.queue_running.Count -or $queue.queue_pending.Count) { throw (Get-LauncherText 'PRISM_BUSY: очередь не пуста.' 'PRISM_BUSY: the queue is not empty.') }
    if (-not $CheckOnly) { throw (Get-LauncherText 'Сначала остановите ComfyUI через Stop-ComfyUI.bat.' 'Stop ComfyUI using Stop-ComfyUI.bat first.') }
}
if (Invoke-Git -Arguments @('status','--porcelain')) { throw (Get-LauncherText 'PRISM_DIRTY: в ComfyUI есть локальные изменения. Сохраните их перед обновлением.' 'PRISM_DIRTY: ComfyUI has local changes. Save them before updating.') }
$before = Invoke-Git -Arguments @('rev-parse','HEAD')
Invoke-Git -Arguments @('fetch','origin','--tags') | Out-Host
$release = Invoke-Git -Arguments @('tag','--list','v*','--sort=-v:refname') |
    Where-Object { $_ -match '^v\d+\.\d+\.\d+$' } | Select-Object -First 1
if (-not $release) { throw (Get-LauncherText 'Стабильный релиз ComfyUI не найден.' 'No stable ComfyUI release was found.') }
$target = Invoke-Git -Arguments @('rev-parse',"$release^{commit}")
Write-Output (Get-LauncherText "Текущая ревизия: $before. Стабильный релиз: $release ($target)." "Current revision: $before. Stable release: $release ($target).")
if ($CheckOnly -or $before -eq $target) { return }

# Защита от запуска ещё не слушающего порт backend из этой установки.
$running = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $python -and $_.CommandLine -match 'main\.py' })
if ($running.Count) { throw (Get-LauncherText 'ComfyUI ещё работает. Дождитесь его остановки.' 'ComfyUI is still running. Wait for it to stop.') }
$backup = Join-Path $cache ('updates\' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$before | Set-Content -LiteralPath "$backup\revision.txt"
Invoke-Git -Arguments @('archive','--format=zip','-o',"$backup\source.zip",'HEAD') | Out-Host
$packages = @(& $python -m pip freeze)
if ($LASTEXITCODE -ne 0) { throw (Get-LauncherText 'Не удалось сохранить список Python-пакетов.' 'Could not save the list of Python packages.') }
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
if ($LASTEXITCODE -ne 0) { throw (Get-LauncherText "Зависимости несовместимы; рабочая установка не изменена. См. $backup" "Dependencies are incompatible; the working installation was not changed. See $backup") }

(Get-LauncherText "Обновление $release не завершено. Резервная копия: $backup. Восстановите код из source.zip и зависимости из packages.txt перед удалением этого маркера." "Update $release did not finish. Backup: $backup. Restore the code from source.zip and dependencies from packages.txt before removing this marker.") |
    Set-Content -LiteralPath "$logs\update-incomplete.txt" -Encoding utf8
if ($null -ne $installation) {
    $installation.complete = $false
    $installation | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $installMarker -Encoding utf8
}
Invoke-Git -Arguments @('checkout','--detach',$release) | Out-Host
& $python -m pip install -r "$comfyRoot\requirements.txt" -c "$backup\torch-constraints.txt"
if ($LASTEXITCODE -ne 0) { throw (Get-LauncherText "Ошибка установки зависимостей; запуск заблокирован. Резервная копия: $backup" "Dependency installation failed; startup is blocked. Backup: $backup") }
& $python -m pip check
if ($LASTEXITCODE -ne 0) { throw (Get-LauncherText "Обнаружен конфликт зависимостей; запуск заблокирован. См. $backup" "A dependency conflict was detected; startup is blocked. See $backup") }
Remove-Item -LiteralPath "$logs\update-incomplete.txt"
if ($null -ne $installation) {
    $installation.comfy_commit = $target
    $installation.complete = $true
    $installation | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $installMarker -Encoding utf8
}
Write-Output (Get-LauncherText "ComfyUI обновлён до $release. Резервная копия: $backup. Запустите Prism.bat." "ComfyUI was updated to $release. Backup: $backup. Start Prism.bat.")
