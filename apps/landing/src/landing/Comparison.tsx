import type { Plan } from '@ventea/shared';
import { useId, useState } from 'react';

import { DELIVERY_COMMISSION } from '@/config';
import { formatUsd } from '@/lib/format';

const ROWS: { label: string; apps: string; ventea: string }[] = [
  { label: 'Comisión por pedido', apps: 'Entre 20% y 30%', ventea: '0%' },
  { label: 'Marca que ve tu cliente', apps: 'La de la app', ventea: 'La tuya' },
  { label: 'Datos y contacto de tus clientes', apps: 'Quedan en la app', ventea: 'Son tuyos' },
  { label: 'Puntos de lealtad propios', apps: 'No', ventea: 'Incluidos' },
  {
    label: 'Clientes nuevos que te descubren',
    apps: 'Sí, es su fuerte',
    ventea: 'Tus clientes de siempre',
  },
  { label: 'Repartidores', apps: 'Incluidos', ventea: 'Los tuyos, o retiro en el local' },
];

/**
 * Comparación honesta con las apps de delivery (sin nombrar marcas): dónde conviene cada
 * una, y una cuenta con las ventas del restaurante.
 */
export function Comparison({ plan }: { plan: Plan | undefined }) {
  const [sales, setSales] = useState(3000);
  const inputId = useId();
  const salesCents = Math.max(0, Math.round(sales * 100));
  const minFee = Math.round(salesCents * DELIVERY_COMMISSION.min);
  const maxFee = Math.round(salesCents * DELIVERY_COMMISSION.max);
  const planCents = plan?.priceMonthlyCents;

  return (
    <section className="section" id="comparacion" aria-labelledby="comparacion-title">
      <div className="container">
        <header className="section__head">
          <p className="eyebrow">Cuentas claras</p>
          <h2 className="section__title" id="comparacion-title">
            Las apps de delivery te cobran por cada pedido. Nosotros, no.
          </h2>
          <p className="section__lead">
            Las apps de delivery son buenas para que te conozcan clientes nuevos. Pero cuando un
            cliente ya te conoce y vuelve, pagar entre 20% y 30% de cada pedido no tiene sentido.
            Ventea es tu canal propio para esos clientes.
          </p>
        </header>

        <div className="compare">
          <div className="calc" role="group" aria-labelledby={`${inputId}-title`}>
            <h3 className="calc__title" id={`${inputId}-title`}>
              Haz la cuenta
            </h3>
            <label className="field" htmlFor={inputId}>
              <span className="field__label">Lo que vendes al mes por apps de delivery (USD)</span>
              <input
                id={inputId}
                className="field__input"
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={Number.isFinite(sales) ? sales : 0}
                onChange={(event) => setSales(Number(event.target.value))}
              />
            </label>
            <dl className="calc__result" aria-live="polite">
              <div>
                <dt>Comisiones de las apps (20–30%)</dt>
                <dd className="calc__bad">
                  {formatUsd(minFee)} – {formatUsd(maxFee)}
                </dd>
              </div>
              <div>
                <dt>Ventea{plan ? ` ${plan.name}` : ''}, precio fijo</dt>
                <dd className="calc__good">
                  {planCents === undefined ? '—' : formatUsd(planCents)}
                </dd>
              </div>
            </dl>
            <p className="calc__foot">
              Cifras de referencia: la comisión exacta depende de cada app y de tu contrato.
            </p>
          </div>

          <div className="table-wrap">
            <table className="compare__table">
              <caption className="sr-only">Apps de delivery comparadas con Ventea</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Aspecto</span>
                  </th>
                  <th scope="col">Apps de delivery</th>
                  <th scope="col">Ventea</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{row.apps}</td>
                    <td className="compare__us">{row.ventea}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
