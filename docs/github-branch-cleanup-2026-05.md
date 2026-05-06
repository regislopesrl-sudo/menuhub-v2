# GitHub Branch Cleanup Audit - 2026-05

## Stable Main Baseline
- Official branch: `main`
- Stable commit: `73360c5`
- Stable tag: `v2-main-consolidated-2026-05-04`
- Tag note: `Stable consolidated MenuHub V2 main after SaaS/admin/hardening merge`

## Branches Already Deleted (Merged into main)
- `chore/consolidate-open-branches`
- `fix/update-local-seed-saas-schema`
- `chore/integrate-admin-premium-local`
- `feat/saas-commercial-billing`
- `feat/technical-admin-login-mainline`
- `integrate/server-saas-premium-mainline`

## Remaining Remote Branches
- `feat/integrate-technical-login`
- `hardening/production-v1`
- `hotfix/server-sync`
- `integrate/server-saas-premium`
- `sync/full-updated-machine`
- `sync/server-latest-fixes`
- `main`

## Per-Branch Diagnosis and Classification

### `hardening/production-v1`
- Classification: **C (obsolete / do not integrate)**
- Diagnosis:
  - Contains 5 exclusive hardening commits vs `main`.
  - Still has a merge base with `main`.
  - Diff shows overlapping auth/security/payment/test changes already represented in consolidated history.
- Risk:
  - Re-integrating may duplicate or regress security behavior already consolidated.
- Recommendation:
  - Keep temporarily for traceability, then delete after manual confirmation window.

### `feat/integrate-technical-login`
- Classification: **D/E (dangerous + manual review required)**
- Diagnosis:
  - 15 exclusive commits.
  - `git diff origin/main...origin/feat/integrate-technical-login` fails with `no merge base`.
  - Indicates parallel/non-linear history.
- Risk:
  - High risk of accidental reintroduction of old infra/runtime and migration lineage.
- Recommendation:
  - Do not merge.
  - Manual archival review before any deletion.

### `hotfix/server-sync`
- Classification: **D (dangerous / operational history)**
- Diagnosis:
  - 9 exclusive commits.
  - `no merge base` with `main`.
  - Commit intent references HML/server sync and infra behavior.
- Risk:
  - High operational risk (infra/migrations/runtime path changes outside official mainline).
- Recommendation:
  - Keep frozen for audit only; do not merge.

### `integrate/server-saas-premium`
- Classification: **D (dangerous / parallel integration history)**
- Diagnosis:
  - 11 exclusive commits.
  - `no merge base` with `main`.
  - Includes server consolidation and migration lineage history.
- Risk:
  - High risk of parallel-history reintroduction and schema drift.
- Recommendation:
  - Keep for historical reference only; do not merge.

### `sync/full-updated-machine`
- Classification: **C/D (snapshot / obsolete + parallel history)**
- Diagnosis:
  - 4 exclusive commits.
  - `no merge base` with `main`.
  - Snapshot-style branch from machine/server synchronization.
- Risk:
  - Medium-high risk if merged; unclear provenance and parallel lineage.
- Recommendation:
  - Keep temporarily, then delete after explicit archival confirmation.

### `sync/server-latest-fixes`
- Classification: **C/D (snapshot-hotfix / obsolete + parallel history)**
- Diagnosis:
  - 8 exclusive commits.
  - `no merge base` with `main`.
  - Combines server latest-fixes with infra-oriented commits.
- Risk:
  - Medium-high risk of reintroducing historical operational drift.
- Recommendation:
  - Keep temporarily, then delete after explicit archival confirmation.

## Future Administrative Plan
1. Keep all remaining non-main branches temporarily frozen (no merge, no deploy impact).
2. Perform manual archival review for D/E branches (`feat/integrate-technical-login`, `hotfix/server-sync`, `integrate/server-saas-premium`).
3. After review sign-off, delete obsolete snapshot branches (`sync/*`, `hardening/production-v1`) in a controlled cleanup batch.
4. Maintain `main` as single source of truth for all future PRs.

## Final Main Validation Snapshot
- `npm run check:encoding --workspace @delivery-futuro/web-v2`: **OK**
- `npm run build --workspace @delivery-futuro/shared-types`: **OK**
- `npm run build --workspace @delivery-futuro/order-core`: **OK**
- `npm run build --workspace @delivery-futuro/api-v2`: **OK**
- `npm run test --workspace @delivery-futuro/api-v2 -- --runInBand`: **OK** (`44/44 suites`, `250/250 tests`)
- `npm run build --workspace @delivery-futuro/web-v2`: **OK**
