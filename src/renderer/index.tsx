import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './style.css';
import { LanguageProvider } from './i18n/LanguageProvider.tsx';
createRoot(document.getElementById('root')!).render(<LanguageProvider api={window.revelumoPreferences}><App /></LanguageProvider>);
