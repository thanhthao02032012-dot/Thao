import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { UIProvider } from './components/UIProvider.tsx';
import { LanguageProvider } from './components/LanguageProvider.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <UIProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </UIProvider>
  </BrowserRouter>
);
