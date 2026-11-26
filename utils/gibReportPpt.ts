import type { Project } from '../types';
import { importanceLine, pct, signedPoints, syncLabel } from './gibPoc';
import { buildGibReport, GibReportData } from './gibReport';

/**
 * GİB Planlama Raporu — PowerPoint çıktısı (pptxgenjs, isteğe bağlı yüklenir).
 * Aylık sunumun göstergeleri proje verisinden üretilir:
 *  1 Kapak · 2 İlk değerlendirme ve sonuç dağılımı · 3 Bugün ve olası skor,
 *  kapsam · 4 Başlık bazında kapsam maddeleri · 5 Kategoriler ve katkılar ·
 *  6 Yöntem (skor modeli ve katsayılar)
 */

const ACCENT = '1E3A8A';
const GRAY = '6B7280';
const DARK = '1F2937';
const LIGHT = 'F3F4F6';
const FONT = 'Calibri';

const n = (v: number) => v.toLocaleString('tr-TR');

export const gibReportFileName = (d: GibReportData): string =>
    `${d.projectName.replace(/[^\p{L}\p{N}]+/gu, '_')}_GIB_Planlama_Raporu_${d.period.replace(/\s+/g, '_')}.pptx`;

export const exportGibReportToPpt = async (project: Project, opts: { scope?: string[]; now?: Date } = {}): Promise<boolean> => {
    const d = buildGibReport(project, opts);
    if (!d) return false;
    const PptxGenJS = (await import('pptxgenjs')).default;
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inç
    pptx.author = 'PlanAsistan';
    pptx.title = `${d.projectName} GİB Planlama Raporu ${d.period}`;
    const s = d.scores;
    const source = `Kaynak: PlanAsistan · Jira verisi ${syncLabel(s.syncAt)}`;

    type Slide = ReturnType<typeof pptx.addSlide>;
    const header = (slide: Slide, title: string, sub?: string) => {
        slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.16, fill: { color: ACCENT } });
        slide.addText(title, { x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontSize: 26, bold: true, color: DARK, fontFace: FONT });
        if (sub) slide.addText(sub, { x: 0.5, y: 0.9, w: 12.3, h: 0.4, fontSize: 14, color: GRAY, fontFace: FONT });
        slide.addText(source, { x: 0.5, y: 7.0, w: 12.3, h: 0.3, fontSize: 10, color: GRAY, fontFace: FONT });
    };
    const card = (slide: Slide, x: number, y: number, w: number, label: string, value: string, sub: string, tone = ACCENT) => {
        slide.addShape('roundRect', { x, y, w, h: 1.9, fill: { color: LIGHT }, line: { color: 'E5E7EB', width: 1 }, rectRadius: 0.08 });
        slide.addText(label, { x: x + 0.25, y: y + 0.15, w: w - 0.5, h: 0.4, fontSize: 14, color: GRAY, fontFace: FONT });
        slide.addText(value, { x: x + 0.25, y: y + 0.55, w: w - 0.5, h: 0.8, fontSize: 36, bold: true, color: tone, fontFace: FONT });
        slide.addText(sub, { x: x + 0.25, y: y + 1.35, w: w - 0.5, h: 0.4, fontSize: 12, color: GRAY, fontFace: FONT });
    };
    const th = (t: string) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: ACCENT } } });
    const td = (cells: string[]) => cells.map(text => ({ text }));

    // 1) Kapak
    const cover = pptx.addSlide();
    cover.addShape('rect', { x: 0, y: 5.9, w: 13.33, h: 1.6, fill: { color: ACCENT } });
    cover.addText(d.projectName, { x: 0.8, y: 2.0, w: 11.7, h: 0.6, fontSize: 20, color: GRAY, fontFace: FONT });
    cover.addText(`GİB Planlama Raporu · ${d.period}`, { x: 0.8, y: 2.5, w: 11.7, h: 1.1, fontSize: 40, bold: true, color: DARK, fontFace: FONT });
    cover.addText(`PoC skoru: İlk ${pct(s.initial)} · Bugün ${pct(s.today)} · ${d.scopeName} sonrası ${pct(s.possible)}`, { x: 0.8, y: 3.6, w: 11.7, h: 0.5, fontSize: 18, color: GRAY, fontFace: FONT });
    cover.addText(`Jira verisi: ${syncLabel(s.syncAt)} · Oluşturma: ${new Date(d.generatedAt).toLocaleString('tr-TR')}`, { x: 0.8, y: 6.35, w: 11.7, h: 0.5, fontSize: 14, color: 'FFFFFF', fontFace: FONT });

    // 2) İlk değerlendirme
    const s2 = pptx.addSlide();
    header(s2, 'İlk değerlendirme', `GİB PoC raporu: ${n(d.distribution.total)} test, ağırlıklı skor`);
    card(s2, 0.5, 1.5, 4.0, 'İlk değerlendirme PoC skoru', pct(s.initial), 'Zorunlu 3 · Olması beklenen 2 · İsteğe bağlı 1');
    card(s2, 4.7, 1.5, 4.0, `Sonuç dağılımı (${n(d.distribution.total)} test)`, `${d.distribution.met} / ${d.distribution.partial} / ${d.distribution.other}`, 'karşılandı / kısmen / diğer');
    card(s2, 8.9, 1.5, 3.9, `Zorunlu (${n(d.mandatoryDistribution.total)} test)`, `${d.mandatoryDistribution.met} / ${d.mandatoryDistribution.partial} / ${d.mandatoryDistribution.other}`, 'karşılandı / kısmen / diğer');
    const bc = d.distribution.byClass, mc = d.mandatoryDistribution.byClass;
    s2.addTable([
        [th('Sonuç'), th('Tüm testler'), th('Zorunlu')],
        ...([['Karşılandı', 'met'], ['Kısmen karşılandı', 'partial'], ['Karşılanmadı', 'unmet'], ['Test edilemedi', 'untestable'], ['Değerlendirme dışı', 'excluded'], ['Üreticiye sorulacak', 'askVendor']] as const)
            .map(([l, k]) => td([l, n(bc[k]), n(mc[k])])),
    ], { x: 0.5, y: 3.8, w: 8.2, fontSize: 13, fontFace: FONT, color: DARK, border: { type: 'solid', color: 'E5E7EB', pt: 1 }, colW: [3.6, 2.3, 2.3] });

    // 3) Bugün ve olası
    const s3 = pptx.addSlide();
    header(s3, `Bugün ve ${d.scopeName} sonrası`, 'Bugün: GİB sonucu + görevlerin son Jira durumundaki süreç katsayısı');
    card(s3, 0.5, 1.5, 3.0, 'İlk', pct(s.initial), 'GİB raporu');
    card(s3, 3.65, 1.5, 3.0, 'Doğrulanmış', pct(s.verified), signedPoints(s.verified - s.initial));
    card(s3, 6.8, 1.5, 3.0, 'Bugün', pct(s.today), signedPoints(s.today - s.verified));
    card(s3, 9.95, 1.5, 2.9, `${d.scopeName} sonrası`, pct(s.possible), `${signedPoints(s.possible - s.initial)} (İlk'e göre)`, '047857');
    s3.addText([
        { text: `${d.scopeName} kapsamı: `, options: { bold: true } },
        { text: `${n(d.tracked)} maddenin ${n(d.scopeItems)}'i\n` },
        { text: 'Önem sınıfına göre: ', options: { bold: true } },
        { text: `${importanceLine(d.scopeByImportance)}\n` },
        { text: 'Zorunlu açık madde: ', options: { bold: true } },
        { text: `${n(s.mandatoryOpen)}` },
    ], { x: 0.5, y: 3.8, w: 12.3, h: 1.6, fontSize: 18, color: DARK, fontFace: FONT, valign: 'top' });

    // 4) Başlık bazında
    const s4 = pptx.addSlide();
    header(s4, `Başlık bazında ${d.scopeName} maddeleri`, `${d.headings.length} başlık, ${n(d.scopeItems)} madde`);
    s4.addTable([
        [th('Başlık (iş paketi)'), th('Madde'), th('Zorunlu'), th('Olması beklenen'), th('İsteğe bağlı'), th('Tamamlanan')],
        ...d.headings.map(h => td([h.name, n(h.items), n(h.byImportance['Zorunlu'] || 0), n(h.byImportance['Olması beklenen'] || 0), n(h.byImportance['İsteğe bağlı'] || 0), n(h.done)])),
    ], { x: 0.5, y: 1.5, w: 12.3, fontSize: 13, fontFace: FONT, color: DARK, border: { type: 'solid', color: 'E5E7EB', pt: 1 }, colW: [5.3, 1.2, 1.4, 1.8, 1.4, 1.2], autoPage: true, autoPageRepeatHeader: true });

    // 5) Kategoriler ve katkılar
    const s5 = pptx.addSlide();
    header(s5, `${d.scopeName} sonrası kategoriler`, `Kalan açık ${signedPoints(100 - s.possible)} puan; katkılar sırasız, toplamı 100 − olası skor`);
    s5.addTable([
        [th('Kategori'), th('Madde'), th('Önem dağılımı'), th('Yanıt bekleniyor'), th('Katkı'), th('Tek başına')],
        ...d.categories.map(c => td([c.name, n(c.items), importanceLine(c.byImportance, true), c.awaiting ? n(c.awaiting) : '—', c.contribution !== undefined ? signedPoints(c.contribution) : '—', c.alone !== undefined ? signedPoints(c.alone) : '—'])),
    ], { x: 0.5, y: 1.5, w: 12.3, fontSize: 14, fontFace: FONT, color: DARK, border: { type: 'solid', color: 'E5E7EB', pt: 1 }, colW: [3.2, 1.2, 3.1, 1.9, 1.4, 1.5] });
    s5.addText('Z = Zorunlu, OB = Olması beklenen, İB = İsteğe bağlı. "Tek başına": yalnız o kategori kapsama eklenseydi olası skordaki artış (toplanmaz).', { x: 0.5, y: 6.3, w: 12.3, h: 0.5, fontSize: 11, color: GRAY, fontFace: FONT });

    // 6) Yöntem
    const s6 = pptx.addSlide();
    header(s6, 'Yöntem: skor modeli', 'Her test GİB puanından başlar; kalan açığı bağlı görevin Jira durumuna verilen katsayı kadar kapatır');
    const coeff = project.poc?.settings?.coefficients;
    const rows = [
        ...Object.entries(coeff?.categories || {}).map(([k, v]) => [({ Backlog: 'Bekleyen', ToDo: 'Yapılacak', InProgress: 'Süreçte', Done: 'Tamamlandı' } as Record<string, string>)[k] || k, (v / 100).toLocaleString('tr-TR')]),
        ...Object.entries(coeff?.statuses || {}).map(([k, v]) => [k, (v / 100).toLocaleString('tr-TR')]),
    ];
    s6.addText([
        { text: 'pᵢ = bᵢ + (1 − bᵢ) · k(sᵢ)     Skor = 100 · Σ wᵢ pᵢ / Σ wᵢ\n', options: { bold: true } },
        { text: 'w: ağırlık (Zorunlu 3, Olması beklenen 2, İsteğe bağlı 1) · b: Güncel Sonuç, yoksa PoC sonucu (karşılandı 1, kısmen 0,5, karşılanmadı 0) · k: Jira durumu katsayısı (0–1).\n' },
        { text: `Değerlendirilmemiş testler (test edilemedi, üreticiye sorulacak, değerlendirme dışı) paydada yoktur; ${project.poc?.settings?.unevaluated === 'never' ? 'GİB yeniden değerlendirene kadar girmez' : 'madde tamamlanınca (k = 1) 1 puanla girer'}.` },
    ], { x: 0.5, y: 1.5, w: 12.3, h: 1.8, fontSize: 15, color: DARK, fontFace: FONT, valign: 'top' });
    s6.addTable([
        [th('Jira durumu'), th('Katsayı (k)')],
        ...(rows.length ? rows : [['Tamamlandı', '1'], ['Diğer durumlar', '0']]).map(td),
    ], { x: 0.5, y: 3.5, w: 6.0, fontSize: 13, fontFace: FONT, color: DARK, border: { type: 'solid', color: 'E5E7EB', pt: 1 }, colW: [4.0, 2.0] });

    await pptx.writeFile({ fileName: gibReportFileName(d) });
    return true;
};
