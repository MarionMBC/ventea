import { useT } from '@/i18n';

import { REWARDS } from './rewards';
import { ShotPhone } from './shots';

/**
 * Sección D — puntos. Los números salen de la configuración inicial real de cada marca
 * (DEFAULT_REWARD_PROGRAM): nada de recompensas inventadas. Al lado, el perfil real de un
 * cliente en la app de Carolina (cuenta de ejemplo) con su saldo y de dónde salió cada punto.
 */
export function Loyalty() {
  const l = useT().loyalty;

  return (
    <section className="section loyalty" id="puntos" aria-labelledby="loyalty-title">
      <div className="container loyalty__inner">
        <div className="loyalty__copy" data-reveal>
          <p className="eyebrow eyebrow--on-dark">{l.eyebrow}</p>
          <h2 className="display section__title" id="loyalty-title">
            {l.title}
          </h2>
          <p className="section__lead">{l.lead}</p>

          <dl className="rules">
            <div>
              <dt>{l.earnTerm}</dt>
              <dd>{l.earnDef}</dd>
            </div>
            <div>
              <dt>{l.welcomeTerm}</dt>
              <dd>{l.welcomeDef(REWARDS.welcomeBonus)}</dd>
            </div>
            <div>
              <dt>{l.redeemTerm}</dt>
              <dd>{l.redeemDef(REWARDS.minToRedeem)}</dd>
            </div>
          </dl>
          <p className="loyalty__note">{l.note}</p>
        </div>

        <figure className="loyalty__shot" data-reveal>
          <ShotPhone screens={['profile']} />
          <figcaption>{l.example}</figcaption>
        </figure>
      </div>
    </section>
  );
}
