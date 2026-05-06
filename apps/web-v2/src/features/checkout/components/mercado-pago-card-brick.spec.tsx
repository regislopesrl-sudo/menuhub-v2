import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MercadoPagoCardBrick } from './mercado-pago-card-brick';

const sdkMock = jest.fn<void, [string, { locale: string }]>();
let latestCardPaymentProps: Record<string, unknown> | null = null;

jest.mock('@mercadopago/sdk-react', () => {
  const React = require('react');
  return {
    initMercadoPago: (publicKey: string, options: { locale: string }) => sdkMock(publicKey, options),
    CardPayment: (props: Record<string, unknown>) => {
      latestCardPaymentProps = props;
      return React.createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            (props.onSubmit as ((payload: unknown) => unknown) | undefined)?.({
              token: 'card_token_123',
              issuer_id: 'issuer_1',
              payment_method_id: 'visa',
              installments: 3,
              payer: {
                email: 'payer@menuhub.local',
                identification: {
                  type: 'CPF',
                  number: '12345678900',
                },
              },
            }),
        },
        'Mock CardPayment',
      );
    },
  };
});

describe('MercadoPagoCardBrick', () => {
  beforeEach(() => {
    sdkMock.mockReset();
    latestCardPaymentProps = null;
  });

  it('inicializa Mercado Pago apenas uma vez com a mesma public key em StrictMode', async () => {
    render(
      <StrictMode>
        <MercadoPagoCardBrick
          publicKey="APP_USR_test_public_key"
          amount={42}
          onSubmit={jest.fn().mockResolvedValue(undefined)}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(sdkMock).toHaveBeenCalledTimes(1);
    });
    expect(sdkMock).toHaveBeenCalledWith('APP_USR_test_public_key', { locale: 'pt-BR' });
  });

  it('mostra erro quando o Brick reporta falha', async () => {
    render(
      <MercadoPagoCardBrick
        publicKey="APP_USR_test_public_key"
        amount={42}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    const onError = latestCardPaymentProps?.onError as ((error: { message?: string }) => void) | undefined;
    await act(async () => {
      onError?.({ message: 'Falha de tokenizacao' });
    });

    expect(await screen.findByText('Falha de tokenizacao')).toBeInTheDocument();
  });

  it('normaliza o submit e evita envio duplicado concorrente', async () => {
    let resolveSubmit: (() => void) | null = null;
    const onSubmit = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(
      <MercadoPagoCardBrick
        publicKey="APP_USR_test_public_key"
        amount={42}
        onSubmit={onSubmit}
      />,
    );

    const button = screen.getByRole('button', { name: 'Mock CardPayment' });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith({
      cardToken: 'card_token_123',
      paymentMethodId: 'visa',
      installments: 3,
      issuerId: 'issuer_1',
      payerEmail: 'payer@menuhub.local',
      identificationType: 'CPF',
      identificationNumber: '12345678900',
    });

    (resolveSubmit as (() => void) | null)?.();
  });
});
