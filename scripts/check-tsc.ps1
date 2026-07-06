# check-tsc.ps1
# Corre tsc --noEmit y captura el output.

$ErrorActionPreference = "Continue"
Set-Location "C:\Users\RYZEN 5\Desktop\Trabajos\Motors\prueba-moto\apps\backend"

# Hacer un tsconfig temporal sin scripts/ para no chocar con los errores preexistentes
$orig = Get-Content "tsconfig.json" -Raw
$tmpConfig = @'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist-check",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "ignoreDeprecations": "6.0",
    "noEmit": true
  },
  "include": ["src"]
}
'@

$tmpPath = "tsconfig.check.json"
$tmpConfig | Out-File -FilePath $tmpPath -Encoding utf8 -NoNewline

Write-Host "Corriendo tsc --noEmit con config reducido (solo src/)..."
$output = & npx tsc --noEmit -p $tmpPath 2>&1
$exitCode = $LASTEXITCODE

Write-Host "Exit code: $exitCode"
Write-Host "Output (últimas 100 líneas):"
$output | Select-Object -Last 100

Remove-Item $tmpPath -ErrorAction SilentlyContinue
if (Test-Path "dist-check") { Remove-Item "dist-check" -Recurse -Force }