import { expect } from '@playwright/test';
import { ApiClient, type ApiResult } from './api-client';
import { buildShipment, type Shipment, type ShipmentInput, type Status } from '../data/shipment.factory';

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListResponse {
  data: Shipment[];
  meta: ListMeta;
}

export interface ShipmentEvent {
  from: Status | null;
  to: Status;
  at: string;
}

export interface ErrorResponse {
  error: string;
  message?: string;
  details?: { field: string; message: string }[];
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  q?: string;
}

/** Fluxo feliz até cada status, a partir de CREATED. */
export const PATH_TO: Record<Status, Status[]> = {
  CREATED: [],
  IN_TRANSIT: ['IN_TRANSIT'],
  CUSTOMS: ['IN_TRANSIT', 'CUSTOMS'],
  DELIVERED: ['IN_TRANSIT', 'CUSTOMS', 'DELIVERED'],
  CANCELLED: ['CANCELLED'],
};

export class ShipmentsApi extends ApiClient {
  list(params: ListParams = {}): Promise<ApiResult<ListResponse>> {
    return this.send<ListResponse>('GET', '/api/shipments', { params: params as Record<string, string | number> });
  }

  get(id: number | string): Promise<ApiResult<Shipment>> {
    return this.send<Shipment>('GET', `/api/shipments/${id}`);
  }

  create(input: unknown): Promise<ApiResult<Shipment>> {
    return this.send<Shipment>('POST', '/api/shipments', { data: input });
  }

  createRaw(body: string): Promise<ApiResult<ErrorResponse>> {
    return this.send<ErrorResponse>('POST', '/api/shipments', { rawBody: body });
  }

  update(id: number | string, input: unknown): Promise<ApiResult<Shipment>> {
    return this.send<Shipment>('PUT', `/api/shipments/${id}`, { data: input });
  }

  remove(id: number | string): Promise<ApiResult<null>> {
    return this.send<null>('DELETE', `/api/shipments/${id}`);
  }

  changeStatus(id: number | string, status: unknown): Promise<ApiResult<Shipment>> {
    return this.send<Shipment>('PATCH', `/api/shipments/${id}/status`, { data: { status } });
  }

  events(id: number | string): Promise<ApiResult<ShipmentEvent[]>> {
    return this.send<ShipmentEvent[]>('GET', `/api/shipments/${id}/events`);
  }

  /** Cria um embarque válido (com overrides) e falha o teste se a criação não der 201. */
  async createValid(overrides: Partial<ShipmentInput> = {}): Promise<Shipment> {
    const res = await this.create(buildShipment(overrides));
    expect(res.status, `criação de massa: ${JSON.stringify(res.body)}`).toBe(201);
    return res.body;
  }

  /** Cria um embarque e o leva até o status pedido pelo fluxo permitido. */
  async createInStatus(status: Status, overrides: Partial<ShipmentInput> = {}): Promise<Shipment> {
    let shipment = await this.createValid(overrides);
    for (const next of PATH_TO[status]) {
      const res = await this.changeStatus(shipment.id, next);
      expect(res.status, `transição de massa para ${next}`).toBe(200);
      shipment = res.body;
    }
    return shipment;
  }
}
