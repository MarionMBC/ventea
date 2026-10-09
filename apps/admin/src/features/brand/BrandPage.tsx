import {
  BRAND_LANGUAGE,
  type Brand,
  type BrandLanguage,
  type UpdateBrandInput,
} from '@ventea/shared';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { useSession } from '@/app/services';
import { useStaffMenu } from '@/features/menu/api';
import { describeError, useI18n } from '@/i18n';
import { IconAlert, IconPalette, IconRefresh, IconSmartphone, IconStar } from '@/ui/icons';
import { ImageUpload } from '@/ui/ImageUpload';

import { useBrand, useUpdateBrand } from './api';
import { AppSection } from './AppSection';
import { ColorField } from './ColorField';
import { PhonePreview } from './PhonePreview';

interface Draft {
  appDisplayName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  storeShortDescription: string;
  supportEmail: string;
  websiteUrl: string;
  language: BrandLanguage;
}

function draftOf(brand: Brand): Draft {
  return {
    appDisplayName: brand.appDisplayName,
    primaryColor: brand.primaryColor.toLowerCase(),
    secondaryColor: brand.secondaryColor.toLowerCase(),
    accentColor: brand.accentColor?.toLowerCase() ?? null,
    logoUrl: brand.logoUrl,
    iconUrl: brand.iconUrl,
    storeShortDescription: brand.storeShortDescription ?? '',
    supportEmail: brand.supportEmail ?? '',
    websiteUrl: brand.websiteUrl ?? '',
    language: brand.language,
  };
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lo que cambió respecto de lo guardado, listo para `PATCH /api/staff/brand`. */
export function brandPatch(saved: Draft, draft: Draft): UpdateBrandInput {
  const patch: UpdateBrandInput = {};
  const text = (value: string) => value.trim() || null;
  if (draft.appDisplayName.trim() !== saved.appDisplayName) {
    patch.appDisplayName = draft.appDisplayName.trim();
  }
  if (draft.primaryColor !== saved.primaryColor) patch.primaryColor = draft.primaryColor;
  if (draft.secondaryColor !== saved.secondaryColor) patch.secondaryColor = draft.secondaryColor;
  if (draft.accentColor !== saved.accentColor) patch.accentColor = draft.accentColor;
  if (draft.logoUrl !== saved.logoUrl) patch.logoUrl = draft.logoUrl;
  if (draft.iconUrl !== saved.iconUrl) patch.iconUrl = draft.iconUrl;
  for (const key of ['storeShortDescription', 'supportEmail', 'websiteUrl'] as const) {
    if (text(draft[key]) !== text(saved[key])) patch[key] = text(draft[key]);
  }
  if (draft.language !== saved.language) patch.language = draft.language;
  return patch;
}

/**
 * Mi marca (`/admin/brand`, solo el dueño): nombre de la app, logo e ícono, colores con
 * advertencias de contraste, textos de tienda, soporte e idioma; a la par, la vista previa del
 * teléfono con el menú real; y la sección «App propia».
 */
export function BrandPage() {
  const session = useSession();
  const isOwner = session?.staff.role === 'owner';
  const i18n = useI18n();
  const { t } = i18n;
  const brand = useBrand(isOwner);
  const menu = useStaffMenu();
  const update = useUpdateBrand();
  const formId = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [uploading, setUploading] = useState(0);
  /** Campos de color con un hex a medio escribir: bloquean Guardar. */
  const [badHex, setBadHex] = useState<ReadonlySet<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    document.title = t('brand.pageTitle');
  }, [t]);

  if (session && !isOwner) return <Navigate to="/orders" replace />;

  if (brand.error && !brand.data) {
    return (
      <div className="state state--error" role="alert">
        <span className="state__icon">
          <IconAlert size={28} />
        </span>
        <h1>{t('brand.errorTitle')}</h1>
        <p>{describeError(brand.error, i18n)}</p>
        <button type="button" className="btn btn--primary" onClick={() => void brand.refetch()}>
          <IconRefresh size={18} />
          {t('board.retry')}
        </button>
      </div>
    );
  }
  if (!brand.data) {
    return (
      <div className="page" role="status">
        <span className="sr-only">{t('brand.loading')}</span>
        <div className="page-grid" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="card card--skeleton">
              <span className="skeleton" style={{ width: '40%', height: 22 }} />
              <span className="skeleton" style={{ width: '90%', height: 14 }} />
              <span className="skeleton" style={{ width: '75%', height: 14 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const saved = draftOf(brand.data);
  const current = draft ?? saved;
  const patch = brandPatch(saved, current);
  const dirty = Object.keys(patch).length > 0;
  const warnings = brand.data.warnings;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    // Funcional: una subida que termina después (logo, ícono) no pisa lo escrito mientras tanto
    // ni la otra subida.
    setDraft((prev) => ({ ...(prev ?? saved), [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setFlash(null);
  };
  const hexInvalid = (field: string, invalid: boolean) =>
    setBadHex((prev) => {
      if (prev.has(field) === invalid) return prev;
      const next = new Set(prev);
      if (invalid) next.add(field);
      else next.delete(field);
      return next;
    });
  const busyUpload = (busy: boolean) => setUploading((n) => Math.max(0, n + (busy ? 1 : -1)));

  const validate = () => {
    const found: Partial<Record<keyof Draft, string>> = {};
    if (!current.appDisplayName.trim()) found.appDisplayName = t('brand.nameRequired');
    for (const key of ['primaryColor', 'secondaryColor'] as const) {
      if (!HEX6.test(current[key])) found[key] = t('brand.colorInvalid');
    }
    if (current.accentColor !== null && !HEX6.test(current.accentColor)) {
      found.accentColor = t('brand.colorInvalid');
    }
    if (current.supportEmail.trim() && !EMAIL.test(current.supportEmail.trim())) {
      found.supportEmail = t('brand.emailInvalid');
    }
    if (current.websiteUrl.trim() && !/^https:\/\/\S+\.\S+/.test(current.websiteUrl.trim())) {
      found.websiteUrl = t('brand.websiteInvalid');
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || update.isPending || uploading > 0 || badHex.size > 0 || !validate()) return;
    update.mutate(patch, {
      onSuccess: () => {
        setDraft(null);
        setFlash(t('brand.saved'));
      },
    });
  };

  const discard = () => {
    setDraft(null);
    setErrors({});
    setBadHex(new Set());
    update.reset();
  };

  const fieldError = (key: keyof Draft) =>
    errors[key] ? (
      <p id={`${formId}-${key}-error`} className="field__error">
        {errors[key]}
      </p>
    ) : null;
  const errorRef = (key: keyof Draft) => (errors[key] ? `${formId}-${key}-error` : undefined);
  const savedColor = (field: 'primaryColor' | 'secondaryColor' | 'accentColor') => ({
    color: saved[field],
    warnings,
  });

  return (
    <section className="page brand" aria-labelledby="brand-title">
      <header className="page-head">
        <div className="page-head__text">
          <h1 id="brand-title" className="page-head__title">
            {t('brand.title')}
          </h1>
          <p className="page-head__sub">{t('brand.subtitle')}</p>
        </div>
      </header>

      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}

      <div className="brand__layout">
        <aside className="brand__preview" aria-labelledby="brand-preview-title">
          <h2 id="brand-preview-title" className="brand__preview-title">
            {t('brand.previewTitle')}
          </h2>
          <PhonePreview brand={current} menu={menu.data} />
        </aside>

        <div className="brand__main">
          <form id={formId} className="brand__form" onSubmit={onSubmit} noValidate>
            {/* Mientras se guarda no se edita: lo que se escriba no se perdería en silencio. */}
            <fieldset className="brand__fieldset" disabled={update.isPending}>
              <article className="card" aria-labelledby="brand-identity">
                <div className="card__head">
                  <span className="card__icon" aria-hidden="true">
                    <IconStar size={20} />
                  </span>
                  <h2 id="brand-identity">{t('brand.identity')}</h2>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`${formId}-name`}>
                    {t('brand.appName')}
                  </label>
                  <input
                    id={`${formId}-name`}
                    className="field__input"
                    value={current.appDisplayName}
                    maxLength={30}
                    aria-invalid={!!errors.appDisplayName}
                    aria-describedby={[`${formId}-name-hint`, errorRef('appDisplayName')]
                      .filter(Boolean)
                      .join(' ')}
                    onChange={(event) => set('appDisplayName', event.target.value)}
                  />
                  <p id={`${formId}-name-hint`} className="field__hint">
                    {t('brand.appNameHint', { count: 30 - current.appDisplayName.length })}
                  </p>
                  {fieldError('appDisplayName')}
                </div>
                <div className="brand__images">
                  <ImageUpload
                    label={t('brand.logo')}
                    hint={t('brand.logoHint')}
                    value={current.logoUrl}
                    onChange={(url) => set('logoUrl', url)}
                    onBusyChange={busyUpload}
                    shape="square"
                  />
                  <ImageUpload
                    label={t('brand.icon')}
                    hint={t('brand.iconHint')}
                    value={current.iconUrl}
                    onChange={(url) => set('iconUrl', url)}
                    onBusyChange={busyUpload}
                    shape="square"
                  />
                </div>
              </article>

              <article className="card" aria-labelledby="brand-colors">
                <div className="card__head">
                  <span className="card__icon" aria-hidden="true">
                    <IconPalette size={20} />
                  </span>
                  <h2 id="brand-colors">{t('brand.colors')}</h2>
                </div>
                <ColorField
                  field="primaryColor"
                  label={t('brand.primary')}
                  hint={t('brand.primaryHint')}
                  value={current.primaryColor}
                  onChange={(value) => value && set('primaryColor', value)}
                  saved={savedColor('primaryColor')}
                  onInvalid={hexInvalid}
                />
                <ColorField
                  field="secondaryColor"
                  label={t('brand.secondary')}
                  hint={t('brand.secondaryHint')}
                  value={current.secondaryColor}
                  onChange={(value) => value && set('secondaryColor', value)}
                  saved={savedColor('secondaryColor')}
                  onInvalid={hexInvalid}
                />
                <ColorField
                  field="accentColor"
                  label={t('brand.accent')}
                  hint={t('brand.accentHint')}
                  value={current.accentColor}
                  onChange={(value) => set('accentColor', value)}
                  saved={savedColor('accentColor')}
                  onInvalid={hexInvalid}
                  optional
                />
              </article>

              <article className="card" aria-labelledby="brand-store">
                <div className="card__head">
                  <span className="card__icon" aria-hidden="true">
                    <IconSmartphone size={20} />
                  </span>
                  <h2 id="brand-store">{t('brand.store')}</h2>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`${formId}-desc`}>
                    {t('brand.storeDescription')}{' '}
                    <span className="field__optional">{t('common.optional')}</span>
                  </label>
                  <input
                    id={`${formId}-desc`}
                    className="field__input"
                    value={current.storeShortDescription}
                    maxLength={80}
                    aria-describedby={`${formId}-desc-hint`}
                    onChange={(event) => set('storeShortDescription', event.target.value)}
                  />
                  <p id={`${formId}-desc-hint`} className="field__hint">
                    {t('brand.storeDescriptionHint', {
                      count: 80 - current.storeShortDescription.length,
                    })}
                  </p>
                </div>
                <div className="form-row">
                  <div className="field">
                    <label className="field__label" htmlFor={`${formId}-email`}>
                      {t('brand.supportEmail')}{' '}
                      <span className="field__optional">{t('common.optional')}</span>
                    </label>
                    <input
                      id={`${formId}-email`}
                      className="field__input"
                      type="email"
                      autoComplete="email"
                      value={current.supportEmail}
                      aria-invalid={!!errors.supportEmail}
                      aria-describedby={errorRef('supportEmail')}
                      onChange={(event) => set('supportEmail', event.target.value)}
                    />
                    {fieldError('supportEmail')}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${formId}-web`}>
                      {t('brand.website')}{' '}
                      <span className="field__optional">{t('common.optional')}</span>
                    </label>
                    <input
                      id={`${formId}-web`}
                      className="field__input"
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={current.websiteUrl}
                      aria-invalid={!!errors.websiteUrl}
                      aria-describedby={errorRef('websiteUrl')}
                      onChange={(event) => set('websiteUrl', event.target.value)}
                    />
                    {fieldError('websiteUrl')}
                  </div>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`${formId}-lang`}>
                    {t('brand.language')}
                  </label>
                  <select
                    id={`${formId}-lang`}
                    className="field__input"
                    value={current.language}
                    aria-describedby={`${formId}-lang-hint`}
                    onChange={(event) => set('language', event.target.value as BrandLanguage)}
                  >
                    {BRAND_LANGUAGE.map((lang) => (
                      <option key={lang} value={lang}>
                        {t(`langName.${lang}`)}
                      </option>
                    ))}
                  </select>
                  <p id={`${formId}-lang-hint`} className="field__hint">
                    {t('brand.languageHint')}
                  </p>
                </div>
              </article>

              {update.error && (
                <p className="form-error" role="alert">
                  {describeError(update.error, i18n)}
                </p>
              )}

              <div className={`savebar${dirty ? ' is-dirty' : ''}`}>
                <span className="savebar__text" role="status">
                  {uploading > 0
                    ? t('upload.uploading')
                    : dirty
                      ? t('brand.unsaved')
                      : t('brand.allSaved')}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={discard}
                  disabled={!dirty || update.isPending}
                >
                  {t('brand.discard')}
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={!dirty || update.isPending || uploading > 0 || badHex.size > 0}
                >
                  {update.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </fieldset>
          </form>

          <AppSection brand={brand.data} onRequested={() => setFlash(t('ownApp.requested'))} />
        </div>
      </div>
    </section>
  );
}
