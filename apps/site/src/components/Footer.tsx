import { config } from '@/config';
import { dict } from '@/i18n';
import { sectionHref } from '@/links';
import { PATHS, type Route } from '@/routes';

import { Logo } from './Brand';
import { LanguageSwitch } from './LanguageSwitch';
import { navItems } from './Header';

/** Pie: logo oficial, navegación, servicios, productos, contacto y privacidad. */
export function Footer({ route }: { route: Route }) {
  const t = dict(route.locale);
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <a href={PATHS.home[route.locale]} aria-label={t.a11y.home}>
              <Logo variant="white" height={30} />
            </a>
            <p>{t.footer.tagline}</p>
            <p className="footer__mono">Software &amp; Architecture</p>
          </div>
          <nav className="footer__col" aria-label={t.a11y.footerNav}>
            <h2 className="footer__title">{t.footer.navTitle}</h2>
            <ul>
              {navItems(route).map((item) => (
                <li key={item.key}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="footer__col">
            <h2 className="footer__title">{t.footer.servicesTitle}</h2>
            <ul>
              {t.services.items.map((service) => (
                <li key={service.id}>
                  <a href={sectionHref(route.locale, 'services')}>{service.title}</a>
                </li>
              ))}
            </ul>
          </div>
          <div className="footer__col">
            <h2 className="footer__title">{t.footer.productsTitle}</h2>
            <ul>
              <li>
                <a href={config.marketingUrl}>{t.products.marketing.name}</a>
              </li>
              <li>
                <a href={config.restaurantsUrl}>{t.products.restaurants.name}</a>
              </li>
            </ul>
            <h2 className="footer__title footer__title--spaced">{t.footer.contactTitle}</h2>
            <ul>
              <li>
                <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer__bottom">
          <p suppressHydrationWarning>
            © {year} {config.companyName}. {t.footer.rights}
          </p>
          <ul className="footer__legal">
            <li>
              <a href={PATHS.privacy[route.locale]}>{t.footer.privacy}</a>
            </li>
            <li>
              <LanguageSwitch route={route} />
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
