import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export type DeliveryQuoteReason = 'OUT_OF_DELIVERY_AREA' | 'BELOW_MINIMUM_ORDER';

export type DeliveryQuoteInput = {
  lat: number;
  lng: number;
  distanceMeters?: number;
  durationSeconds?: number;
  subtotal?: number;
};

export type DeliveryQuoteAddressSnapshot = {
  lat: number;
  lng: number;
};

export type DeliveryQuoteResponse = {
  available: boolean;
  quoteId: string;
  requestId: string;
  areaId: string | null;
  fee: number;
  estimatedMinutes: number;
  minimumOrder: number | null;
  areaName: string | null;
  reason: DeliveryQuoteReason | null;
  message: string | null;
  distanceMeters: number | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  address: DeliveryQuoteAddressSnapshot;
};

export type DeliveryQuoteHttpResponse = DeliveryQuoteResponse & {
  address: {
    cep: string;
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
};

function normalizeCepValue(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeNumberValue(value: unknown): string {
  return String(value ?? '').trim();
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class DeliveryQuoteQueryDto {
  @Transform(({ value }) => normalizeCepValue(value))
  @IsString()
  @Length(8, 8)
  cep!: string;

  @Transform(({ value }) => normalizeNumberValue(value))
  @IsString()
  number!: string;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotal?: number;
}
