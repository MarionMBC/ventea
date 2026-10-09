/** Loose email shape check; the API is the real judge. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Limits mirrored from `registerSchema` in @ventea/shared (contracts/auth.ts). */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_NAME_LENGTH = 80;
export const MIN_PHONE_LENGTH = 5;
export const MAX_PHONE_LENGTH = 30;
