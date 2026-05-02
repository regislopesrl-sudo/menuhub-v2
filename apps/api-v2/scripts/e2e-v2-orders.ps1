param(
  [string]$ApiBase = "http://localhost:3202",
  [string]$CompanyId = "company-demo",
  [string]$BranchId = "",
  [string]$UserRole = "admin",
  [string]$StoreId = "store-demo",
  [string]$PaymentMethod = "PIX",
  [string]$CouponCode = "BEMVINDO10",
  [string]$ProductId = "prod-1",
  [int]$Quantity = 1,
  [switch]$SkipPatch
)

$ErrorActionPreference = "Stop"

$requestId = [guid]::NewGuid().ToString()
$headers = @{
  "x-company-id" = $CompanyId
  "x-user-role" = $UserRole
  "x-request-id" = $requestId
  "x-channel" = "delivery"
  "Content-Type" = "application/json"
}

if ($BranchId -and $BranchId.Trim().Length -gt 0) {
  $headers["x-branch-id"] = $BranchId
}

$checkoutBody = @{
  storeId = $StoreId
  customerId = "customer-e2e"
  items = @(
    @{
      productId = $ProductId
      quantity = $Quantity
    }
  )
  paymentMethod = $PaymentMethod
}

if ($CouponCode -and $CouponCode.Trim().Length -gt 0) {
  $checkoutBody.couponCode = $CouponCode
}

Write-Host "[1/3] POST /v2/channels/delivery/checkout"
$checkout = Invoke-RestMethod -Method Post -Uri "$ApiBase/v2/channels/delivery/checkout" -Headers $headers -Body ($checkoutBody | ConvertTo-Json -Depth 6)
$createdOrderId = $checkout.order.id
Write-Host "  Order ID: $createdOrderId"
Write-Host "  Order Number: $($checkout.order.orderNumber)"
Write-Host "  Status: $($checkout.order.status)"

Write-Host "[2/3] GET /v2/orders"
$list = Invoke-RestMethod -Method Get -Uri "$ApiBase/v2/orders?page=1&limit=20" -Headers $headers
$found = $list.data | Where-Object { $_.id -eq $createdOrderId }
if (-not $found) {
  throw "Pedido criado nao apareceu no GET /v2/orders."
}
Write-Host "  Pedido encontrado na listagem."

if (-not $SkipPatch) {
  Write-Host "[3/3] PATCH /v2/orders/:id/status"
  $patchBody = @{ status = "CONFIRMED" } | ConvertTo-Json
  $updated = Invoke-RestMethod -Method Patch -Uri "$ApiBase/v2/orders/$createdOrderId/status" -Headers $headers -Body $patchBody
  Write-Host "  Novo status: $($updated.status)"
}

Write-Host "E2E HTTP basico concluido."
Write-Host "Agora valide o realtime no painel em /admin/orders (order.created / order.status_updated)."
