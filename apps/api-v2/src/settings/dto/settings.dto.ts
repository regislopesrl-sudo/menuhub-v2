export type SettingsChannelKey =
  | 'delivery'
  | 'pdv'
  | 'kiosk'
  | 'waiter_app'
  | 'kds'
  | 'whatsapp';

export interface CompanySettingsDto {
  tradeName?: string;
  legalName?: string;
  cnpj?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  timezone?: string | null;
  currency?: 'BRL';
  status?: 'ACTIVE' | 'INACTIVE';
  publicTitle?: string | null;
  publicDescription?: string | null;
  bannerUrl?: string | null;
  closedMessage?: string | null;
}

export interface BranchSettingsDto {
  name?: string;
  code?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
  responsible?: string | null;
  isOpen?: boolean;
}

export interface OperationChannelHoursDto {
  enabled?: boolean;
  openAt?: string | null;
  closeAt?: string | null;
}

export interface WeeklyScheduleEntryDto {
  dayKey: string;
  label?: string;
  isOpen: boolean;
  openAt?: string | null;
  closeAt?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  channels?: Partial<Record<SettingsChannelKey, OperationChannelHoursDto>>;
}

export interface OperationSettingsDto {
  schedules?: WeeklyScheduleEntryDto[];
  channels?: Partial<Record<SettingsChannelKey, boolean>>;
  delivery?: {
    minimumOrder?: number;
    averagePrepMinutes?: number;
    averageDeliveryMinutes?: number;
    allowPickup?: boolean;
    allowDelivery?: boolean;
    serviceFee?: number;
    pricingMode?: 'area' | 'km';
    blockOutsideArea?: boolean;
    allowCashOnDelivery?: boolean;
  };
  fiscal?: {
    serviceTax?: number;
    fiscalObservation?: string | null;
    futureFiscalEnabled?: boolean;
  };
}

export interface PaymentSettingsDto {
  pixActive?: boolean;
  cashActive?: boolean;
  onlineCardActive?: boolean;
  presentCardActive?: boolean;
  mercadoPagoMode?: 'sandbox' | 'production';
}
