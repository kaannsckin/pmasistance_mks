/**
 * Tailwind derleme anında (BL-08): önceden cdn.tailwindcss.com tarayıcıda
 * çalışıyordu; kurum ağı CDN'i engellerse ekran biçimsiz kalıyordu.
 * Karanlık mod <html class="dark"> ile gelir: App, Ayarlar'daki Gündüz / Gece /
 * Sistem tercihine göre sınıfı koyar ('Sistem' işletim sistemini izler).
 * @type {import('tailwindcss').Config}
 */
export default {
    content: ['./index.html', './index.tsx', './App.tsx', './constants.ts', './components/**/*.{ts,tsx}', './utils/**/*.{ts,tsx}'],
    darkMode: 'class',
    theme: { extend: {} },
    plugins: [],
};
