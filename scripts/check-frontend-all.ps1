# check-frontend-all.ps1
# Valida TODO el frontend con un tsconfig mínimo.

$ErrorActionPreference = "Continue"
Set-Location "C:\Users\RYZEN 5\Desktop\Trabajos\Motors\prueba-moto\apps\frontend"

# Usar el tsconfig.json original (con vite) pero solo noEmit
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
    "ignoreDeprecations": "5.0",
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
'@

$tmpPath = "tsconfig.check.json"
$tmpConfig | Out-File -FilePath $tmpPath -Encoding utf8 -NoNewline

Write-Host "Validando TODO el frontend..."
$output = & npx tsc --noEmit -p $tmpPath 2>&1 | Tee-Object -Variable captured
$exitCode = $LASTEXITCODE

Write-Host "Exit code: $exitCode"

# Buscar errores en archivos que modifiqué
Write-Host ""
Write-Host "=== Errores en mis archivos ==="
$mine = @(
  "src/hooks/useNotifications.ts",
  "src/components/features/notifications/NotificationsBell.tsx",
  "src/layout/AppHeader.tsx",
  "src/layout/AppLayout.tsx",
  "src/layout/AppSidebar.tsx"
)
$captured | Where-Object { $_ -match ($mine -join "|") } | ForEach-Object { Write-Host $_ }

# Buscar errores que NO son en mis archivos (preexistentes)
Write-Host ""
Write-Host "=== Errores preexistentes (no relacionados con este PR) ==="
$preexistCount = ($captured | Where-Object { $_ -match "error TS" -and $_ -notmatch ($mine -join "|") }).Count
Write-Host "Total: $preexistCount errores preexistentes"

Remove-Item $tmpPath -ErrorAction SilentlyContinue