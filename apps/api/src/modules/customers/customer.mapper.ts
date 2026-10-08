import type { Customer } from '@ventea/shared';

/** Proyección pública del cliente. Lista blanca: `passwordHash` nunca sale de acá. */
export const CUSTOMER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
} as const;

export function toCustomer(row: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}): Customer {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
  };
}
