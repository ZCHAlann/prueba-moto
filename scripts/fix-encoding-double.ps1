# fix-encoding-double.ps1
#
# Corrige doble mojibake en archivos UTF-8.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/fix-encoding-double.ps1 -Path <ruta>

param(
    [Parameter(Mandatory=$true)]
    [string]$Path
)

if (-not (Test-Path $Path)) {
    Write-Error "Archivo no encontrado: $Path"
    exit 1
}

$utf8 = New-Object System.Text.UTF8Encoding $True
$content = [System.IO.File]::ReadAllText($Path, $utf8)

# Backup
$bak = "$Path.bak"
if (-not (Test-Path $bak)) {
    Copy-Item $Path $bak -Force
}

# Mapa de reemplazos (orden importa)
$replacements = [ordered]@{
    'Ã³'  = 'ó'
    'Ã¡'  = 'á'
    'Ã©'  = 'é'
    'Ã­'  = 'í'
    'Ãº'  = 'ú'
    'Ã±'  = 'ñ'
    'Ã '  = 'à'
    'Ã¨'  = 'è'
    'Ã¬'  = 'ì'
    'Ã²'  = 'ò'
    'Ã¹'  = 'ù'
    'Ã¤'  = 'ä'
    'Ã«'  = 'ë'
    'Ã¯'  = 'ï'
    'Ã¶'  = 'ö'
    'Ã¼'  = 'ü'
    'Ã§'  = 'ç'
    'â‚¬' = '€'
    'â€“' = '–'
    'â€”' = '—'
    'â€™' = "'"
    'â€œ' = '"'
    'â€' = '"'
    'â€¦' = '…'
    'â†’' = '→'
}

$original = $content
foreach ($key in $replacements.Keys) {
    $content = $content.Replace($key, $replacements[$key])
}

if ($content -eq $original) {
    Write-Host "Sin cambios: $Path" -ForegroundColor Green
    exit 0
}

# Separadores de sección ─ (líneas como ──────)
# Si todavía quedan separadores rotos tipo "â”€â”€â”€", los limpiamos
$content = $content -replace 'â.{1,3}€.{0,5}', '─'

# Re-guardar como UTF-8 con BOM
[System.IO.File]::WriteAllText($Path, $content, $utf8)

Write-Host "OK: $Path corregido (backup en $bak)" -ForegroundColor Cyan
Write-Host "Reemplazos aplicados:" -ForegroundColor Yellow
foreach ($key in $replacements.Keys) {
    $count = ([regex]::Matches($original, [regex]::Escape($key))).Count
    if ($count -gt 0) {
        Write-Host "  '$key' -> '$($replacements[$key])' : $count veces" -ForegroundColor Yellow
    }
}