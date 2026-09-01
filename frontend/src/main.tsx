import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LEGACY_THEME_STORAGE_KEYS, THEME_STORAGE_KEY } from './config/brand';
import './index.css';

const storedTheme =
  localStorage.getItem(THEME_STORAGE_KEY) ??
  LEGACY_THEME_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
document.documentElement.setAttribute('data-theme', storedTheme === 'light' ? 'light' : 'dark');

// Stop mouse-wheel from silently nudging focused number inputs (qty, price, cash, etc.).
document.addEventListener(
  'wheel',
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'number') return;
    if (document.activeElement !== target) return;
    target.blur();
    event.preventDefault();
  },
  { passive: false, capture: true },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
