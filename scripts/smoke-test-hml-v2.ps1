param(
  [string]$ApiBase = 'https://api-hml.menuhub.net.br',
  [Parameter(Mandatory=$true)][string]$CompanyId,
  [string]$BranchId,
  [Parameter(Mandatory=$true)][string]$ProductId,
  [string]$Cep = '01001000',
  [string]$Number = '100'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }

$headers = @{
  'Content-Type' = 'application/json'
  'x-company-id' = $CompanyId
  'x-user-role' = 'admin'
  'x-channel' = 'delivery'
}
if ($BranchId -and $BranchId.Trim().Length -gt 0) {
  $headers['x-branch-id'] = $BranchId
}

$summary = [ordered]@{
  health = $false
  modules = $false
  menu = $false
  checkout_quote = $false
  checkout_pix = $false
  payment_status = $false
  orders_list = $false
  order_get = $false
  order_patch_status = $false
}

$orderId = $null
$providerPaymentId = $null

function Invoke-ApiGet([string]$url) {
  return Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 30
}

function Invoke-ApiJson([string]$method, [string]$url, [object]$body) {
  $json = $body | ConvertTo-Json -Depth 12
  return Invoke-RestMethod -Method $method -Uri $url -Headers $headers -Body $json -TimeoutSec 45
}

try {
  Write-Step '1) GET /v2/health'
  $health = Invoke-ApiGet "$ApiBase/v2/health"
  $summary.health = $true
  Write-Ok ("health response: " + (($health | ConvertTo-Json -Depth 5)))
} catch { Write-Fail $_.Exception.Message }

try {
  Write-Step '2) GET /v2/modules'
  $modules = Invoke-ApiGet "$ApiBase/v2/modules"
  $summary.modules = $true
  Write-Ok 'modules carregado'
} catch { Write-Fail $_.Exception.Message }

try {
  Write-Step '3) GET /v2/menu'
  $menu = Invoke-ApiGet "$ApiBase/v2/menu"
  $summary.menu = $true
  Write-Ok 'menu carregado'
} catch { Write-Fail $_.Exception.Message }

try {
  Write-Step '4) POST /v2/checkout/quote'
  $quoteBody = @{
    storeId = 'store-hml'
    items = @(
      @{ productId = $ProductId; quantity = 1 }
    )
    couponCode = $null
    deliveryAddress = @{ cep = $Cep; number = $Number }
  }
  $quote = Invoke-ApiJson 'POST' "$ApiBase/v2/checkout/quote" $quoteBody
  $summary.checkout_quote = $true
  Write-Ok ("quote total: $($quote.total)")
} catch { Write-Fail $_.Exception.Message }

try {
  Write-Step '5) POST /v2/channels/delivery/checkout (PIX)'
  $checkoutBody = @{
    storeId = 'store-hml'
    customer = @{ name = 'QA HML'; phone = '11999990000' }
    deliveryAddress = @{
      cep = $Cep
      street = 'Praca da Se'
      number = $Number
      neighborhood = 'Centro'
    }
    items = @(
      @{ productId = $ProductId; quantity = 1 }
    )
    paymentMethod = 'PIX'
  }
  $checkout = Invoke-ApiJson 'POST' "$ApiBase/v2/channels/delivery/checkout" $checkoutBody
  $summary.checkout_pix = $true

  $orderId = $checkout.order.id
  $providerPaymentId = $checkout.payment.providerPaymentId

  Write-Ok ("orderId=$orderId")
  Write-Ok ("providerPaymentId=$providerPaymentId")
  Write-Ok ("paymentStatus=$($checkout.payment.status)")
} catch { Write-Fail $_.Exception.Message }

if ($providerPaymentId) {
  try {
    Write-Step '6) GET /v2/payments/:providerPaymentId/status'
    $pstatus = Invoke-ApiGet "$ApiBase/v2/payments/$providerPaymentId/status"
    $summary.payment_status = $true
    Write-Ok ("paymentStatus=$($pstatus.paymentStatus), orderStatus=$($pstatus.orderStatus)")
  } catch { Write-Fail $_.Exception.Message }
} else {
  Write-Fail 'providerPaymentId ausente: pulando teste 6'
}

try {
  Write-Step '7) GET /v2/orders'
  $orders = Invoke-ApiGet "$ApiBase/v2/orders?page=1&limit=20"
  $summary.orders_list = $true
  Write-Ok ("orders retornados: $($orders.data.Count)")
} catch { Write-Fail $_.Exception.Message }

if ($orderId) {
  try {
    Write-Step '8) GET /v2/orders/:id'
    $order = Invoke-ApiGet "$ApiBase/v2/orders/$orderId"
    $summary.order_get = $true
    Write-Ok ("order status atual: $($order.status)")
  } catch { Write-Fail $_.Exception.Message }

  try {
    Write-Step '9) PATCH /v2/orders/:id/status'
    $patch = Invoke-ApiJson 'PATCH' "$ApiBase/v2/orders/$orderId/status" @{ status = 'CONFIRMED' }
    $summary.order_patch_status = $true
    Write-Ok ("order status novo: $($patch.status)")
  } catch { Write-Fail $_.Exception.Message }
} else {
  Write-Fail 'orderId ausente: pulando testes 8 e 9'
}

Write-Step '10) Painel admin manual'
Write-Host 'Abra no navegador: https://app-hml.menuhub.net.br/admin/orders' -ForegroundColor Yellow
if ($orderId) {
  Write-Host "Validar se pedido $orderId aparece e atualiza status." -ForegroundColor Yellow
}

Write-Step 'Resumo'
$summary.GetEnumerator() | ForEach-Object {
  $k = $_.Key
  $v = [bool]$_.Value
  if ($v) { Write-Host "[PASS] $k" -ForegroundColor Green } else { Write-Host "[FAIL] $k" -ForegroundColor Red }
}

$failed = ($summary.Values | Where-Object { -not $_ }).Count
if ($failed -gt 0) {
  Write-Host "`nSmoke test finalizado com falhas: $failed" -ForegroundColor Red
  exit 1
}

Write-Host "`nSmoke test HML V2 finalizado com sucesso." -ForegroundColor Green
exit 0
