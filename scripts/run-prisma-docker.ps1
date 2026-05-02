param (
  [string]$WorkspacePath = "apps/backend",
  [string]$DockerImage = "node:20"
)

function Ensure-Elevated {
  $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )
  if (-not $isAdmin) {
    Write-Host "Reabrindo este script como administrador..." -ForegroundColor Yellow
    Start-Process powershell `
      -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"" `
      -Verb RunAs
    exit
  }
}

Ensure-Elevated

$workspaceRoot = (Resolve-Path (Join-Path -Path $PSScriptRoot -ChildPath "..")).Path
$resourcePath = Join-Path -Path $workspaceRoot -ChildPath $WorkspacePath

Write-Host "Aplicando migrations e gerando Prisma Client dentro do container Docker..." -ForegroundColor Cyan

$volume = "`"$workspaceRoot`:/workspace`""
docker run --rm -v $volume -w /workspace $DockerImage sh -c "cd $WorkspacePath && npx prisma migrate dev --name add-counter-order-item-splits --schema prisma/schema.prisma && npx prisma generate --schema prisma/schema.prisma"

if ($LASTEXITCODE -ne 0) {
  Write-Host "O comando falhou. Verifique os logs acima e tente novamente." -ForegroundColor Red
} else {
  Write-Host "Migrações aplicadas e Prisma Client gerado com sucesso." -ForegroundColor Green
}
