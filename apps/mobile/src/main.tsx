/* First: moves a previous app's stored session before any store reads it. */
import './brand/legacyStorage';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BUILD_BRAND, IS_NATIVE } from './brand/runtime';
import { resolveLanguage, setLanguage } from './i18n';
import { applyNativeStatusBar } from './native/statusBar';
import App from './App';

/* Language first: every module that renders text reads it on render. */
setLanguage(
  resolveLanguage({
    override: IS_NATIVE ? null : new URLSearchParams(window.location.search).get('lang'),
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
