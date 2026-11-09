/**
 * Usuários de teste publicados no README da própria aplicação (massa fictícia de avaliação).
 * Podem ser sobrescritos por variáveis de ambiente, caso o ambiente use outra massa.
 */
export type Role = 'admin' | 'analista';

export interface TestUser {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export const USERS: Record<Role, TestUser> = {
  analista: {
    name: 'Ana Analista',
    email: process.env.ANALISTA_EMAIL ?? 'analista@logitrack.test',
    password: process.env.ANALISTA_PASSWORD ?? 'Senha@123',
    role: 'analista',
  },
  admin: {
    name: 'Admin Master',
    email: process.env.ADMIN_EMAIL ?? 'admin@logitrack.test',
    password: process.env.ADMIN_PASSWORD ?? 'Admin@123',
    role: 'admin',
  },
};
