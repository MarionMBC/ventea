import React from 'react';
import { createRoot } from 'react-dom/client';
import { BUILD_BRAND } from './brand/runtime';
import { resolveLanguage, setLanguage } from './i18n';
import { applyNativeStatusBar } from './native/statusBar';
import App from './App';

/* Language first: every module that renders text reads it on render. */
setLanguage(
  resolveLanguage({
    override: import.meta.env.DEV ? new URLSearchParams(window.location.search).get('lang') : null,
    deviceLanguages: navigator.languages?.length ? navigator.languages : [navigator.language],
    brandDefault: BUILD_BRAND.defaultLanguage,
  }),
);

void applyNativeStatusBar();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root in index.html');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
