import { config } from '@/config';
import { ContactForm } from '@/contact/ContactForm';
import { whatsappUrl } from '@/contact/mailto';
import { FAQ, PROCESS, PRODUCT, QUALITY, REASONS, SERVICES, STACK } from '@/content';

import { HeroArt } from './HeroArt';
import { Check, Icon } from './Icons';

function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero__inner">
        <div className="hero__copy">
          <p className="eyebrow eyebrow--on-dark">Software development · Architecture</p>
          <h1 id="hero-title">We design and build software your business can run and scale.</h1>
          <p className="hero__lead">
            Custom web and mobile apps, SaaS platforms, integrations and cloud architecture — built
            with automated tests, documented decisions and code that belongs to you.
          </p>
          <div className="hero__actions">
            <a className="btn btn--accent" href="#contact">
              Let’s talk about your project
            </a>
            <a className="btn btn--ghost" href="#services">
              See services
            </a>
          </div>
        </div>
        <HeroArt />
      </div>
    </section>
  );
}

function Services() {
  return (
    <section className="section" id="services" aria-labelledby="services-title">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">Services</p>
          <h2 id="services-title">What we build</h2>
          <p className="section__lead">
            From a single integration to a complete platform. Each service can be hired on its own.
          </p>
        </div>
        <ul className="services">
          {SERVICES.map((service) => (
            <li key={service.id} className="card service">
              <span className="service__icon">
                <Icon name={service.icon} />
              </span>
              <h3>{service.title}</h3>
              <p>{service.summary}</p>
              <p className="service__label">What’s included</p>
              <ul className="ticks">
                {service.includes.map((item) => (
                  <li key={item}>
                    <Check />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="service__fit">
                <span>Good fit for:</span> {service.goodFit}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Process() {
  return (
    <section className="section section--tint" id="process" aria-labelledby="process-title">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">How we work</p>
          <h2 id="process-title">Small steps, visible progress</h2>
          <p className="section__lead">
            A clear sequence from the first conversation to a system running in production.
          </p>
        </div>
        <ol className="steps">
          {PROCESS.map((step, index) => (
            <li key={step.title} className="step">
              <span className="step__num" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="quality">
          <h3>Quality is part of the process</h3>
          <ul className="ticks ticks--inline">
            {QUALITY.map((item) => (
              <li key={item}>
                <Check />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Product() {
  return (
    <section className="section" id="product" aria-labelledby="product-title">
      <div className="container">
        <div className="product card">
          <div className="product__copy">
            <p className="eyebrow">Our product</p>
            <h2 id="product-title">{PRODUCT.name}</h2>
            <p className="section__lead">{PRODUCT.summary}</p>
            <ul className="ticks">
              {PRODUCT.features.map((item) => (
                <li key={item}>
                  <Check />
                  {item}
                </li>
              ))}
            </ul>
            <p className="product__actions">
              <a className="btn btn--primary" href={config.productUrl}>
                Visit Ventea for restaurants
              </a>
              <span className="product__note">{PRODUCT.note}</span>
            </p>
          </div>
          <div className="product__facts" aria-label="What the product shows about our work">
            <p className="product__facts-title">Built with the same practices we offer</p>
            <dl>
              <div>
                <dt>Architecture</dt>
                <dd>Multi-tenant SaaS, one subdomain per restaurant</dd>
              </div>
              <div>
                <dt>Apps</dt>
                <dd>Web and mobile under each restaurant’s brand</dd>
              </div>
              <div>
                <dt>Billing</dt>
                <dd>Plans and recurring subscriptions</dd>
              </div>
              <div>
                <dt>Operations</dt>
                <dd>Containers, scripted deploys, database backups</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stack() {
  return (
    <section className="section section--tint" id="stack" aria-labelledby="stack-title">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">Technology</p>
          <h2 id="stack-title">A proven, boring-in-a-good-way stack</h2>
          <p className="section__lead">
            Mainstream tools with long-term support, so your system is easy to hire for and to
            maintain.
          </p>
        </div>
        <dl className="stack">
          {STACK.map((group) => (
            <div key={group.area} className="stack__group">
              <dt>{group.area}</dt>
              <dd>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Why() {
  return (
    <section className="section" id="why" aria-labelledby="why-title">
      <div className="container">
        <div className="section__head">
          <p className="eyebrow">Why Ventea</p>
          <h2 id="why-title">Commitments you can verify</h2>
        </div>
        <ul className="reasons">
          {REASONS.map((reason) => (
            <li key={reason.title} className="reason">
              <h3>{reason.title}</h3>
              <p>{reason.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="section section--tint" id="faq" aria-labelledby="faq-title">
      <div className="container container--narrow">
        <div className="section__head">
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-title">Frequently asked questions</h2>
        </div>
        <div className="faq">
          {FAQ.map((item) => (
            <details key={item.q} className="faq__item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

const WHATSAPP_TEXT = 'Hi, I would like to talk about a software project.';

export function Contact({ whatsapp = config.whatsapp }: { whatsapp?: string }) {
  const wa = whatsappUrl(whatsapp, WHATSAPP_TEXT);
  return (
    <section className="section" id="contact" aria-labelledby="contact-title">
      <div className="container contact">
        <div className="contact__intro">
          <p className="eyebrow">Contact</p>
          <h2 id="contact-title">Tell us about your project</h2>
          <p className="section__lead">
            A few lines are enough. We reply with questions or a proposal for a first call.
          </p>
          <ul className="contact__channels">
            <li>
              <span>Email</span>
              <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
            </li>
            {wa ? (
              <li>
                <span>WhatsApp</span>
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  Message us on WhatsApp
                </a>
              </li>
            ) : null}
          </ul>
        </div>
        <div className="card contact__form">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <>
      <Hero />
      <Services />
      <Process />
      <Product />
      <Stack />
      <Why />
      <Faq />
      <Contact />
    </>
  );
}
