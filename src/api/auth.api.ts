import { expect } from '@playwright/test';
import { ApiClient, type ApiResult } from './api-client';
import type { TestUser } from '../data/users';

export interface LoginResponse {
  token: string;
  user: { id: number; name: string; email: string; role: 'admin' | 'analista'; [extra: string]: unknown };
}

export class AuthApi extends ApiClient {
  login(email: unknown, password: unknown): Promise<ApiResult<LoginResponse>> {
    return this.send<LoginResponse>('POST', '/api/auth/login', { data: { email, password } });
  }

  /** Atalho para os testes que só precisam de um token válido. */
  async tokenFor(user: TestUser): Promise<string> {
    const res = await this.login(user.email, user.password);
    expect(res.status, `login de ${user.email}`).toBe(200);
    return res.body.token;
  }

  health(): Promise<ApiResult<{ status: string }>> {
    return this.send('GET', '/api/health');
  }

  reset(): Promise<ApiResult<null>> {
    return this.send('POST', '/api/__reset');
  }
}
