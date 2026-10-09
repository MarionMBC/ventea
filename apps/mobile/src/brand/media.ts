/**
 * Media URLs from the API (product photos, logo, icon). The API sends them
 * absolute (`https://<host>/api/media/<tenant>/<hash>.webp`); a relative
 * `/api/media/...` is resolved against the API origin, just in case.
 *
 * Anything that is not http(s) — `javascript:`, `data:`, protocol-relative
 * `//evil.com` — is dropped: the caller then shows its placeholder.
 */
export const resolveMediaUrl = (
  url: string | null | undefined,
  apiUrl: string,
): string | undefined => {
  if (!url) return undefined;
  const value = url.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).toString();
    } catch {
      return undefined;
    }
  }
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    const base = apiUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    try {
      const resolved = new URL(value, base || 'http://invalid');
      return base ? resolved.toString() : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
};
