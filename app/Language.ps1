function Get-PrismLanguage([string]$AppRoot, [string]$Culture = [Globalization.CultureInfo]::CurrentUICulture.Name) {
    $path = Join-Path $AppRoot 'data\language.json'
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $saved = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($saved.language -notin @('en', 'ru')) { throw 'PRISM_LANGUAGE_INVALID' }
        return [string]$saved.language
    }
    if ($Culture -match '^ru(?:-|$)') { return 'ru' }
    return 'en'
}

function Set-PrismLanguage([string]$AppRoot, [string]$Language) {
    if ($Language -notin @('en', 'ru')) { throw 'PRISM_LANGUAGE_INVALID' }
    $Language = $Language.ToLowerInvariant()
    $directory = Join-Path $AppRoot 'data'
    [void][IO.Directory]::CreateDirectory($directory)
    $path = Join-Path $directory 'language.json'
    $temporary = Join-Path $directory ('.language-' + [guid]::NewGuid().ToString('N') + '.tmp')
    $backup = "$temporary.bak"
    try {
        $json = @{ language = $Language } | ConvertTo-Json -Compress
        [IO.File]::WriteAllText($temporary, $json, [Text.UTF8Encoding]::new($false))
        if ([IO.File]::Exists($path)) { [IO.File]::Replace($temporary, $path, $backup) }
        else { [IO.File]::Move($temporary, $path) }
    } finally {
        if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
        if ([IO.File]::Exists($backup)) { [IO.File]::Delete($backup) }
    }
}
