import { config } from '@/config';
import { ContactForm } from '@/contact/ContactForm';
import type { Dict } from '@/i18n';

export function Contact({ t }: { t: Dict }) {
  return (
    <section className="section contact" id={t.anchors.contact} aria-labelledby="contact-title">
      <div className="container contact__grid">
        <div className="contact__intro" data-reveal>
          <p className="eyebrow">
            <span className="eyebrow__num">06</span>
            {t.contact.eyebrow}
          </p>
          <h2 id="contact-title" className="section-title">
            {t.contact.title}
          </h2>
          <p className="section-lead">{t.contact.lead}</p>
          <div className="contact__direct">
            <p className="contact__direct-title">{t.contact.directTitle}</p>
            <p>
              {t.contact.directText}{' '}
              <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
            </p>
          </div>
        </div>
        <div className="contact__card">
          <ContactForm t={t} />
        </div>
      </div>
    </section>
  );
}
