import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Global styles first, so component styles imported by App can build on them.
import './styles/tokens.css';
import './styles/base.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
