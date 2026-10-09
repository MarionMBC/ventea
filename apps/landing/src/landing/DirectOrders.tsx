import { useEffect, useRef, useState } from 'react';

import { DEMO_ORDER, DEMO_RESTAURANT, DEMO_TOTAL, lempiras } from './food';
import { useInView, useReducedMotion } from './motion';
import { Phone } from './Phone';

/**
 * Sección C — el pedido viaja del teléfono del cliente al tablero del restaurante. Columnas,
 * estados y botones son los del panel real (apps/admin, features/orders/transitions.ts):
 * Nuevos → En cocina → Listos, con «Empezar», «Listo» y «Entregado». La animación corre una
 * vez al entrar en pantalla; con movimiento reducido se muestra el pedido ya en «Nuevos».
 */
const COLUMNS = ['Nuevos', 'En cocina', 'Listos'] as const;
const ACTION = ['Empezar', 'Listo', 'Entregado'] as const;

/** 0 = en camino · 1 Nuevos · 2 En cocina · 3 Listos */
type Phase = 0 | 1 | 2 | 3;

export function DirectOrders() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, 0.4);
  const reduced = useReducedMotion();
  const [timeline, setPhase] = useState<Phase>(0);
  const phase: Phase = reduced ? 1 : timeline;

  useEffect(() => {
    if (reduced || !seen) return;
    const timers = [
      window.setTimeout(() => setPhase(1), 1100),
      window.setTimeout(() => setPhase(2), 3000),
      window.setTimeout(() => setPhase(3), 4800),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [seen, reduced]);

  const column = Math.max(phase - 1, 0);

  return (
    <section className="section direct" id="pedidos" aria-labelledby="direct-title">
      <div className="container">
        <header className="section__head direct__head" data-reveal>
          <p className="eyebrow">Pedidos directos</p>
          <h2 className="display section__title" id="direct-title">
            Más relación con sus clientes. Menos intermediarios.
          </h2>
          <p className="section__lead">
            El pedido que confirma su cliente aparece en el tablero de su cocina, con aviso sonoro
            si lo activa. Su equipo lo avanza con un toque y el cliente ve el estado en su teléfono.
          </p>
        </header>

        <div
          className={`direct__scene${seen || reduced ? ' is-live' : ''}`}
          data-phase={phase}
          ref={ref}
        >
          <Phone screen="confirmed" track={column as 0 | 1 | 2} className="direct__phone" />

          <div className="direct__wire" aria-hidden="true">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none">
              <path d="M0 20 C 60 20, 60 20, 100 20 S 160 20, 200 20" />
            </svg>
            <span className="direct__packet" />
          </div>

          <div
            className="board"
            role="img"
            aria-label={`Tablero de pedidos del restaurante: el pedido ${DEMO_RESTAURANT.orderNumber} pasa de Nuevos a En cocina y a Listos.`}
          >
            <div className="board__top" aria-hidden="true">
              <strong>Pedidos</strong>
              <span className="board__tab is-on">
                Activos <em>{phase > 0 ? 1 : 0}</em>
              </span>
              <span className="board__tab">Historial de hoy</span>
              <span className="board__sound">🔔 Sonido: activado</span>
            </div>
            <div className="board__cols" aria-hidden="true">
              {COLUMNS.map((name, index) => (
                <div key={name} className="board__col">
                  <p className="board__col-name">
                    {name} <span>{phase > 0 && column === index ? 1 : 0}</span>
                  </p>
                  {/* En la fase 0 el ticket ya ocupa su lugar (invisible): sin saltos de layout. */}
                  {column === index && (
                    <article
                      className={`ticket${phase === 0 ? ' is-ghost' : index === 0 ? ' is-new' : ''}`}
                      key={phase}
                    >
                      <header>
                        <strong>#{DEMO_RESTAURANT.orderNumber}</strong>
                        <span>hace 1 min</span>
                      </header>
                      <p className="ticket__mode">Para llevar</p>
                      <ul>
                        {DEMO_ORDER.map((item) => (
                          <li key={item.name}>1 × {item.name}</li>
                        ))}
                      </ul>
                      <footer>
                        <span>{lempiras(DEMO_TOTAL)}</span>
                        <span className="ticket__action">{ACTION[index]}</span>
                      </footer>
                    </article>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <ul className="direct__facts" data-reveal>
          <li>
            <strong>Para llevar o comer en el local.</strong> El cliente elige al confirmar.
          </li>
          <li>
            <strong>Pago al retirar.</strong> Directo en su caja, sin intermediarios.
          </li>
          <li>
            <strong>Estados claros.</strong> Nuevo, En cocina, Listo y Entregado, a la vista de su
            equipo y de su cliente.
          </li>
        </ul>
      </div>
    </section>
  );
}
