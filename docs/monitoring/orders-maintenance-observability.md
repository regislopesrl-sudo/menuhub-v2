# Observabilidade dos Jobs de Maintenance (Pedidos)

## Endpoint de metricas

- Endpoint Prometheus: `GET /api/health/metrics`
- Formato: `text/plain` (Prometheus exposition format)
- Principais metricas:
  - `orders_maintenance_job_runs_total`
  - `orders_maintenance_job_success_total`
  - `orders_maintenance_job_failure_total`
  - `orders_maintenance_job_duration_ms_sum`
  - `orders_maintenance_job_duration_ms_count`
  - `orders_maintenance_job_last_duration_ms`
  - `orders_maintenance_job_in_flight`

## Subir stack local de monitoramento

1. Garantir backend rodando em `http://localhost:3100`.
2. Subir Prometheus + Alertmanager + Grafana:

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

3. Prometheus: `http://localhost:9090`
4. Alertmanager: `http://localhost:9093`
5. Grafana: `http://localhost:3002` (usuario/senha: `admin`/`admin`)
6. Em deploy remoto, `scripts/deploy.sh` ja sobe essa stack automaticamente.

## Dashboard Grafana

- Arquivo pronto para import: `monitoring/grafana/dashboards/orders-maintenance-dashboard.json`
- Provisionamento automatico (sem import manual):
  - Datasource: `monitoring/grafana/provisioning/datasources/prometheus.yml`
  - Dashboard provider: `monitoring/grafana/provisioning/dashboards/orders-maintenance.yml`
  - Alert rules Grafana: `monitoring/grafana/provisioning/alerting/orders-maintenance-alerts.yml`
  - Dashboard JSON: `monitoring/grafana/dashboards/orders-maintenance-dashboard.json`
- O `docker-compose.monitoring.yml` ja monta os paths de provisioning para subir tudo pronto.

## Queries prontas

- Runs por janela de 5 min:
  - `increase(orders_maintenance_job_runs_total[5m])`
- Taxa de falha por job (15 min):
  - `sum by (job) (increase(orders_maintenance_job_failure_total[15m])) / clamp_min(sum by (job) (increase(orders_maintenance_job_runs_total[15m])), 1)`
- Latencia media por job (15 min):
  - `rate(orders_maintenance_job_duration_ms_sum[15m]) / clamp_min(rate(orders_maintenance_job_duration_ms_count[15m]), 0.001)`
- Ultima latencia registrada:
  - `orders_maintenance_job_last_duration_ms`
- Jobs em execucao:
  - `orders_maintenance_job_in_flight`

## Alertas sugeridos (Grafana/Prometheus)

- Falha recorrente de `kitchen_reprocess`:
  - Expressao: `increase(orders_maintenance_job_failure_total{job="kitchen_reprocess"}[15m]) > 0`
  - Severidade: `warning`
- Falha recorrente de `reconcile`:
  - Expressao: `increase(orders_maintenance_job_failure_total{job="reconcile"}[15m]) > 0`
  - Severidade: `warning`
- Latencia alta de reconcile:
  - Expressao: `(rate(orders_maintenance_job_duration_ms_sum{job="reconcile"}[15m]) / clamp_min(rate(orders_maintenance_job_duration_ms_count{job="reconcile"}[15m]), 0.001)) > 15000`
  - Severidade: `critical`
- Job travado em execucao:
  - Expressao: `max_over_time(orders_maintenance_job_in_flight{job="kitchen_reprocess"}[10m]) == 1`
  - Severidade: `critical`

## Alertas no Prometheus

- Regras provisionadas em: `monitoring/prometheus/rules/orders-maintenance-alerts.yml`
- Carregadas por: `monitoring/prometheus/prometheus.yml` via `rule_files`
- Roteadas para Alertmanager: `monitoring/prometheus/prometheus.yml` (`alertmanager:9093`)

## Alertmanager (roteamento/notificacao)

- Config base: `monitoring/alertmanager/alertmanager.yml`
- Trocar o receiver `ops-default` para canal real no ambiente alvo (Slack/Email/PagerDuty).

## CI (build + testes novos)

- Workflow padrao: `.github/workflows/ci.yml`
- Executa:
  - `npm run test --workspace @delivery-futuro/backend -- src/orders/orders.maintenance.e2e.spec.ts`
  - `npm run build --workspace @delivery-futuro/backend`

## Variaveis de ambiente dos jobs

- `ORDERS_MAINTENANCE_JOBS_ENABLED` (default: `true`)
- `ORDERS_KITCHEN_REPROCESS_INTERVAL_MS` (default: `60000`)
- `ORDERS_RECONCILE_INTERVAL_MS` (default: `120000`)
