import { ApiError } from '@/lib/api';

import type { I18n } from './I18nProvider';

/**
 * Message to show for an error. The panel's own messages (no network, expired session,
 * fallbacks by status) are translated; a message written by the API is shown as is, since it
 * usually carries the specific reason (e.g. a plan limit). A non-API error (unexpected data)
 * gets a generic message instead of a technical dump.
 */
export function describeError(error: unknown, t: I18n['t']): string {
  if (!(error instanceof ApiError)) return t('errors.unexpected');
  switch (error.kind) {
    case 'network':
      return t('errors.network');
    case 'session':
      return t('errors.sessionExpired');
    case 'fallback':
      if (error.status === 429) return t('errors.tooMany');
      return error.status >= 500
        ? t('errors.server', { status: error.status })
        : t('errors.http', { status: error.status });
    default:
      return error.message;
  }
}
