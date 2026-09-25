import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';

// All user-facing text lives in resource files from day one (PLAN.md §4.4).
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
