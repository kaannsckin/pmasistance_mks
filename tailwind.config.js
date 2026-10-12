/**
 * Tailwind derleme anında (BL-08): önceden cdn.tailwindcss.com tarayıcıda
 * çalışıyordu; kurum ağı CDN'i engellerse ekran biçimsiz kalıyordu. Ayar,
 * CDN'in varsayılanlarıyla aynıdır (karanlık mod: işletim sistemi tercihi).
 * @type {import('tailwindcss').Config}
 */
export default {
    content: ['./index.html', './index.tsx', './App.tsx', './constants.ts', './components/**/*.{ts,tsx}', './utils/**/*.{ts,tsx}'],
    theme: { extend: {} },
    plugins: [],
};
