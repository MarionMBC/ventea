import { ApiError } from '@/lib/api';

import type { I18n } from './I18nProvider';
import type { TKey } from './translate';

/** Generic, translated reason for an error status the API wrote a message for. */
const BY_STATUS: Partial<Record<number, TKey>> = {
  400: 'errors.badRequest',
  401: 'errors.sessionExpired',
  403: 'errors.forbidden',
  404: 'errors.notFound',
  409: 'errors.conflict',
  422: 'errors.badRequest',
  429: 'errors.tooMany',
};

/**
 * Message to show for an error, always in the panel's language.
 *
 * - The panel's own messages (no network, expired session, fallbacks by status) are translated.
 * - A message written by the API is in Spanish: in Spanish it is shown as is, since it carries
 *   the specific reason (e.g. a plan limit); in any other language the status maps to a
 *   translated reason, and only a status without one falls back to the server's message.
 * - A non-API error (unexpected data) gets a generic message instead of a technical dump.
 */
export function describeError(error: unknown, { t, lang }: Pick<I18n, 't' | 'lang'>): string {
  if (!(error instanceof ApiError)) return t('errors.unexpected');
  switch (error.kind) {
    case 'network':
      return t('errors.network');
    case 'session':
      return t('errors.sessionExpired');
    case 'fallback':
      return byStatus(error.status, t) ?? t('errors.http', { status: error.status });
    default:
      if (lang === 'es') return error.message;
      return byStatus(error.status, t) ?? error.message;
  }
}

function byStatus(status: number, t: I18n['t']): string | undefined {
  if (status >= 500) return t('errors.server', { status });
  const key = BY_STATUS[status];
  return key && t(key);
}
