import { Abbreviation, CustomerMeeting, Project, ReportCategory, ReportItem, TaskStatus, WeeklyReport, WorklogEntry } from '../../types';
import { meetingToDetails } from '../customerMeetings';
import { CATEGORY_META, itemDisplay, meetingSentence, newItem, THIS_WEEK_CATEGORIES, weekLabel } from '../weeklyReport';
import { summarizeWorklog } from '../worklog';
import { extractJson } from './json';

/**
 * Haftalık rapor önerisi — kurum rapor kılavuzu sistem istemine gömülüdür
 * (istem düzeyinde ince ayar). Kurumda onaylanmış önceki raporlardan stil
 * örnekleri eklenir; AI önerisi + onaylı son hâl çiftleri ince ayar (fine-
 * tuning) veri seti olarak dışa aktarılabilir.
 */

export const REPORT_SYSTEM = `Sen TÜBİTAK BİLGEM'de proje yöneticisinin (PY) haftalık raporunu hazırlayan yazım asistanısın. Raporu müdürler okur.
Yalnızca sana verilen verilere dayan; tarih, rakam, kişi ya da kurum UYDURMA. Bilgi eksikse maddeyi yazma, "eksikBilgi" listesine soru olarak ekle.

KURUM RAPOR KILAVUZU
Biçim:
- Kısaltmaların açılımı mutlaka yazılacak (kullandığın her kısaltmayı "kisaltmalar" listesine açılımıyla ekle).
- İfadeler net ve tanımlı olacak. Tarih, rakam ve müşteri/paydaş adları net yazılacak; belirsiz ifade (bazı, birkaç, yakında, ilgili birim, vb.) kullanılmayacak.
- Sadece takvim/bütçe/risk odaklı önemli gelişmeler yazılacak. Rutin proje yönetim faaliyetleri yazılmayacak.
- ÖNEMLİ: Konuya PY kadar hâkim olmayan biri anlayabilmeli. Anlaşılması için gerekiyorsa açıklayıcı ayrıntı ver.
- Toplantılar çok özet yazılacak: zaman, yer, katılımcılar, gündem ve alınan en önemli kararlar. Örnek: "10 Eylül 2026 tarihinde BİLGEM'de Gebze Belediyesi'ne Ürün Yönetimi, Proje Yönetimi ve Mesajlaşma birimlerinin katılımıyla Safir Posta tanıtım demosu yapıldı. Belediyede on-prem 50 kişilik bir pilot kurulum yapılması kararlaştırıldı."
- Devam eden faaliyetlerde çalışılan konu net yazılacak. "Bu hafta çalışmalara devam edildi" YERİNE "Bu hafta Safir Posta'da multi-domain özelliğinin geliştirilmesine devam edildi."
- Kısa cümleler; paragraf YOK, her gelişme ayrı madde.

Raporda istenenler: yeni sözleşme çalışmaları; ürün/lisans satışları; kesilen faturalar, hakedişler; tamamlanan aşamalar/kabuller; müşteriye yapılan teslimatlar; İG (İş Geliştirme) ile firmalarla/müşterilerle yapılan toplantılar, sunumlar, tanıtımlar; takvim ve bütçeyi etkileyen önemli gelişmeler; fuar, konferans, etkinlik katılımları; müşteriyi etkileyen önemli geliştirmeler (ör. sahadan gelen önemli bir sorun giderildi, müşterinin istediği özellik tamamlandı).
Raporda istenmeyenler: uzun cümleler; paragraf yazımı; içeride rutin geliştirme/test/hata düzeltme çalışmaları (müşterinin acil istediği ya da müşteriye önemli fayda sağlayanlar hariç); müşteriyi doğrudan etkilemeyen iç ekip takip faaliyetleri.

Maddeleri şu türlerden biriyle etiketle: ${THIS_WEEK_CATEGORIES.map(c => `${c} (${CATEGORY_META[c].label})`).join(', ')}.
Yanıtı YALNIZCA şu JSON biçiminde ver (açıklama, markdown ya da kod bloğu ekleme):
{"buHafta":[{"tur":"delivery","metin":"..."}],"gelecekHafta":["..."],"kisaltmalar":[{"kisaltma":"İG","acilim":"İş Geliştirme"}],"eksikBilgi":["..."]}`;

/** Az örnekli (few-shot) gösterim: kılavuza uygun bir girdi → çıktı */
export const REPORT_EXAMPLE = {
    input: `Proje: Safir Posta (P-100)
Hafta: 37. hafta (7–11 Eylül 2026)
Haftalık notlar:
- 10.09: Gebze Bld. demo yapıldı, Ürün Yön + PY + Mesajlaşma katıldı. 50 kişilik on-prem pilot konuşuldu, onaylandı.
- multi-domain geliştirmesine devam
- iç sprint planlama yapıldı, 14 bug kapatıldı
Worklog (konu bazında): MKS-12 Multi-domain desteği 22 sa; MKS-31 Hata düzeltmeleri 9 sa`,
    output: `{"buHafta":[{"tur":"meeting","metin":"10 Eylül 2026 tarihinde BİLGEM'de Gebze Belediyesi'ne Ürün Yönetimi, Proje Yönetimi ve Mesajlaşma birimlerinin katılımıyla Safir Posta tanıtım demosu yapıldı. Belediyede on-prem 50 kişilik bir pilot kurulum yapılması kararlaştırıldı."},{"tur":"ongoing","metin":"Bu hafta Safir Posta'da multi-domain (birden fazla alan adını tek kurulumda yönetme) özelliğinin geliştirilmesine devam edildi."}],"gelecekHafta":["Gebze Belediyesi pilot kurulumunun takvimi ve sunucu ihtiyacı belediye ile netleştirilecek."],"kisaltmalar":[],"eksikBilgi":["Pilot kurulumun başlangıç tarihi nedir?"]}`,
};

const clip = (s: string | undefined, n: number) => {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export interface ReportPromptInput {
    project: Project;
    year: number;
    week: number;
    worklog?: WorklogEntry[];
    heldMeetings?: CustomerMeeting[];
    plannedMeetings?: CustomerMeeting[];
    previous?: WeeklyReport; // geçen haftanın onaylı raporu (planlar ne oldu?)
    styleExamples?: WeeklyReport[]; // kurumda onaylanmış raporlar (stil örneği)
    dictionary?: Abbreviation[];
}

/** Rapor taslağı için girdi metni (aynı metin ince ayar veri setinde "user" mesajı olur) */
export const buildReportInput = (i: ReportPromptInput): string => {
    const p = i.project;
    const L: string[] = [`Proje: ${p.name}${p.code ? ` (${p.code})` : ''}`, `Hafta: ${weekLabel(i.year, i.week, true)}`];
    if (p.ragNote) L.push(`PY haftalık durum notu: ${clip(p.ragNote, 300)}`);
    const notes = p.notes.filter(n => n.year === i.year && n.weekNumber === i.week);
    if (notes.length) {
        L.push('Haftalık notlar:');
        let budget = 3500;
        for (const n of notes) {
            const line = `- ${n.createdAt.slice(5, 10).split('-').reverse().join('.')}: ${clip(n.content, 600)}`;
            if (line.length > budget) break;
            budget -= line.length;
            L.push(line);
        }
    } else {
        L.push('Haftalık notlar: (bu hafta not girilmemiş)');
    }
    const wl = summarizeWorklog(i.worklog || []);
    if (wl.length) {
        L.push('Worklog (konu bazında, saat):');
        wl.slice(0, 15).forEach(w => L.push(`- ${w.issueKey ? `${w.issueKey} ` : ''}${clip(w.summary, 90)}: ${w.hours} sa${w.comments.length ? ` — ${clip(w.comments.join(' / '), 160)}` : ''}`));
    }
    if (i.heldMeetings?.length) {
        L.push('Bu hafta yapılan müşteri görüşmeleri (kayıtlı):');
        i.heldMeetings.forEach(m => L.push(`- ${meetingSentence(meetingToDetails(m))}`));
    }
    if (i.plannedMeetings?.length) {
        L.push('Gelecek hafta planlanan görüşmeler:');
        i.plannedMeetings.forEach(m => L.push(`- ${m.date.slice(0, 10)} ${m.customer}: ${m.title}`));
    }
    const due = p.tasks.filter(t => t.dueDate && t.status !== TaskStatus.Done).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 8);
    if (due.length) L.push(`Terminli açık işler: ${due.map(t => `${t.name} (${t.dueDate!.slice(0, 10)})`).join('; ')}`);
    const risks = (p.risks || []).filter(r => r.status !== 'closed' && r.probability * r.impact >= 15);
    if (risks.length) L.push(`Yüksek riskler: ${risks.map(r => r.title).join('; ')}`);
    if (i.previous?.nextWeek.length) L.push(`Geçen hafta planlananlar: ${i.previous.nextWeek.map(itemDisplay).join(' | ')}`);
    if (i.dictionary?.length) L.push(`Kurum kısaltma sözlüğü: ${i.dictionary.map(a => `${a.abbr}=${a.expansion}`).join('; ')}`);
    return L.join('\n');
};

/** Tam istem: örnek + (varsa) kurumda onaylanmış stil örnekleri + bu haftanın girdisi */
export const buildReportPrompt = (input: string, styleExamples: WeeklyReport[] = []): string => {
    const S: string[] = [`ÖRNEK GİRDİ:\n${REPORT_EXAMPLE.input}\nÖRNEK ÇIKTI:\n${REPORT_EXAMPLE.output}`];
    const lines = styleExamples.flatMap(r => r.thisWeek.map(itemDisplay)).filter(Boolean).slice(0, 8);
    if (lines.length) S.push(`Kurumda onaylanmış önceki rapor maddelerinden örnekler (üslup için):\n${lines.map(l => `- ${clip(l, 300)}`).join('\n')}`);
    S.push(`ŞİMDİKİ GİRDİ:\n${input}\n\nYukarıdaki kılavuza göre bu haftanın raporunu JSON olarak yaz.`);
    return S.join('\n\n');
};

export interface ReportSuggestion {
    thisWeek: ReportItem[];
    nextWeek: ReportItem[];
    abbreviations: Abbreviation[];
    missing: string[];
}

const asText = (v: unknown): string => (typeof v === 'string' ? v : v && typeof v === 'object' && 'metin' in (v as object) ? String((v as { metin: unknown }).metin) : '').replace(/\s+/g, ' ').trim();

/**
 * Model yanıtını doğrular; bilinmeyen tür "devam eden faaliyet" sayılır,
 * boş/tekrarlı maddeler atılır. Biçim bozuksa ya da madde yoksa hata fırlatır
 * (arayüz hatayı kullanıcıya gösterir).
 */
export const parseReportSuggestion = (text: string): ReportSuggestion => {
    const j = extractJson(text) as Record<string, unknown> | null;
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('Model yanıtı beklenen biçimde değil; tekrar deneyin.');
    const seen = new Set<string>();
    const uniq = (t: string) => { const k = t.toLocaleLowerCase('tr-TR'); if (!t || seen.has(k)) return false; seen.add(k); return true; };
    const thisWeek = (Array.isArray(j.buHafta) ? j.buHafta : []).slice(0, 15).map(x => {
        const t = asText(x);
        const tur = x && typeof x === 'object' ? String((x as { tur?: unknown }).tur || '') : '';
        const cat: ReportCategory = (THIS_WEEK_CATEGORIES as string[]).includes(tur) ? (tur as ReportCategory) : 'ongoing';
        return uniq(t) ? newItem(cat, t, { source: 'ai' }) : null;
    }).filter((x): x is ReportItem => !!x);
    const nextWeek = (Array.isArray(j.gelecekHafta) ? j.gelecekHafta : []).slice(0, 10).map(asText).filter(uniq).map(t => newItem('plan', t, { source: 'ai' }));
    const abbreviations = (Array.isArray(j.kisaltmalar) ? j.kisaltmalar : []).map(a => {
        const o = (a || {}) as Record<string, unknown>;
        return { abbr: String(o.kisaltma || o.abbr || '').trim(), expansion: String(o.acilim || o.expansion || '').trim() };
    }).filter(a => a.abbr && a.expansion);
    const missing = (Array.isArray(j.eksikBilgi) ? j.eksikBilgi : []).map(asText).filter(Boolean).slice(0, 8);
    if (!thisWeek.length && !nextWeek.length) throw new Error('Öneri üretilemedi: bu hafta için not, worklog ya da görüşme kaydı ekleyip tekrar deneyin.');
    return { thisWeek, nextWeek, abbreviations, missing };
};
