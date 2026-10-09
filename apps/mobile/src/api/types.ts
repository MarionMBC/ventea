/**
 * Wire types of the Ventea API, mirrored from the zod contracts in
 * `@ventea/shared` (`packages/shared/src/contracts/*`).
 *
 * Mirrored rather than imported: the app must keep working against an API one
 * release behind or ahead of it, so fields added later (TASK-016: `accentColor`,
 * `iconUrl`) are optional here and every reader degrades when they are absent.
 *
 * Two rules carried over from the contracts:
 * - money always travels as integer cents (`*Cents`), never as a float;
 * - dates travel as ISO strings (zod's `coerce.date()` serialises them so),
 *   which is why every date below is a `string`.
 */

/* ── Domain vocabulary (domain/enums.ts) ─────────────────────────────── */

export type ApiOrderStatus =
  'draft' | 'pending_payment' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';

/** Statuses an order can no longer leave. */
export const TERMINAL_ORDER_STATUSES: readonly ApiOrderStatus[] = ['completed', 'cancelled'];

export type FulfillmentType = 'pickup' | 'dine_in' | 'delivery';

export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'refunded' | 'failed';

export type RewardLedgerReason =
  'order_earned' | 'redemption' | 'manual_adjustment' | 'expiration' | 'signup_bonus';

/** Header the API reads the tenant from when there is no subdomain. */
export const TENANT_HEADER = 'X-Tenant-Slug';

/* ── Devices / push (TASK-016) ────────────────────────────────────── */

export type DevicePlatform = 'android' | 'ios' | 'web';

export interface RegisterDeviceInput {
  platform: DevicePlatform;
  pushToken: string;
}

export interface Device {
  id: string;
}

/* ── Errors ───────────────────────────────────────────────────────────── */

/** Uniform error body. Nest validation errors may carry a list of messages. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/* ── Auth (contracts/auth.ts) ────────────────────────────────────────── */

/** The API never returns `passwordHash`. Names may be null on legacy accounts. */
export interface Customer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export interface RegisterInput {
  email: string;
  /** 8 to 128 characters. */
  password: string;
  /** 1 to 80 characters. */
  firstName: string;
  lastName: string;
  /** 5 to 30 characters when present. */
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  customer: Customer;
}

export interface UpdateMeInput {
  firstName?: string;
  lastName?: string;
  /** null removes the phone. */
  phone?: string | null;
}

/* ── Tenant and locations (contracts/tenant.ts) ──────────────────────── */

export interface RewardProgram {
  isEnabled: boolean;
  /** Points earned per currency unit spent (may be fractional). */
  pointsPerCurrencyUnit: number;
  /** What one point is worth when redeemed. */
  redemptionValueCents: number;
  minPointsToRedeem: number;
  signupBonusPoints: number;
}

export interface Tenant {
  slug: string;
  name: string;
  currency: string;
  branding: {
    primaryColor: string;
    secondaryColor: string;
    /** TASK-016; optional until every API in the field sends it. */
    accentColor?: string | null;
    /** Absolute media URL (relative `/api/media/...` tolerated). */
    logoUrl: string | null;
    /** TASK-016. */
    iconUrl?: string | null;
    appDisplayName: string | null;
  };
  rewardProgram: RewardProgram;
}

export interface OpeningHours {
  /** 0 = Sunday … 6 = Saturday. */
  day: number;
  opens: string;
  closes: string;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  openingHours: OpeningHours[] | null;
}

/* ── Catalog (contracts/catalog.ts) ──────────────────────────────────── */

export interface ModifierOption {
  id: string;
  name: string;
  /** May be negative (a removed ingredient with a discount). */
  priceDeltaCents: number;
  isAvailable: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  /** Struck-through previous price; null when the item is not on offer. */
  compareAtPriceCents: number | null;
  /** Marketing badges: `popular`, `new`, `hot`, `combo`… */
  tags: string[];
  isAvailable: boolean;
  sortOrder: number;
  modifierGroups: ModifierGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
}

export interface PublicMenu {
  locationId: string;
  currency: string;
  categories: MenuCategory[];
}

/* ── Orders (contracts/orders.ts) ────────────────────────────────────── */

export interface CartLineInput {
  menuItemId: string;
  quantity: number;
  selectedOptionIds: string[];
  notes?: string;
}

/**
 * Order creation. There is deliberately no price anywhere in it: the API
 * recalculates every amount from its own catalogue.
 */
export interface CreateOrderInput {
  locationId: string;
  fulfillmentType: FulfillmentType;
  lines: CartLineInput[];
  scheduledFor?: string;
  redeemRewardPoints: number;
  customerNotes?: string;
}

export interface ApiOrderLine {
  id: string;
  /** null when the item was deleted from the menu after the order. */
  menuItemId: string | null;
  /** Name at purchase time: the menu changes, the order does not. */
  nameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  /** `id` is null when the option was deleted from the menu after the order. */
  selectedOptions: { id: string | null; nameSnapshot: string; priceDeltaCents: number }[];
  notes: string | null;
}

export interface ApiOrder {
  id: string;
  /** Short code the counter calls out, e.g. `DB-4821`. */
  code: string;
  status: ApiOrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentType: FulfillmentType;
  locationId: string;
  lines: ApiOrderLine[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  pointsEarned: number;
  pointsRedeemed: number;
  placedAt: string;
  scheduledFor: string | null;
}

/* ── Rewards (contracts/rewards.ts) ──────────────────────────────────── */

export interface RewardBalance {
  customerId: string;
  balance: number;
  lifetimeEarned: number;
}

export interface RewardLedgerEntry {
  id: string;
  /** Positive credits, negative debits. */
  points: number;
  reason: RewardLedgerReason;
  orderId: string | null;
  note: string | null;
  createdAt: string;
}
