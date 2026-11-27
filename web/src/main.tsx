import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';
import App from './App';
import { ToastProvider } from './components';
import { applyTheme, getTheme } from './lib/theme';

// El tema elegido se aplica antes de dibujar, para que no parpadee
applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
