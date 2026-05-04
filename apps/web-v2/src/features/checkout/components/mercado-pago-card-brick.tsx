'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CardPayment,
  initMercadoPago,
} from '@mercadopago/sdk-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import styles from './mercado-pago-card-brick.module.css';
import type { OnlineCardPaymentInput } from '../checkout.api';

let initializedPublicKey: string | null = null;

export function MercadoPagoCardBrick({
  publicKey,
  amount,
  disabled,
  onSubmit,
}: {
  publicKey: string;
  amount: number;
  disabled?: boolean;
  onSubmit: (input: OnlineCardPaymentInput) => Promise<void>;
}) {
  const submitRef = useRef(onSubmit);
  const inFlightSubmitRef = useRef<Promise<void> | null>(null);
  const [brickReady, setBrickReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    submitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    if (!publicKey.trim() || initializedPublicKey === publicKey.trim()) {
      return;
    }

    initMercadoPago(publicKey.trim(), {
      locale: 'pt-BR',
    });
    initializedPublicKey = publicKey.trim();
  }, [publicKey]);

  if (!publicKey.trim()) {
    return (
      <div className={styles.wrapper}>
        <Badge tone="warning">Brick indisponivel</Badge>
        <p>Defina `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` para habilitar o cartao online tokenizado.</p>
      </div>
    );
  }

  if (amount <= 0) {
    return (
      <div className={styles.wrapper}>
        <Badge tone="warning">Aguardando total</Badge>
        <p>Finalize os itens e a cotacao para habilitar o pagamento com cartao.</p>
      </div>
    );
  }

  const settings = {
    initialization: {
      amount,
    },
    customization: {
      visual: {
        hideFormTitle: false,
      },
    },
    locale: 'pt-BR' as const,
    onReady: () => {
      setBrickReady(true);
      setError(null);
    },
    onError: (brickError: { message?: string } | null | undefined) => {
      setError(brickError?.message ?? 'Falha ao processar o Brick do Mercado Pago.');
    },
    onSubmit: (formData: unknown) => {
      if (disabled) {
        const disabledError = new Error('Pagamento com cartao temporariamente indisponivel.');
        setError(disabledError.message);
        return Promise.reject(disabledError);
      }

      if (inFlightSubmitRef.current) {
        return inFlightSubmitRef.current;
      }

      const normalized = normalizeBrickFormData(formData);
      if (!normalized.ok) {
        setError(normalized.message);
        return Promise.reject(new Error(normalized.message));
      }

      const task = submitRef.current(normalized.value)
        .then(() => {
          setError(null);
        })
        .catch((submitError) => {
          const message =
            submitError instanceof Error ? submitError.message : 'Falha ao processar pagamento com cartao.';
          setError(message);
          throw new Error(message);
        })
        .finally(() => {
          inFlightSubmitRef.current = null;
        });

      inFlightSubmitRef.current = task;
      return task;
    },
  };

  return (
    <div
      className={styles.wrapper}
      aria-busy={!brickReady}
      style={disabled ? { opacity: 0.72, pointerEvents: 'none' } : undefined}
    >
      <div className={styles.header}>
        <div>
          <strong>Cartao online seguro</strong>
          <p>Tokenizacao oficial do Mercado Pago no navegador. O backend recebe apenas token e metadados permitidos.</p>
        </div>
        <Badge tone="success">Brick oficial</Badge>
      </div>
      {!brickReady ? <LoadingState label="Preparando formulario seguro..." /> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.container}>
        <CardPayment {...settings} />
      </div>
    </div>
  );
}

function normalizeBrickFormData(input: unknown):
  | { ok: true; value: OnlineCardPaymentInput }
  | { ok: false; message: string } {
  const record = asRecord(input);
  const payer = asRecord(record?.payer);
  const identification = asRecord(payer?.identification);
  const cardToken = readString(record, 'token');
  const paymentMethodId = readString(record, 'payment_method_id') ?? readString(record, 'paymentMethodId');
  const payerEmail = readString(payer, 'email') ?? readString(record, 'email');
  const installmentsRaw = record?.installments;
  const installments = Number(installmentsRaw ?? 1);
  const issuerId = readString(record, 'issuer_id') ?? readString(record, 'issuerId');
  const identificationType =
    readString(identification, 'type') ?? readString(record, 'identificationType');
  const identificationNumber =
    readString(identification, 'number') ?? readString(record, 'identificationNumber');

  if (!cardToken) {
    return { ok: false, message: 'O Brick nao retornou cardToken para o pagamento.' };
  }
  if (!paymentMethodId) {
    return { ok: false, message: 'O Brick nao retornou paymentMethodId para o pagamento.' };
  }
  if (!payerEmail) {
    return { ok: false, message: 'O Brick nao retornou email do pagador.' };
  }
  if (!Number.isFinite(installments) || installments < 1) {
    return { ok: false, message: 'O Brick retornou parcelas invalidas.' };
  }

  return {
    ok: true,
    value: {
      cardToken,
      paymentMethodId,
      installments,
      issuerId: issuerId ?? undefined,
      payerEmail,
      identificationType: identificationType ?? undefined,
      identificationNumber: identificationNumber ?? undefined,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(input: Record<string, unknown> | null, key: string) {
  const value = input?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
