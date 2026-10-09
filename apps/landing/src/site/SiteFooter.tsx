import { CONTACT_EMAIL, LEGAL_NAME } from '@/config';
import { homeHref, signupHref, useLocale, useT } from '@/i18n';
import { Brand } from '@/landing/Brand';

import { FooterLanguages } from './LanguageSwitch';
import { PanelAccess } from './PanelAccess';

/**
 * Pie común de la landing, el registro y las páginas legales. Las legales existen solo en
 * español (el texto vinculante, ley de Honduras): en inglés la etiqueta lo dice.
 */
export function SiteFooter() {
  const t = useT();
  const f = t.footer;
  const locale = useLocale();
  const home = (hash: string) => homeHref(locale, hash);
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__about">
          <Brand tone="dark" />
          <p className="footer__text">{f.about}</p>
          <PanelAccess />
        </div>
        <nav aria-label={f.productTitle}>
          <h2 className="footer__title">{f.productTitle}</h2>
          <ul className="footer__links">
            <li>
              <a href={home('#experiencia')}>{f.links.experience}</a>
            </li>
            <li>
              <a href={home('#pedidos')}>{f.links.orders}</a>
            </li>
            <li>
              <a href={home('#puntos')}>{f.links.points}</a>
            </li>
            <li>
              <a href={home('#precios')}>{f.links.pricing}</a>
            </li>
            <li>
              <a href={home('#preguntas')}>{f.links.faq}</a>
            </li>
            <li>
              <a href={signupHref(locale)}>{f.links.signup}</a>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="footer__title">{f.contactTitle}</h2>
          <p className="footer__text">
            {f.contactBefore}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>
        <div className="footer__stack">
          <nav aria-label="Legal">
            <h2 className="footer__title">{f.legalTitle}</h2>
            <ul className="footer__links">
              <li>
                <a href="/terminos" hrefLang="es">
                  {f.terms}
                </a>
              </li>
              <li>
                <a href="/privacidad" hrefLang="es">
                  {f.privacy}
                </a>
              </li>
            </ul>
          </nav>
          <FooterLanguages />
        </div>
        <p className="footer__legal">
          © {new Date().getFullYear()} {LEGAL_NAME} · {f.madeBy}{' '}
          <a href="https://ventea.tech">{f.corporate}</a>
        </p>
      </div>
    </footer>
  );
}
