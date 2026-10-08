/**
 * Ilustración del hero hecha con HTML/CSS (sin imágenes): un teléfono con el menú de
 * una marca y una tarjeta de pedido entrando a la cocina. Decorativa: oculta a lectores.
 */
export function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="phone">
        <div className="phone__notch" />
        <div className="phone__screen">
          <div className="phone__brand">
            <span className="phone__logo">PJ</span>
            <span>
              <strong>Pollos Juan</strong>
              <small>pollos-juan.ventea.tech</small>
            </span>
          </div>
          <div className="phone__item">
            <span className="phone__thumb phone__thumb--a" />
            <span>
              <strong>Combo familiar</strong>
              <small>8 piezas · papas · refresco</small>
            </span>
            <em>$18</em>
          </div>
          <div className="phone__item">
            <span className="phone__thumb phone__thumb--b" />
            <span>
              <strong>Baleada especial</strong>
              <small>Huevo, aguacate y carne</small>
            </span>
            <em>$4</em>
          </div>
          <div className="phone__points">
            <span>Tus puntos</span>
            <strong>1,250</strong>
          </div>
          <div className="phone__cta">Hacer pedido</div>
        </div>
      </div>
      <div className="ticket">
        <p className="ticket__head">
          <span className="ticket__dot" /> Pedido nuevo · #PJ-1042
        </p>
        <p className="ticket__line">1 × Combo familiar</p>
        <p className="ticket__line">2 × Baleada especial</p>
        <p className="ticket__foot">
          <span>Comisión</span>
          <strong>$0.00</strong>
        </p>
      </div>
    </div>
  );
}
