# Android Readiness (Totem + App Garcom)

## Objetivo
Preparar o `web-v2` para rodar como aplicativo Android via PWA + Capacitor, sem alterar backend de producao.

## O que foi preparado
- Manifest PWA (`src/app/manifest.ts`)
- Service Worker base (`public/sw.js`)
- Registro automático do SW (`src/components/pwa-register.tsx`)
- Metadados mobile no layout (`src/app/layout.tsx`)
- Configuração Capacitor (`capacitor.config.ts`)
- Scripts:
  - `npm run android:sync --workspace @delivery-futuro/web-v2`
  - `npm run android:copy --workspace @delivery-futuro/web-v2`
  - `npm run android:open --workspace @delivery-futuro/web-v2`

## Fluxo recomendado para APK local
1. `npm install`
2. `npm run build --workspace @delivery-futuro/web-v2`
3. `npm run android:sync --workspace @delivery-futuro/web-v2`
4. `npm run android:open --workspace @delivery-futuro/web-v2`
5. Build no Android Studio (`debug` primeiro)

## Observações
- Nesta etapa o SW está mínimo (bootstrap). Caching avançado entra no próximo hardening.
- Para totem/kiosk protegido, configurar `KIOSK_PUBLIC_TOKEN` no backend.
- Para app garçom, manter autenticação JWT + `waiter.operate`.
