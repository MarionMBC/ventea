import { filledToneHex, isHexColor, parseHexRgb, readableOn, type StaffMenu } from '@ventea/shared';
import type { CSSProperties } from 'react';

import { useI18n } from '@/i18n';

export interface PreviewBrand {
  appDisplayName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
}

/** Texto legible sobre un fondo de la marca que no se oscurece (encabezado): regla de la app. */
export function textOn(color: string): string {
  const rgb = parseHexRgb(color);
  return rgb ? readableOn(rgb) : '#ffffff';
}

/**
 * Botones, chips e insignias: la misma regla que la app (`filledTone` de shared). Oscurece el
 * color hasta 20 % para que el texto blanco llegue a AA; si no alcanza, texto oscuro.
 */
export function filled(color: string): { fill: string; on: string } {
  return filledToneHex(color) ?? { fill: color, on: '#ffffff' };
}

const safe = (color: string | null, fallback: string) =>
  color && isHexColor(color) ? color : fallback;

/**
 * Vista previa de la app de la marca, dibujada acá mismo (no un iframe): el ícono en la pantalla
 * de inicio y la pantalla del menú con los colores del formulario —sin guardar— y el menú real
 * (categorías visibles y sus primeros productos). Es una aproximación de la app (TASK-018).
 */
export function PhonePreview({
  brand,
  menu,
}: {
  brand: PreviewBrand;
  menu: StaffMenu | undefined;
}) {
  const { t, money } = useI18n();
  const primary = safe(brand.primaryColor, '#1f2937');
  const secondary = safe(brand.secondaryColor, '#111827');
  const accent = safe(brand.accentColor, primary);
  const name = brand.appDisplayName.trim() || t('brand.previewName');
  const initial = name.charAt(0).toUpperCase();
  const categories = (menu?.categories ?? [])
    .filter((c) => c.isActive && c.items.length > 0)
    .slice(0, 3);
  // Los primeros productos del menú visible, de las primeras categorías.
  const shown = categories.flatMap((category) => category.items).slice(0, 4);

  const primaryTone = filled(primary);
  const accentTone = filled(accent);
  const style = {
    '--pv-primary': primaryTone.fill,
    '--pv-on-primary': primaryTone.on,
    '--pv-secondary': secondary,
    '--pv-on-secondary': textOn(secondary),
    '--pv-accent': accentTone.fill,
    '--pv-on-accent': accentTone.on,
  } as CSSProperties;

  const mark = (url: string | null, className: string) =>
    url ? (
      <img className={className} src={url} alt="" />
    ) : (
      <span className={`${className} pv-initial`}>{initial}</span>
    );

  return (
    <figure className="pv" style={style}>
      <div className="pv__home" aria-hidden="true">
        {mark(brand.iconUrl ?? brand.logoUrl, 'pv__icon')}
        <span className="pv__icon-name">{name}</span>
      </div>

      <div className="pv__phone" role="img" aria-label={t('brand.previewAlt', { name })}>
        <div className="pv__screen" aria-hidden="true">
          <div className="pv__status">
            <span>9:41</span>
            <span className="pv__status-icons" />
          </div>
          <div className="pv__header">
            {mark(brand.logoUrl, 'pv__logo')}
            <span className="pv__title">{name}</span>
          </div>
          <div className="pv__chips">
            {categories.length === 0 ? (
              <span className="pv__chip is-active">{t('brand.previewCategory')}</span>
            ) : (
              categories.map((category, index) => (
                <span key={category.id} className={`pv__chip${index === 0 ? ' is-active' : ''}`}>
                  {category.name}
                </span>
              ))
            )}
          </div>
          <div className="pv__list">
            {shown.length === 0 ? (
              <p className="pv__empty">{t('brand.previewEmpty')}</p>
            ) : (
              shown.map((item) => (
                <div key={item.id} className={`pv__item${item.isAvailable ? '' : ' is-soldout'}`}>
                  {item.imageUrl ? (
                    <img className="pv__thumb" src={item.imageUrl} alt="" />
                  ) : (
                    <span className="pv__thumb pv__thumb--empty" />
                  )}
                  <span className="pv__item-body">
                    <span className="pv__item-name">{item.name}</span>
                    <span className="pv__item-price">
                      {item.isAvailable
                        ? money(item.basePriceCents, menu?.currency)
                        : t('item.soldOut')}
                    </span>
                  </span>
                  <span className="pv__add">+</span>
                </div>
              ))
            )}
          </div>
          <div className="pv__cart">
            <span>{t('brand.previewCart')}</span>
          </div>
          <div className="pv__tabs">
            <span className="pv__tab is-active">{t('nav.menu')}</span>
            <span className="pv__tab">{t('nav.orders')}</span>
            <span className="pv__tab">{t('nav.rewards')}</span>
          </div>
        </div>
      </div>
      <figcaption className="field__hint">{t('brand.previewCaption')}</figcaption>
    </figure>
  );
}
