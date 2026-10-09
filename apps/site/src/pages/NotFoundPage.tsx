export function NotFoundPage() {
  return (
    <section className="section page page--center">
      <div className="container container--narrow">
        <p className="eyebrow">Error 404</p>
        <h1>Page not found</h1>
        <p className="page__lead">
          The page you are looking for does not exist or has moved. If you came looking for Ventea
          for restaurants, it lives at <a href="https://app.ventea.tech">app.ventea.tech</a>.
        </p>
        <p>
          <a className="btn btn--primary" href="/">
            Go to the home page
          </a>
        </p>
      </div>
    </section>
  );
}
