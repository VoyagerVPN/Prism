param([string]$LogDirectory = "$PSScriptRoot\.cache\runtime")
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$readers = @()
try {
    foreach ($name in @('server.stdout.log', 'server.stderr.log')) {
        $stream = [IO.File]::Open((Join-Path $LogDirectory $name), 'Open', 'Read', 'ReadWrite, Delete')
        $readers += [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8)
    }
    while ($true) {
        foreach ($reader in $readers) {
            # При перезапуске backend существующий журнал обнуляется.
            if ($reader.BaseStream.Position -gt $reader.BaseStream.Length) {
                $reader.DiscardBufferedData()
                $reader.BaseStream.Position = 0
            }
            $text = $reader.ReadToEnd()
            if ($text) { [Console]::Write($text) }
        }
        Start-Sleep -Milliseconds 250
    }
} finally {
    foreach ($reader in $readers) { $reader.Dispose() }
}
