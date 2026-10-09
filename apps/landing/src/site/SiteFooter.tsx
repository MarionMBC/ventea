import { CONTACT_EMAIL, LEGAL_NAME } from '@/config';
import { Brand } from '@/landing/Brand';

import { PanelAccess } from './PanelAccess';

/** Pie común de la landing, el registro y las páginas legales. */
export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__about">
          <Brand tone="dark" />
          <p className="footer__text">
            App propia, pedidos directos y puntos de lealtad para restaurantes. Sin comisión por
            pedido.
          </p>
          <PanelAccess />
        </div>
        <nav aria-label="Producto">
          <h2 className="footer__title">Producto</h2>
          <ul className="footer__links">
            <li>
              <a href="/#experiencia">Experiencia del cliente</a>
            </li>
            <li>
              <a href="/#pedidos">Pedidos directos</a>
            </li>
            <li>
              <a href="/#puntos">Programa de puntos</a>
            </li>
            <li>
              <a href="/#precios">Precios</a>
            </li>
            <li>
              <a href="/#preguntas">Preguntas frecuentes</a>
            </li>
            <li>
              <a href="/registro">Registrar mi restaurante</a>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="footer__title">Contacto</h2>
          <p className="footer__text">
            ¿Dudas o quiere una demostración? Escríbanos a{' '}
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
          © {new Date().getFullYear()} {LEGAL_NAME} · Un producto de{' '}
          <a href="https://ventea.tech">Ventea, software y arquitectura</a>
        </p>
      </div>
    </footer>
  );
}
