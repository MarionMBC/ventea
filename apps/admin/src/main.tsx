import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { createDefaultServices } from './app/services';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/orders.css';
import './styles/platform.css';

const container = document.getElementById('root');
if (!container) throw new Error('Falta #root en index.html');

createRoot(container).render(
  <React.StrictMode>
    <App services={createDefaultServices()} />
  </React.StrictMode>,
);
