import { config } from '@/config';

/** Aviso de privacidad del sitio corporativo (no del producto: ese vive en app.ventea.tech). */
export function PrivacyPage() {
  return (
    <article className="section page">
      <div className="container container--narrow prose">
        <p className="eyebrow">Legal</p>
        <h1>Privacy notice</h1>
        <p className="page__lead">
          This notice covers this website, {config.siteUrl.replace('https://', '')}. It is short
          because the site collects almost nothing.
        </p>
        <h2>No cookies, no third-party analytics</h2>
        <p>
          This site does not set cookies, does not use third-party analytics or advertising tools
          and does not load scripts, fonts or images from other domains.
        </p>
        <h2>The contact form</h2>
        <p>
          The form does not send anything to our servers. When you submit it, your browser opens
          your own email app with a pre-filled message to {config.contactEmail}. Nothing is sent
          until you press send in your email app, and only what you write is shared with us.
        </p>
        <h2>What we do with your email</h2>
        <p>
          Your message travels like any other email: it is handled by your email provider and by the
          provider that hosts our mailbox, {config.contactEmail}. We use the messages you send us
          only to reply and to discuss your project, and we do not sell them or use them for
          advertising. You can ask us to delete your messages at any time by writing to{' '}
          <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.
        </p>
        <h2>Server logs</h2>
        <p>
          Like any website, the server that delivers these pages may keep technical access logs
          (such as IP address, date and requested page) to keep the service secure and working.
        </p>
        <h2>Ventea for restaurants</h2>
        <p>
          Our restaurant ordering product has its own terms and privacy policy, available at{' '}
          <a href={`${config.productUrl}/privacidad`}>
            {config.productUrl.replace('https://', '')}/privacidad
          </a>{' '}
          (in Spanish).
        </p>
        <p>
          <a href="/">← Back to the home page</a>
        </p>
      </div>
    </article>
  );
}
