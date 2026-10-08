import { CONTACT_EMAIL, LEGAL_NAME } from '@/config';
import { Brand } from '@/landing/Brand';

/** Pie común de la landing y las páginas legales. */
export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div>
          <Brand />
          <p className="footer__text">Pedidos, app propia y lealtad para restaurantes.</p>
        </div>
        <div>
          <h2 className="footer__title">Contacto</h2>
          <p className="footer__text">
            ¿Dudas o quieres una demostración? Escríbenos a{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>
        <nav aria-label="Legal">
          <h2 className="footer__title">Legal</h2>
          <ul className="footer__links">
            <li>
              <a href="/terminos">Términos del servicio</a>
            </li>
            <li>
              <a href="/privacidad">Política de privacidad</a>
            </li>
          </ul>
        </nav>
        <p className="footer__legal">
          © {new Date().getFullYear()} {LEGAL_NAME}
        </p>
      </div>
    </footer>
  );
}
