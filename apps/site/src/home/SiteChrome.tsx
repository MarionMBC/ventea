import { config } from '@/config';

import { Logo } from './Icons';

const NAV = [
  { href: '/#services', label: 'Services' },
  { href: '/#process', label: 'How we work' },
  { href: '/#product', label: 'Product' },
  { href: '/#faq', label: 'FAQ' },
];

export function SiteHeader() {
  return (
    <header className="header">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="container header__inner">
        <a className="brand" href="/" aria-label={`${config.companyName}, home`}>
          <Logo />
          <span className="brand__name">{config.companyName}</span>
        </a>
        <nav className="header__nav" aria-label="Main">
          <ul>
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <a className="btn btn--small btn--primary" href="/#contact">
          Contact
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Logo />
          <p>
            <strong>{config.companyName}</strong> — software development and architecture.
          </p>
        </div>
        <ul className="footer__links">
          <li>
            <a href={config.productUrl}>Ventea for restaurants</a>
          </li>
          <li>
            <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
          </li>
          <li>
            <a href="/privacy">Privacy notice</a>
          </li>
        </ul>
        <p className="footer__legal">
          © {year} {config.companyName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
