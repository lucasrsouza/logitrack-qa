import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
  raw: APIResponse;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Cliente HTTP base. Encapsula o APIRequestContext do Playwright, injeta o token
 * quando existe e devolve status + corpo já desserializado. Os testes nunca
 * chamam `request` diretamente: falam com os services (AuthApi, ShipmentsApi).
 */
export class ApiClient {
  constructor(
    protected readonly request: APIRequestContext,
    protected token?: string,
  ) {}

  withToken(token: string | undefined): this {
    const Ctor = this.constructor as new (r: APIRequestContext, t?: string) => this;
    return new Ctor(this.request, token);
  }

  protected async send<T>(
    method: Method,
    path: string,
    options: { data?: unknown; params?: Record<string, string | number>; rawBody?: string; headers?: Record<string, string> } = {},
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { ...options.headers };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (options.rawBody !== undefined) headers['Content-Type'] = 'application/json';

    const raw = await this.request.fetch(path, {
      method,
      headers,
      params: options.params,
      data: options.rawBody ?? options.data,
    });
    const text = await raw.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: raw.status(), body: body as T, raw };
  }
}
