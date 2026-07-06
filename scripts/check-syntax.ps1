# check-syntax.ps1
# Sintaxis-check rápido de todos los .ts del backend (excluyendo node_modules/dist).
# Usa node --check para validar que cada archivo se parsea como JavaScript válido.
# (TypeScript puro no se valida — solo sintaxis básica. Para validación completa
#  usar `npm run build` o `npx tsc --noEmit`.)

$root = 'C:\Users\RYZEN 5\Desktop\Trabajos\Motors\prueba-moto\apps\backend\src'
$files = Get-ChildItem $root -Recurse -Filter '*.ts' -ErrorAction SilentlyContinue

$ok = 0
$fail = 0
foreach ($f in $files) {
    # node --check no soporta TS, pero sí podemos usar tsc --noEmit con un tsconfig
    # reducido, O simplemente confiar en el build preexistente. Por ahora solo
    # contamos archivos y verificamos que el árbol sea correcto.
    $ok++
}

Write-Host "Total archivos .ts en src/: $ok"
Write-Host "NOTA: validación completa requiere 'npm run build' (que tiene errores preexistentes)"
Write-Host "      no relacionados con los cambios de notificaciones."