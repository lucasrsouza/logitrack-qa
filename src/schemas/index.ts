import Ajv, { type SchemaObject } from 'ajv';
import addFormats from 'ajv-formats';
import { expect } from '@playwright/test';
import { INCOTERMS, STATUSES } from '../data/shipment.factory';

/**
 * Schemas JSON derivados do openapi.yaml entregue com a aplicação.
 * `additionalProperties: false` é proposital: o contrato lista os campos de cada
 * resposta e qualquer campo extra (ex.: dados sensíveis) deve quebrar o teste.
 */
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export const shipmentSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'reference', 'customer', 'origin', 'destination', 'incoterm', 'weightKg', 'valueUsd', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'integer', minimum: 1 },
    reference: { type: 'string', pattern: '^LT-\\d{4}-\\d{4}$' },
    customer: { type: 'string', minLength: 2, maxLength: 80 },
    origin: { type: 'string', minLength: 1 },
    destination: { type: 'string', minLength: 1 },
    incoterm: { enum: INCOTERMS },
    weightKg: { type: 'number', exclusiveMinimum: 0, maximum: 30000 },
    valueUsd: { type: 'number', exclusiveMinimum: 0, maximum: 10000000 },
    status: { enum: STATUSES },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

/**
 * Forma do embarque (campos e tipos), sem as faixas das regras de negócio.
 * Usada na listagem, que também devolve a massa inicial; a massa tem registros
 * que violam as regras (BUG-23), e isso é verificado à parte pelos testes de SQL.
 */
export const shipmentShapeSchema: SchemaObject = {
  ...shipmentSchema,
  properties: {
    ...shipmentSchema.properties,
    weightKg: { type: 'number' },
    valueUsd: { type: 'number' },
  },
};

export const listSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: shipmentShapeSchema },
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['page', 'pageSize', 'total', 'totalPages'],
      properties: {
        page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100 },
        total: { type: 'integer', minimum: 0 },
        totalPages: { type: 'integer', minimum: 0 },
      },
    },
  },
};

export const loginSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'user'],
  properties: {
    token: { type: 'string', pattern: '^[\\w-]+\\.[\\w-]+\\.[\\w-]+$' },
    user: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'email', 'role'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        role: { enum: ['admin', 'analista'] },
      },
    },
  },
};

export const eventsSchema: SchemaObject = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['from', 'to', 'at'],
    properties: {
      from: { anyOf: [{ type: 'null' }, { enum: STATUSES }] },
      to: { enum: STATUSES },
      at: { type: 'string', format: 'date-time' },
    },
  },
};

export const errorSchema: SchemaObject = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        required: ['field', 'message'],
        properties: { field: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
};

/** Valida o corpo contra o schema e, se falhar, mostra os erros do AJV na mensagem. */
export function expectToMatchSchema(body: unknown, schema: SchemaObject): void {
  const validate = ajv.compile(schema);
  const valid = validate(body);
  expect(valid, `contrato violado:\n${ajv.errorsText(validate.errors, { separator: '\n' })}\ncorpo: ${JSON.stringify(body)}`).toBe(true);
}
