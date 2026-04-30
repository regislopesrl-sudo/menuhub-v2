param(
  [switch]$Seed,
  [switch]$Watch
)

$env:NPM_CONFIG_PREFIX = 'C:\Program Files\nodejs'

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

npm run test --workspace @delivery-futuro/backend

if ($Seed) {
  npm run seed --workspace @delivery-futuro/backend
}

Pop-Location
