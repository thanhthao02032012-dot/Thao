import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { UIProvider } from './components/UIProvider.tsx';
import { LanguageProvider } from './components/LanguageProvider.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <UIProvider>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </UIProvider>
);
