import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

/**
 * Yazı boyutları px yerine rem (UI-ERS-13): tarayıcının yazı boyutu ayarı (ör. %200) px ile verilen
 * yazıları büyütmüyordu; menü kırpılıyor, içerik aynı kalıyordu. Tailwind'in ürettikleri dahil tüm
 * font-size px değerleri 16 px = 1 rem ile çevrilir; varsayılan ayarda görünüm değişmez.
 */
const fontSizePxToRem = () => ({
    postcssPlugin: 'yazi-boyutu-rem',
    OnceExit(root) {
        root.walkDecls('font-size', decl => {
            decl.value = decl.value.replace(/(\d*\.?\d+)px\b/g, (_, n) => `${+(Number(n) / 16).toFixed(4)}rem`);
        });
    },
});
fontSizePxToRem.postcss = true;

export default {
    plugins: [tailwindcss, autoprefixer, fontSizePxToRem],
};
