# check-frontend.ps1
# Valida que los archivos del frontend que toqué compilen sin errores.

$ErrorActionPreference = "Continue"
Set-Location "C:\Users\RYZEN 5\Desktop\Trabajos\Motors\prueba-moto\apps\frontend"

# tsconfig temporal solo para chequear
$tmpConfig = @'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": false,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "allowJs": false,
    "ignoreDeprecations": "5.0"
  },
  "include": ["src/hooks/useNotifications.ts", "src/components/features/notifications/NotificationsBell.tsx", "src/layout/AppHeader.tsx", "src/layout/AppLayout.tsx"]
}
'@

$tmpPath = "tsconfig.check.json"
$tmpConfig | Out-File -FilePath $tmpPath -Encoding utf8 -NoNewline

Write-Host "Validando archivos del frontend que modifiqué..."
$output = & npx tsc --noEmit -p $tmpPath 2>&1
$exitCode = $LASTEXITCODE

Write-Host "Exit code: $exitCode"
$output | ForEach-Object { Write-Host $_ }

Remove-Item $tmpPath -ErrorAction SilentlyContinue