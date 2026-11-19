
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fortawesome/fontawesome-free/css/all.min.css';
// Modern arayüz temalarının yazı tipleri uygulamayla birlikte paketlenir: kurum ağı
// dış yazı tipi sunucularını engellese de temalar kendi yazısıyla açılır. Tarayıcı
// yalnız kullanılan yazı tipini ve gereken karakter alt kümesini indirir.
import '@fontsource-variable/geist';
import '@fontsource-variable/inter';
import '@fontsource-variable/nunito';
import '@fontsource-variable/plus-jakarta-sans';
import './styles/tailwind.css';
import './styles/modern.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
