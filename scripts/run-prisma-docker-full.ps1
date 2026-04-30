param(
  [string]$DatabaseUrl = 'postgresql://postgres:postgres@host.docker.internal:5434/sistema_delivery_futuro?schema=public',
  [string]$Workspace = 'C:\SistemaDelivery\menuhub-delivery-main\menuhub-delivery-main',
  [string]$Image = 'node:20',
  [string]$ResolveMigration = '20260403112000_add_delivery_area_polygons',
  [string]$NextMigration = 'add-order-driver'
)

$workspaceNormalized = (Get-Item $Workspace).FullName.Replace('\\','/')
$volume = "${workspaceNormalized}:/workspace"
$escapedDatabaseUrl = $DatabaseUrl.Replace('"', '`"')
$dockerCommand = @(
  'docker',
  'run',
  '--rm',
  '-e',
  "DATABASE_URL=$escapedDatabaseUrl",
  '-e',
  'PRISMA_QUERY_ENGINE_BINARY=/workspace/prisma-bin/schema-engine.exe',
  '-e',
  'PRISMA_SKIP_QUERY_ENGINE_DOWNLOAD=1',
  '-v',
  $volume,
  '-w',
  '/workspace/apps/backend',
  $Image,
  'sh',
  '-c',
  "npx prisma migrate resolve --applied $ResolveMigration --schema prisma/schema.prisma && npx prisma migrate dev --name $NextMigration --schema prisma/schema.prisma && npx prisma generate --schema prisma/schema.prisma"
)

Write-Host 'Executando comando Docker:' ( ($dockerCommand -join ' ') )
& $dockerCommand[0] $dockerCommand[1..($dockerCommand.Count - 1)]
