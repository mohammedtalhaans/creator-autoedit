import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/barlow-condensed/800.css';
import './styles/globals.css';
import './styles/teleprompter.css';
import App from './app/App';

function registerOfflineShell(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = new URL(import.meta.env.BASE_URL, location.origin);
  const scope = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  const worker = new URL('sw.js', `${location.origin}${scope}`);
  // Registration is deliberately fire-and-forget. The worker waits for old
  // clients to close, and no update/reload is forced while recording.
  void navigator.serviceWorker.register(worker, { scope }).catch(() => undefined);
}

if (import.meta.env.PROD) window.addEventListener('load', registerOfflineShell, { once: true });

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
