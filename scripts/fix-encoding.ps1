# fix-encoding.ps1
# Script para corregir el mojibake en archivos UTF-8 guardados como Latin-1.
#
# Estrategia: leer el archivo en bytes crudos (Get-Content -Encoding Byte),
# detectar si tiene secuencias de mojibake (Ã³, Ã­, etc.) y re-guardar
# interpretando los bytes como Latin-1 → UTF-8.
#
# Esto solo aplica a archivos que sabemos están rotos. NO se aplica
# automáticamente a todo el proyecto — solo a los archivos identificados.

param(
    [Parameter(Mandatory=$true)]
    [string]$Path
)

if (-not (Test-Path $Path)) {
    Write-Error "Archivo no encontrado: $Path"
    exit 1
}

# Leer contenido crudo como Latin-1 (que es como el archivo fue guardado mal)
$bytes = [System.IO.File]::ReadAllBytes($Path)

# Convertir bytes Latin-1 → string → guardar como UTF-8 (sin BOM para no romper nada)
$content = [System.Text.Encoding]::GetEncoding('ISO-8859-1').GetString($bytes)

# Verificar que sí tenía mojibake antes de re-guardar
if ($content -notmatch 'Ã') {
    Write-Host "OK: $Path no parece tener mojibake, no se toca." -ForegroundColor Green
    exit 0
}

# Backup
$bak = "$Path.bak"
Copy-Item $Path $bak -Force

# Re-guardar como UTF-8 sin BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding $False
[System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)

Write-Host "OK: $Path corregido (backup en $bak)" -ForegroundColor Cyan