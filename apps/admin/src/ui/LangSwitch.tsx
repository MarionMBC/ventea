import { LANGS, useI18n, type Lang } from '@/i18n';

/** Each language named in itself (and marked with its `lang`), as is usual in selectors. */
const NATIVE_NAME: Record<Lang, string> = { en: 'English', es: 'Español' };

/** EN / ES selector. Two toggle buttons: the short code is visible, the native name is the label. */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t('lang.label')}>
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          className="lang-switch__btn"
          lang={code}
          aria-pressed={lang === code}
          aria-label={NATIVE_NAME[code]}
          onClick={() => setLang(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
