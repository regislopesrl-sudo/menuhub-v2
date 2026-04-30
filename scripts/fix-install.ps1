param()

$workspace = "C:\\SistemaDelivery\\menuhub-delivery-main\\menuhub-delivery-main"

Write-Host "Elevating permissions on workspace..."
icacls $workspace /grant *S-1-1-0:F /T | Out-Null

Write-Host "Permissions fixed. Running npm install..."
Set-Location $workspace
npm install --legacy-peer-deps

Write-Host "Install complete. Please run `npm run test --workspace @delivery-futuro/backend` next."
