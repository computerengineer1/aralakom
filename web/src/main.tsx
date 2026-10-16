import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { PublicDataProvider } from './lib/publicData';
import { ToastProvider } from './components/ui';
import i18n, { applyDir } from './i18n';
import './styles.css';

applyDir(i18n.language);
i18n.on('languageChanged', applyDir);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PublicDataProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </PublicDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
