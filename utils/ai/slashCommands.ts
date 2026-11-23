/**
 * Sohbet kutusundaki "/" komutları: sık işler için hazır istekler. Komut,
 * ekrandaki bağlama (açık proje, açık görev/kişi) göre isteğe dönüştürülür;
 * komuttan sonra yazılan metin isteğe eklenir ("/excel riskler").
 */

export interface SlashContext {
    projectName?: string;
    taskLabel?: string;
    personName?: string;
    /** Sohbette daha önce asistan yanıtı var mı ("/excel" son yanıtı dosyaya çevirir) */
    hasAnswer?: boolean;
}

export interface SlashCommand {
    cmd: string;
    label: string;
    /** Komuttan sonra beklenen metin (menüde ipucu) */
    arg?: string;
    build: (c: SlashContext, arg: string) => string;
}

const scope = (c: SlashContext) => (c.projectName ? `${c.projectName} projesinin` : 'Portföyün');
const topic = (arg: string) => (arg ? ` Konu: ${arg}.` : '');

export const SLASH_COMMANDS: SlashCommand[] = [
    { cmd: 'ozet', label: 'Durum özeti', build: (c, a) => `${scope(c)} genel durumunu özetle: sağlık, geciken işler, en yüksek riskler ve dikkat gerektirenler.${topic(a)}` },
    { cmd: 'geciken', label: 'Geciken görevler ve yeni termin', build: (c, a) => `${c.projectName ? `${c.projectName} projesinde` : 'Görebildiğim projelerde'} geciken görevleri bul; her biri için gerçekçi yeni termin öner ve tek öneri kartında hazırla.${topic(a)}` },
    { cmd: 'riskler', label: 'En yüksek riskler', build: (c, a) => `${scope(c)} en yüksek risklerini ve her biri için önerilen aksiyonu listele; eksik görünen riskleri de söyle.${topic(a)}` },
    { cmd: 'rapor', label: 'Haftalık durum raporu taslağı', build: (c, a) => `${c.projectName ? `${c.projectName} projesinin` : 'Açık projemin'} bu haftaki durum raporu taslağını hazırla.${topic(a)}` },
    { cmd: 'isgucu', label: 'Bu ay kim ne kadar çalıştı', build: (c, a) => `${c.projectName ? `${c.projectName} projesinde` : 'Projelerimde'} bu ay kim hangi kayıtta kaç saat çalıştı ve maliyeti ne? Kişi bazında özetle.${topic(a)}` },
    { cmd: 'kapasite', label: 'Kapasitesini aşanlar', build: (_c, a) => `Bu yıl hangi aylarda kapasitesini aşan kişiler var? En kritik olanları ve önerini göster.${topic(a)}` },
    { cmd: 'excel', label: 'Excel dosyası', arg: 'ne?', build: (c, a) => fileAsk('Excel', c, a) },
    { cmd: 'pdf', label: 'PDF raporu', arg: 'ne?', build: (c, a) => fileAsk('PDF', c, a) },
    { cmd: 'sunum', label: 'PowerPoint sunumu', arg: 'ne?', build: (c, a) => fileAsk('PowerPoint', c, a) },
    { cmd: 'bu', label: 'Ekrandakini açıkla', build: (c, a) => (c.taskLabel
        ? `Ekranda açık görevi (${c.taskLabel}) açıkla: durumu, gecikme riski, kim çalıştı ve önerin ne?${topic(a)}`
        : c.personName
            ? `Ekranda açık kişiyi (${c.personName}) özetle: iş yükü, projeleri, açık görevleri ve dikkat edilmesi gerekenler.${topic(a)}`
            : `${scope(c)} şu anki durumunu kısaca açıkla.${topic(a)}`) },
    { cmd: 'hatirla', label: 'Bir tercihi hatırlat', arg: 'tercih', build: (_c, a) => (a ? `Şunu hatırla ve bundan sonra uygula: ${a}` : 'Hafızanda benimle ilgili hangi tercihler var?') },
    { cmd: 'unut', label: 'Hafızadan sil', arg: 'not', build: (_c, a) => (a ? `Hafızandan şunu unut: ${a}` : 'Hafızandaki notları listele; hangisini unutmamı istersin diye sor.') },
    { cmd: 'yardim', label: 'Neler yapabilirsin?', build: () => 'Neler yapabilirsin? Rolüme göre kısa örneklerle anlat (okuma, öneri kartları, dosya çıktısı, ekran açma, hafıza).' },
];

function fileAsk(kind: string, c: SlashContext, arg: string): string {
    if (arg) return `${arg} için ${kind} dosyası hazırla${c.projectName ? ` (${c.projectName})` : ''}.`;
    if (c.hasAnswer) return `Son yanıttaki veriyi ${kind} dosyası olarak hazırla.`;
    return `${c.projectName ? `${c.projectName} projesinin açık görevlerini` : 'Portföy özetini'} ${kind} dosyası olarak hazırla.`;
}

/** Komutu bulur: "/gec" gibi tek eşleşen önek de kabul edilir */
export const findCommand = (word: string): SlashCommand | undefined => {
    const w = word.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
    const exact = SLASH_COMMANDS.find(c => c.cmd === w);
    if (exact) return exact;
    const prefix = SLASH_COMMANDS.filter(c => c.cmd.startsWith(w));
    return prefix.length === 1 ? prefix[0] : undefined;
};

/** Menüde gösterilecekler ("/" ile başlayıp henüz boşluk yoksa) */
export const slashMatches = (input: string): SlashCommand[] => {
    const m = /^\/(\S*)$/.exec(input);
    if (!m) return [];
    const w = m[1].toLocaleLowerCase('tr-TR');
    return SLASH_COMMANDS.filter(c => c.cmd.startsWith(w) || c.label.toLocaleLowerCase('tr-TR').includes(w));
};

/**
 * "/komut metin" → istek. Komut değilse null; bilinmeyen komutsa { error }.
 */
export const expandSlash = (input: string, c: SlashContext): string | { error: string } | null => {
    const m = /^\/(\S+)\s*([\s\S]*)$/.exec(input.trim());
    if (!m) return null;
    const cmd = findCommand(m[1]);
    if (!cmd) return { error: `"/${m[1]}" diye bir komut yok. Komutları görmek için yalnız "/" yazın.` };
    return cmd.build(c, m[2].trim());
};
