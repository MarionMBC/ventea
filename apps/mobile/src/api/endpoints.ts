import { api } from './client';
import type {
  ApiOrder,
  AuthResponse,
  Device,
  RegisterDeviceInput,
  CreateOrderInput,
  Customer,
  Location,
  LoginInput,
  PublicMenu,
  RegisterInput,
  RewardBalance,
  RewardLedgerEntry,
  Tenant,
  UpdateMeInput,
} from './types';

/**
 * One function per endpoint the app uses.
 * Screens call these, never `api.request` with a hand-written path, so the
 * whole HTTP surface of the app reads top to bottom in this file.
 */

const PUBLIC = { auth: false } as const;

/* Auth — public by definition: a 401 here is a wrong password, not an expired token. */
export const register = (input: RegisterInput) =>
  api.post<AuthResponse>('/api/auth/register', input, PUBLIC);
export const login = (input: LoginInput) =>
  api.post<AuthResponse>('/api/auth/login', input, PUBLIC);

/* Customer */
export const getMe = (signal?: AbortSignal) => api.get<Customer>('/api/me', { signal });
export const updateMe = (input: UpdateMeInput) => api.patch<Customer>('/api/me', input);

/* Tenant and catalogue — public */
export const getTenant = (signal?: AbortSignal) =>
  api.get<Tenant>('/api/tenant', { ...PUBLIC, signal });
export const getLocations = (signal?: AbortSignal) =>
  api.get<Location[]>('/api/locations', { ...PUBLIC, signal });
export const getMenu = (signal?: AbortSignal) =>
  api.get<PublicMenu>('/api/menu', { ...PUBLIC, signal });

/* Orders */
/**
 * Places an order. The idempotency key makes retries safe: the API answers a
 * repeated key (same body) with the order it already created.
 */
export const createOrder = (input: CreateOrderInput, idempotencyKey: string) =>
  api.post<ApiOrder>('/api/orders', input, { headers: { 'Idempotency-Key': idempotencyKey } });
export const listOrders = (signal?: AbortSignal) => api.get<ApiOrder[]>('/api/orders', { signal });
export const getOrder = (id: string, signal?: AbortSignal) =>
  api.get<ApiOrder>(`/api/orders/${encodeURIComponent(id)}`, { signal });
export const cancelOrder = (id: string) =>
  api.post<ApiOrder>(`/api/orders/${encodeURIComponent(id)}/cancel`);

/* Rewards */
export const getRewardBalance = (signal?: AbortSignal) =>
  api.get<RewardBalance>('/api/rewards/balance', { signal });
export const getRewardLedger = (signal?: AbortSignal) =>
  api.get<RewardLedgerEntry[]>('/api/rewards/ledger', { signal });

/* Devices (push, TASK-016) */
/** Upserts this device's push token for the signed-in customer. */
export const registerDevice = (input: RegisterDeviceInput) =>
  api.post<Device>('/api/devices', input);
export const deleteDevice = (id: string) =>
  api.delete<void>(`/api/devices/${encodeURIComponent(id)}`);
