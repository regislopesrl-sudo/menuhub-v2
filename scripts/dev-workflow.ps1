param(
  [string]$Workspace = 'C:\SistemaDelivery\menuhub-delivery-main\menuhub-delivery-main',
  [string]$DatabaseUrl = 'postgresql://postgres:postgres@host.docker.internal:5434/sistema_delivery_futuro?schema=public',
  [string]$PrismaBinary = '/workspace/prisma-bin/schema-engine.exe',
  [string]$Image = 'node:20',
  [string]$SchemaPath = 'prisma/schema.prisma'
)

$workspaceNormalized = (Get-Item $Workspace).FullName.Replace('\\','/')
$volume = "${workspaceNormalized}:/workspace"
$dockerArgs = @(
  'run',
  '--rm',
  '-e',
  "DATABASE_URL=$DatabaseUrl",
  '-e',
  "PRISMA_QUERY_ENGINE_BINARY=$PrismaBinary",
  '-e',
  'PRISMA_SKIP_QUERY_ENGINE_DOWNLOAD=1',
  '-v',
  $volume,
  '-w',
  '/workspace/apps/backend',
  $Image,
  'sh',
  '-c',
  "npx prisma generate --schema $SchemaPath && npx prisma db push --schema $SchemaPath && npm run seed --workspace @delivery-futuro/backend"
)

Write-Host "Executando workflow no Docker (generate -> db push -> seed)..."
& docker @dockerArgs

Write-Host "Workflow finalizado. Agora rode (no host): npm run test --workspace @delivery-futuro/backend"
