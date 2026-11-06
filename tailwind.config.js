/**
 * Tailwind derleme anında (BL-08): önceden cdn.tailwindcss.com tarayıcıda
 * çalışıyordu; kurum ağı CDN'i engellerse ekran biçimsiz kalıyordu. Ayar,
 * CDN'in varsayılanlarıyla aynıdır. Karanlık mod sınıfla: html.dark'ı uygulama koyar; Ayarlar ›
 * Görünüm "Sistem"de işletim sistemi tercihini izler, "Gündüz"/"Gece"de zorlar (UI-GRS-01).
 * @type {import('tailwindcss').Config}
 */
export default {
    content: ['./index.html', './index.tsx', './App.tsx', './constants.ts', './components/**/*.{ts,tsx}', './utils/**/*.{ts,tsx}'],
    darkMode: 'class',
    theme: { extend: {} },
    plugins: [],
};
