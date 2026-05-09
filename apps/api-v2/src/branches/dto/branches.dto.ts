export interface CreateBranchDto {
  name: string;
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
}

export interface UpdateBranchDto extends Partial<CreateBranchDto> {}
