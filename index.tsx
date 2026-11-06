
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/tailwind.css';
import './styles/modern.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Çevrimdışı açılış (UI-KRC-07): yalnız derlenmiş uygulamada; geliştirmede önbellek karışmasın
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('Servis çalışanı kaydedilemedi', e));
  });
}
