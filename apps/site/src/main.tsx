import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/site.css';

const container = document.getElementById('root');
if (!container) throw new Error('Falta #root en index.html');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
