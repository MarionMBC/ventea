import { useBrand } from '../../brand/useBrand';
import { BackHeader } from '../../components/navigation/AppHeader';
import { formatDate, getLanguage, t } from '../../i18n';
import { ScreenShell } from '../screens/ScreenShell';
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED, legalText, type LegalDoc } from './legalContent';
import '../screens/screens.css';
import './legal.css';

export interface LegalScreenProps {
  doc: LegalDoc;
  onBack?: () => void;
}

/**
 * Privacy policy / terms of use. Public (no sign-in): the same route is the URL given to the
 * stores (`https://<brand host>/privacy`, `/terms`), so it must read well in a browser too.
 */
export const LegalScreen = ({ doc, onBack }: LegalScreenProps) => {
  const brand = useBrand();
  const text = legalText(doc, getLanguage(), brand.appName);
  return (
    <ScreenShell header={<BackHeader title={text.title} onBack={onBack} />}>
      <article className="vt-screen__inner vt-legal">
        <p className="vt-caption">
          {t('legal.updated', {
            date: formatDate(`${LEGAL_UPDATED}T12:00:00Z`, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
          })}
        </p>
        <p className="vt-body">{text.intro}</p>
        {text.sections.map((section) => (
          <section key={section.title} className="vt-legal__section">
            <h2 className="vt-h3">{section.title}</h2>
            {section.bullets && (
              <ul className="vt-body">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="vt-body">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <p className="vt-caption">
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
        </p>
      </article>
    </ScreenShell>
  );
};
