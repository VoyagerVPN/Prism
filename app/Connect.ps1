function Resolve-PrismComfyRoot([string]$Path) {
    if ($Path -and (Test-Path -LiteralPath $Path -PathType Container)) {
        $folder = (Get-Item -LiteralPath $Path).FullName
        foreach ($candidate in @($folder, (Join-Path $folder 'ComfyUI'))) {
            if (Test-Path -LiteralPath (Join-Path $candidate 'main.py') -PathType Leaf) { return $candidate }
        }
    }
    throw (Get-PrismConnectionText 'root')
}

. (Join-Path $PSScriptRoot 'Language.ps1')

function Get-PrismConnectionText([string]$Key) {
    $language = if ($env:PRISM_LANGUAGE -in @('en', 'ru')) { $env:PRISM_LANGUAGE } else { Get-PrismLanguage $PSScriptRoot }
    $text = @{
        en = @{ root='Choose a ComfyUI folder containing main.py or a ComfyUI Portable root.'; python='Choose an existing python.exe file.'; timeout='Checking Python timed out. Choose the ComfyUI environment and retry.'; dependencies='This Python could not load ComfyUI dependencies. Choose its venv or bundled Python.'; models='Choose a models folder.'; busy='Wait for Prism to finish installing or starting and retry.'; managed='This Prism folder already has a separate environment. Extract Prism to a new folder to connect another ComfyUI.'; port='The current Prism port is in use. Stop ComfyUI before changing the connection.' }
        ru = @{ root='Выберите папку ComfyUI с файлом main.py или корень ComfyUI Portable.'; python='Выберите существующий файл python.exe.'; timeout='Проверка Python не завершилась вовремя. Выберите окружение ComfyUI и повторите.'; dependencies='Этот Python не смог загрузить зависимости ComfyUI. Выберите его venv или встроенный Python.'; models='Выберите папку моделей.'; busy='Дождитесь завершения установки или запуска Prism и повторите.'; managed='В этой папке Prism уже есть отдельное окружение. Для подключения другого ComfyUI распакуйте Prism в новую папку.'; port='Текущий порт Prism занят. Остановите ComfyUI перед изменением подключения.' }
    }
    return $text[$language][$Key]
}

function Find-PrismPython([string]$ComfyRoot) {
    $candidates = @(
        (Join-Path $ComfyRoot 'venv\Scripts\python.exe')
        (Join-Path $ComfyRoot '.venv\Scripts\python.exe')
        (Join-Path (Split-Path -Parent $ComfyRoot) 'python_embeded\python.exe')
    )
    $candidates += @(Get-Command python.exe -All -CommandType Application -ErrorAction SilentlyContinue |
        Where-Object Source -NotLike '*\Microsoft\WindowsApps\*' | Select-Object -ExpandProperty Source)
    foreach ($key in @('HKCU:\Software\Python\PythonCore', 'HKLM:\Software\Python\PythonCore', 'HKLM:\Software\WOW6432Node\Python\PythonCore')) {
        foreach ($version in @(Get-ChildItem -LiteralPath $key -ErrorAction SilentlyContinue)) {
            $install = Get-Item -LiteralPath ($version.PSPath + '\InstallPath') -ErrorAction SilentlyContinue
            if ($install) {
                $exe = $install.GetValue('ExecutablePath')
                $directory = $install.GetValue('')
                if ($exe) { $candidates += $exe }
                elseif ($directory) { $candidates += Join-Path $directory 'python.exe' }
            }
        }
    }
    $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -Unique
    $launcher = Get-Command py.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $launcher) { return }
    # -0p поддерживают и старый py.exe, и Python Install Manager. Команда только читает список.
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $launcher.Source
    $info.Arguments = '-0p'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    try {
        $process = [Diagnostics.Process]::Start($info)
        try {
            $output = $process.StandardOutput.ReadToEndAsync()
            $errors = $process.StandardError.ReadToEndAsync()
            if (-not $process.WaitForExit(3000)) { $process.Kill(); return }
            if ($process.ExitCode -ne 0) { return }
            foreach ($line in ($output.Result -split '\r?\n')) {
                if ($line -match '((?:[A-Za-z]:\\|\\\\)[^\r\n]+\.exe)\s*\z') {
                    $exe = $Matches[1]
                    if ($exe -notin $candidates -and (Test-Path -LiteralPath $exe -PathType Leaf)) { $exe }
                }
            }
        } finally { $process.Dispose() }
    } catch {
        # Системный запускатель Python может отсутствовать или быть отключён.
    }
}

function Resolve-PrismPython([string]$ComfyRoot, [string]$Cache) {
    foreach ($candidate in @(Find-PrismPython $ComfyRoot)) {
        try {
            Test-PrismPython $candidate $ComfyRoot $Cache -TimeoutMs 8000
            return $candidate
        } catch {
            # Переходим к следующему кандидату, если не загружаются зависимости.
        }
    }
}

function Find-PrismConnection {
    param(
        [string]$AppRoot,
        [string[]]$AdditionalRoots = @(
            $env:USERPROFILE
            [Environment]::GetFolderPath('MyDocuments')
            (Join-Path $env:USERPROFILE 'Downloads')
        )
    )
    $prism = Split-Path -Parent $AppRoot
    $parents = @($prism, (Split-Path -Parent $prism)) + $AdditionalRoots
    $seen = @{}
    $match = $null
    foreach ($parent in ($parents | Where-Object { $_ } | Select-Object -Unique)) {
        foreach ($name in @('ComfyUI', 'ComfyUI_windows_portable', 'ComfyUI-Portable')) {
            try { $comfy = Resolve-PrismComfyRoot (Join-Path $parent $name) }
            catch { continue }
            if ($seen.ContainsKey($comfy)) { continue }
            $seen[$comfy] = $true
            $models = Join-Path $comfy 'models'
            if (-not (Test-Path -LiteralPath $models -PathType Container)) { continue }
            $python = Resolve-PrismPython $comfy (Join-Path $AppRoot '.cache\connect')
            if (-not $python) { continue }
            if ($match) { return }
            $match = @{ comfy = $comfy; python = $python; models = $models }
        }
    }
    return $match
}

function Test-PrismPython([string]$Python, [string]$ComfyRoot, [string]$Cache, [int]$TimeoutMs = 30000) {
    if (-not $Python -or -not (Test-Path -LiteralPath $Python -PathType Leaf) -or
        [IO.Path]::GetFileName($Python) -ine 'python.exe') { throw (Get-PrismConnectionText 'python') }
    [void][IO.Directory]::CreateDirectory($Cache)
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = (Get-Item -LiteralPath $Python).FullName
    $info.WorkingDirectory = $ComfyRoot
    $info.Arguments = '-I -B -X utf8 -c "import torch, aiohttp, safetensors, yaml, PIL, psutil"'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardErrorEncoding = [Text.Encoding]::UTF8
    foreach ($name in @('TEMP','TMP','TORCH_HOME','HF_HOME','XDG_CACHE_HOME','CUDA_CACHE_PATH')) {
        $info.EnvironmentVariables[$name] = $Cache
    }
    $process = [Diagnostics.Process]::Start($info)
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutMs)) {
            $process.Kill()
            $process.WaitForExit()
            throw (Get-PrismConnectionText 'timeout')
        }
        if ($process.ExitCode -ne 0) {
            $detail = ($errors.Result.Trim() -split '\r?\n')[-1]
            throw "$(Get-PrismConnectionText 'dependencies') $detail"
        }
    } finally { $process.Dispose() }
}

function Save-PrismConnection([string]$AppRoot, [string]$Comfy, [string]$Python, [string]$Models) {
    $comfyRoot = Resolve-PrismComfyRoot $Comfy
    if ([string]::IsNullOrWhiteSpace($Models)) { $Models = Join-Path $comfyRoot 'models' }
    if (-not (Test-Path -LiteralPath $Models -PathType Container)) { throw (Get-PrismConnectionText 'models') }
    $config = Join-Path $AppRoot 'prism.local.json'
    $cache = Join-Path $AppRoot '.cache\runtime'
    [void][IO.Directory]::CreateDirectory($cache)
    try { $lock = [IO.File]::Open((Join-Path $cache 'launcher.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw (Get-PrismConnectionText 'busy') }
    try {
        $exists = Test-Path -LiteralPath $config -PathType Leaf
        if ($exists) {
            $settings = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
            if ($settings.managed_install) { throw (Get-PrismConnectionText 'managed') }
            if ($settings.port -and (Get-NetTCPConnection -LocalPort $settings.port -State Listen -ErrorAction SilentlyContinue)) {
                throw (Get-PrismConnectionText 'port')
            }
        } else {
            $settings = Get-Content -LiteralPath (Join-Path $AppRoot 'prism.example.json') -Raw | ConvertFrom-Json
        }
        Test-PrismPython $Python $comfyRoot (Join-Path $AppRoot '.cache\connect')
        $settings.backend_root = $comfyRoot
        $settings.python = (Get-Item -LiteralPath $Python).FullName
        $settings.models_root = (Get-Item -LiteralPath $Models).FullName
        $temp = Join-Path $cache ("connection-" + [guid]::NewGuid().ToString('N') + ".json")
        try {
            $settings | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $temp -Encoding UTF8
            if ($exists) { [IO.File]::Replace($temp, $config, "$temp.bak") }
            else { [IO.File]::Move($temp, $config) }
        } finally {
            Remove-Item -LiteralPath @($temp,"$temp.bak") -ErrorAction SilentlyContinue
        }
    } finally { $lock.Dispose() }
}

function Set-PrismDarkTitleBar($Form, [string]$AppRoot) {
    $previousTemp = $env:TEMP
    $previousTmp = $env:TMP
    try {
        if (-not ('PrismDarkTitleBar' -as [type])) {
            $cache = Join-Path $AppRoot '.cache\connect'
            [void][IO.Directory]::CreateDirectory($cache)
            $env:TEMP = $cache
            $env:TMP = $cache
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PrismDarkTitleBar {
    [DllImport("dwmapi.dll")]
    public static extern int DwmSetWindowAttribute(IntPtr handle, int attribute, ref int value, int size);
}
'@
        }
        $enabled = 1
        if ([PrismDarkTitleBar]::DwmSetWindowAttribute($Form.Handle, 20, [ref]$enabled, 4) -ne 0) {
            [void][PrismDarkTitleBar]::DwmSetWindowAttribute($Form.Handle, 19, [ref]$enabled, 4)
        }
    } catch {
        # На старых версиях Windows рамка остаётся системной.
    } finally {
        $env:TEMP = $previousTemp
        $env:TMP = $previousTmp
    }
}

function New-PrismConnectionForm([string]$AppRoot) {
    $messages = @{
        en = @{ title='Prism setup'; install='Install'; existing='Connect an existing ComfyUI'; models='Models'; browse='Browse…'; save='Save'; language='Language'; saved='Settings saved. Open Prism.bat.'; chooseComfy='Choose a ComfyUI or ComfyUI Portable folder'; chooseModels='Choose a models folder'; needPython='Specify the Python path.'; needComfy='Specify the ComfyUI folder.'; checking='Checking Python…'; searching='Looking for ComfyUI…'; connect='Connect ComfyUI' }
        ru = @{ title='Настройка Prism'; install='Установить'; existing='Подключить существующий ComfyUI'; models='Модели'; browse='Обзор…'; save='Сохранить'; language='Язык'; saved='Настройки сохранены. Откройте Prism.bat.'; chooseComfy='Выберите папку ComfyUI или ComfyUI Portable'; chooseModels='Выберите папку моделей'; needPython='Укажите путь к Python.'; needComfy='Укажите папку ComfyUI.'; checking='Проверяем Python…'; searching='Ищем ComfyUI…'; connect='Подключение ComfyUI' }
    }
    $background = [Drawing.ColorTranslator]::FromHtml('#202124')
    $surface = [Drawing.ColorTranslator]::FromHtml('#2D3035')
    $border = [Drawing.ColorTranslator]::FromHtml('#50545C')
    $foreground = [Drawing.ColorTranslator]::FromHtml('#F1F2F4')
    $styleButton = {
        param($Button)
        $Button.FlatStyle = 'Flat'
        $Button.UseVisualStyleBackColor = $false
        $Button.BackColor = $surface
        $Button.ForeColor = $foreground
        $Button.FlatAppearance.BorderColor = $border
        $Button.FlatAppearance.MouseOverBackColor = [Drawing.ColorTranslator]::FromHtml('#393D44')
        $Button.FlatAppearance.MouseDownBackColor = [Drawing.ColorTranslator]::FromHtml('#454A53')
    }

    $form = New-Object Windows.Forms.Form
    $form.Text = 'Настройка Prism'
    $form.StartPosition = 'CenterScreen'
    $form.AutoScaleMode = 'Dpi'
    $form.ClientSize = New-Object Drawing.Size(620, 242)
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.BackColor = $background
    $form.ForeColor = $foreground

    $table = New-Object Windows.Forms.TableLayoutPanel
    $table.Dock = 'Fill'
    $table.Padding = New-Object Windows.Forms.Padding(12)
    $table.ColumnCount = 3
    $table.RowCount = 6
    foreach ($height in @(44, 28, 34, 34, 34, 44)) {
        [void]$table.RowStyles.Add((New-Object Windows.Forms.RowStyle('Absolute', $height)))
    }
    [void]$table.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Absolute', 116)))
    [void]$table.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent', 100)))
    [void]$table.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Absolute', 88)))
    $form.Controls.Add($table)

    $install = New-Object Windows.Forms.Button
    $install.Name = 'prism-install'
    $install.Text = 'Установить'
    & $styleButton $install
    $install.Anchor = 'Left'
    $install.Size = New-Object Drawing.Size(112, 30)
    $table.Controls.Add($install, 0, 0)
    $languageLabel = New-Object Windows.Forms.Label
    $languageLabel.TextAlign = 'MiddleRight'
    $languageLabel.Dock = 'Fill'
    $table.Controls.Add($languageLabel, 1, 0)
    $language = New-Object Windows.Forms.ComboBox
    $language.Name = 'prism-language'
    $language.DropDownStyle = 'DropDownList'
    $language.Anchor = 'Left, Right'
    [void]$language.Items.Add('English')
    [void]$language.Items.Add('Русский')
    $language.SelectedIndex = if ((Get-PrismLanguage $AppRoot) -eq 'ru') { 1 } else { 0 }
    $table.Controls.Add($language, 2, 0)

    $existing = New-Object Windows.Forms.Label
    $existing.Text = 'Подключить существующий ComfyUI'
    $existing.TextAlign = 'MiddleLeft'
    $existing.Dock = 'Fill'
    $table.Controls.Add($existing, 0, 1)
    $table.SetColumnSpan($existing, 3)

    $fields = @{
        comfy = New-Object Windows.Forms.TextBox
        python = New-Object Windows.Forms.TextBox
        models = New-Object Windows.Forms.TextBox
    }
    $rows = @(
        @{ key = 'comfy'; label = 'ComfyUI' }
        @{ key = 'python'; label = 'Python' }
        @{ key = 'models'; label = 'Модели' }
    )
    $choose = {
        param($sender, $eventArgs)
        $key = $sender.Tag
        $field = $fields[$key]
        if ($key -eq 'python') {
            $picker = New-Object Windows.Forms.OpenFileDialog
            $picker.Filter = 'Python (python.exe)|python.exe'
            try { if ($picker.ShowDialog($form) -eq 'OK') { $field.Text = $picker.FileName } }
            finally { $picker.Dispose() }
            return
        }
        $picker = New-Object Windows.Forms.FolderBrowserDialog
        $code = if ($language.SelectedIndex -eq 1) { 'ru' } else { 'en' }
        $picker.Description = if ($key -eq 'comfy') { $messages[$code].chooseComfy } else { $messages[$code].chooseModels }
        if ($field.Text -and (Test-Path -LiteralPath $field.Text -PathType Container)) { $picker.SelectedPath = $field.Text }
        try {
            if ($picker.ShowDialog($form) -eq 'OK') {
                $field.Text = $picker.SelectedPath
                if ($key -eq 'comfy') { $refresh.Invoke($true) }
            }
        } finally { $picker.Dispose() }
    }
    $suggested = @{}
    $search = @{ timer = New-Object Windows.Forms.Timer; generation = 0 }
    $search.timer.Interval = 100
    $queueSearch = {
        param([string]$Folder)
        $search.generation++
        $search.pending = @{ folder = $Folder; generation = $search.generation; input = $fields.comfy.Text }
        $search.timer.Start()
    }.GetNewClosure()
    $refresh = {
        param([bool]$Reset)
        if (-not $fields.comfy.Text) { return }
        try { $folder = Resolve-PrismComfyRoot $fields.comfy.Text } catch { return }
        if ($Reset -or -not $fields.models.Text -or $fields.models.Text -eq $suggested.models) {
            $suggested.models = Join-Path $folder 'models'
            $fields.models.Text = $suggested.models
        }
        if ($folder -ne $search.lastFolder) {
            $search.lastFolder = $folder
            if ($Reset -or $fields.python.Text -eq $suggested.python) { $fields.python.Text = '' }
            if (-not $fields.python.Text) { $queueSearch.Invoke($folder) }
        }
    }.GetNewClosure()

    $rowLabels = @{}
    $browseButtons = @()
    for ($row = 0; $row -lt $rows.Count; $row++) {
        $item = $rows[$row]
        $label = New-Object Windows.Forms.Label
        $label.Text = $item.label
        $label.TextAlign = 'MiddleLeft'
        $label.Dock = 'Fill'
        $rowLabels[$item.key] = $label
        $field = $fields[$item.key]
        $field.Anchor = 'Left, Right'
        $field.AutoSize = $false
        $field.Height = 26
        $field.BorderStyle = 'FixedSingle'
        $field.BackColor = $surface
        $field.ForeColor = $foreground
        $browse = New-Object Windows.Forms.Button
        $browse.Text = 'Обзор…'
        $browse.Tag = $item.key
        $browse.Anchor = 'Left, Right'
        $browse.Height = $field.Height
        & $styleButton $browse
        $browseButtons += $browse
        $browse.Add_Click($choose.GetNewClosure())
        $table.Controls.Add($label, 0, ($row + 2))
        $table.Controls.Add($field, 1, ($row + 2))
        $table.Controls.Add($browse, 2, ($row + 2))
    }
    $fields.comfy.Add_Leave({ $refresh.Invoke($false) }.GetNewClosure())

    $save = New-Object Windows.Forms.Button
    $save.Text = 'Сохранить'
    & $styleButton $save
    $save.AutoSize = $true
    $save.Anchor = 'Right'
    $table.Controls.Add($save, 2, 5)
    $status = New-Object Windows.Forms.Label
    $status.Name = 'prism-connection-status'
    $status.Dock = 'Fill'
    $status.TextAlign = 'MiddleLeft'
    $table.Controls.Add($status, 0, 5)
    $table.SetColumnSpan($status, 2)
    $applyLanguage = {
        $code = if ($language.SelectedIndex -eq 1) { 'ru' } else { 'en' }
        $env:PRISM_LANGUAGE = $code
        $text = $messages[$code]
        $form.Text = $text.title
        $install.Text = $text.install
        $existing.Text = $text.existing
        $rowLabels.models.Text = $text.models
        $save.Text = $text.save
        $languageLabel.Text = $text.language
        foreach ($browse in $browseButtons) { $browse.Text = $text.browse }
        if ($status.Tag) { $status.Text = $text[[string]$status.Tag] }
    }.GetNewClosure()
    $language.Add_SelectedIndexChanged($applyLanguage)
    & $applyLanguage
    $install.Add_Click({
        try {
            $code = if ($language.SelectedIndex -eq 1) { 'ru' } else { 'en' }
            Set-PrismLanguage $AppRoot $code
            $form.DialogResult = [Windows.Forms.DialogResult]::Retry
            $form.Close()
        } catch {
            [void][Windows.Forms.MessageBox]::Show($form, $_.Exception.Message, 'Prism')
        }
    }.GetNewClosure())
    $scriptFile = $MyInvocation.MyCommand.ScriptBlock.File
    $search.timer.Add_Tick({
        if ($search.worker) {
            if (-not $search.result.IsCompleted) { return }
            $result = $null
            try { $result = $search.worker.EndInvoke($search.result) | Select-Object -First 1 }
            catch {}
            finally { $search.worker.Dispose(); $search.worker = $null }
            if ($search.request.generation -eq $search.generation -and $search.request.input -eq $fields.comfy.Text) {
                if ($result -and -not $search.request.folder) {
                    $fields.comfy.Text = $result.comfy
                    $suggested.models = $result.models
                    $fields.models.Text = $result.models
                    $search.lastFolder = $result.comfy
                }
                if ($result -and -not $fields.python.Text) {
                    $suggested.python = $result.python
                    $fields.python.Text = $result.python
                }
                $code = if ($language.SelectedIndex -eq 1) { 'ru' } else { 'en' }
                $status.Tag = if ($result) { $null } elseif ($search.request.folder) { 'needPython' } else { 'needComfy' }
                $status.Text = if ($status.Tag) { $messages[$code][[string]$status.Tag] } else { '' }
            }
        }
        if (-not $search.pending) {
            $search.timer.Stop()
            $save.Enabled = $true
            return
        }
        $search.request = $search.pending
        $search.pending = $null
        $code = if ($language.SelectedIndex -eq 1) { 'ru' } else { 'en' }
        $status.Tag = if ($search.request.folder) { 'checking' } else { 'searching' }
        $status.Text = $messages[$code][[string]$status.Tag]
        $save.Enabled = $false
        $search.worker = [PowerShell]::Create()
        [void]$search.worker.AddScript({
            param($scriptFile, $appRoot, $folder)
            $ErrorActionPreference = 'Stop'
            . $scriptFile
            if ($folder) {
                $python = Resolve-PrismPython $folder (Join-Path $appRoot '.cache\connect')
                if ($python) { @{ python = $python } }
            } else { Find-PrismConnection $appRoot }
        }.ToString()).AddArgument($scriptFile).AddArgument($AppRoot).AddArgument($search.request.folder)
        $search.result = $search.worker.BeginInvoke()
    }.GetNewClosure())
    $form.Add_Disposed({
        $search.timer.Dispose()
        if ($search.worker) { $search.worker.Dispose() }
    }.GetNewClosure())

    $form.AcceptButton = $save
    $save.Add_Click({
        $form.UseWaitCursor = $true
        try {
            $refresh.Invoke($false)
            if (-not $fields.python.Text -and ($search.worker -or $search.pending)) { return }
            Save-PrismConnection $AppRoot $fields.comfy.Text $fields.python.Text $fields.models.Text
            $code = if ($language.SelectedIndex -eq 1) { 'ru' } else { 'en' }
            Set-PrismLanguage $AppRoot $code
            [void][Windows.Forms.MessageBox]::Show($form, $messages[$code].saved, 'Prism')
            $form.Close()
        } catch {
            $code = if ($language.SelectedIndex -eq 1) { 'ru' } else { 'en' }
            [void][Windows.Forms.MessageBox]::Show($form, $_.Exception.Message, $messages[$code].connect)
        } finally { $form.UseWaitCursor = $false }
    }.GetNewClosure())

    $config = Join-Path $AppRoot 'prism.local.json'
    if (Test-Path -LiteralPath $config -PathType Leaf) {
        $settings = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
        foreach ($entry in @(@('comfy','backend_root'), @('python','python'), @('models','models_root'))) {
            $value = [string]$settings.($entry[1])
            if ($value -and -not [IO.Path]::IsPathRooted($value)) { $value = [IO.Path]::GetFullPath((Join-Path $AppRoot $value)) }
            $fields[$entry[0]].Text = $value
        }
        $refresh.Invoke($false)
    } else {
        $form.Add_Shown({ $queueSearch.Invoke('') }.GetNewClosure())
    }
    return $form
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()
    try {
        $form = New-PrismConnectionForm $PSScriptRoot
        try {
            Set-PrismDarkTitleBar $form $PSScriptRoot
            $result = $form.ShowDialog()
        } finally { $form.Dispose() }
        # Setup.bat по этому коду запускает установщик в своей консоли.
        if ($result -eq [Windows.Forms.DialogResult]::Retry) { exit 10 }
    } catch {
        $caption = if ($env:PRISM_LANGUAGE -eq 'ru' -or ($env:PRISM_LANGUAGE -ne 'en' -and [Globalization.CultureInfo]::CurrentUICulture.Name -match '^ru(?:-|$)')) { 'Подключение ComfyUI' } else { 'Connect ComfyUI' }
        [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, $caption)
        exit 1
    }
}
