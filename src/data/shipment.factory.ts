/**
 * Test Data Builder para embarques.
 * Gera sempre um payload VÁLIDO pelas regras de negócio; cada teste sobrescreve
 * apenas o campo que quer exercitar, o que deixa explícita a intenção do cenário.
 */
export type Status = 'CREATED' | 'IN_TRANSIT' | 'CUSTOMS' | 'DELIVERED' | 'CANCELLED';
export type Incoterm = 'FOB' | 'CIF' | 'EXW' | 'DAP' | 'DDP';

export const STATUSES: Status[] = ['CREATED', 'IN_TRANSIT', 'CUSTOMS', 'DELIVERED', 'CANCELLED'];
export const INCOTERMS: Incoterm[] = ['FOB', 'CIF', 'EXW', 'DAP', 'DDP'];

/** Rótulos exibidos pela interface para cada status. */
export const STATUS_LABEL: Record<Status, string> = {
  CREATED: 'Criado',
  IN_TRANSIT: 'Em trânsito',
  CUSTOMS: 'Desembaraço',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
};

export interface ShipmentInput {
  reference: string;
  customer: string;
  origin: string;
  destination: string;
  incoterm: Incoterm;
  weightKg: number;
  valueUsd: number;
}

export interface Shipment extends ShipmentInput {
  id: number;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

/** A massa inicial usa LT-2026-0001 a LT-2026-0027; os testes geram a partir de 5000. */
let sequence = 5000 + Math.floor(Math.random() * 3000);

export function uniqueReference(year = 2026): string {
  sequence = sequence >= 9999 ? 5000 : sequence + 1;
  return `LT-${year}-${String(sequence).padStart(4, '0')}`;
}

export function buildShipment(overrides: Partial<Record<keyof ShipmentInput, unknown>> = {}): ShipmentInput {
  const reference = uniqueReference();
  return {
    reference,
    customer: `Cliente QA ${reference.slice(-4)}`,
    origin: 'Santos, BR',
    destination: 'Rotterdam, NL',
    incoterm: 'FOB',
    weightKg: 1250.5,
    valueUsd: 15430.75,
    ...overrides,
  } as ShipmentInput;
}
