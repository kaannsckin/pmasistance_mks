import { kindOfJiraType } from './issueTypeMeta';
import { mapJiraPriority } from './planning/jiraFields';
import { TestWeekReport, weekNumber } from './testBoard';

/**
 * Haftalık test durum raporu: panonun dökümü değil, okunacak bir rapor.
 * Genel durum (gerekçeli), yönetici özeti, karşılaştırmalı göstergeler,
 * riskler, kayıt tabloları (başlık, öncelik, durum, kişi) ve veri notları.
 * Aynı belge düz metne (e-posta, Teams) ve biçimli HTML'e (Outlook, Word,
 * Teams'e yapıştırma; yazdır / PDF) çevrilir.
 */

export type TestHealth = 'Riskli' | 'Dikkat' | 'Yolunda';

export interface ReportTable {
    columns: string[];
    rows: string[][];
    /** Gösterilmeyen satır sayısı */
    more: number;
}

export interface ReportSection {
    title: string;
    intro?: string;
    bullets?: string[];
    table?: ReportTable;
    /** Boşsa yazılacak cümle */
    empty?: string;
}

export interface TestReportDoc {
    title: string;
    subtitle: string;
    meta: [string, string][];
    health: { level: TestHealth; reason: string };
    summary: string;
    kpis: ReportTable;
    sections: ReportSection[];
    notes: string[];
}

const MAX_ROWS = 25;
const PRIO_TR: Record<string, string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };
const TZ = 'Europe/Istanbul';
const day = (iso: string, year = false) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}), timeZone: TZ });
const stamp = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const n = (v: number) => v.toLocaleString('tr-TR');
const diff = (now: number, before: number | null) => (before === null ? '—' : now === before ? '=' : `${now > before ? '+' : ''}${n(now - before)}`);

const table = (columns: string[], all: string[][]): ReportTable => ({ columns, rows: all.slice(0, MAX_ROWS), more: Math.max(0, all.length - MAX_ROWS) });

/** Genel durum: açık engelleyici hata ya da çok sayıda yeniden açılma riskli; yüksek öncelikli açık hata, yeniden açılma ya da onaydan fazla yeni hata dikkat */
export const testHealth = (r: TestWeekReport): { level: TestHealth; reason: string } => {
    const blocker = r.openBugs.filter(b => b.priority === 'Blocker').length;
    const high = r.openBugs.filter(b => b.priority === 'High').length;
    if (blocker) return { level: 'Riskli', reason: `${n(blocker)} engelleyici öncelikli hata açık${r.reopened.length >= 3 ? `; bu hafta ${n(r.reopened.length)} kayıt yeniden açıldı` : ''}.` };
    if (r.reopened.length >= 3) return { level: 'Riskli', reason: `Bu hafta ${n(r.reopened.length)} kayıt yeniden açıldı; düzeltmelerin kalıcılığı sorgulanmalı.` };
    const why = [
        high ? `${n(high)} yüksek öncelikli hata açık` : '',
        r.reopened.length ? `${n(r.reopened.length)} kayıt yeniden açıldı` : '',
        r.newBugs.length > r.approved.length ? `yeni açılan hata (${n(r.newBugs.length)}) onaylanan maddeden (${n(r.approved.length)}) fazla` : '',
    ].filter(Boolean);
    if (why.length) return { level: 'Dikkat', reason: `${why.join('; ')}.`.replace(/^./, c => c.toUpperCase()) };
    return { level: 'Yolunda', reason: 'Açık kritik hata yok; onaylanan madde sayısı yeni hataların üstünde.' };
};

export const buildTestReport = (r: TestWeekReport, meta: { project: string; filter?: string; generatedAt?: string }): TestReportDoc => {
    const w = weekNumber(r.week);
    const period = `${day(r.from)} – ${day(r.to, true)}`;
    const col = (m: string) => r.columns.find(c => c.meaning === m);
    const waiting = col('waiting'), testing = col('testing');
    const critical = r.openBugs.filter(b => b.priority === 'Blocker' || b.priority === 'High');
    const prio = r.bugsByPriority.filter(p => p.n).map(p => `${n(p.n)} ${PRIO_TR[p.priority].toLocaleLowerCase('tr-TR')}`);
    const bugsCritical = r.bugsByPriority.filter(p => p.priority === 'Blocker' || p.priority === 'High').reduce((a, p) => a + p.n, 0);

    // Yönetici özeti: sayıların ne anlama geldiği cümlelerle
    const sentences = [
        `${w}. haftada (${period}) ${n(r.approved.length)} madde test edilerek onaylandı.`,
        r.newBugs.length
            ? `Aynı dönemde ${n(r.newBugs.length)} yeni hata kaydı açıldı${prio.length ? ` (${prio.join(', ')})` : ''}${r.testerRoleDefined && r.newBugs.length ? `; bunların ${n(r.bugsFromTesters)} tanesi test ekibince bildirildi` : ''}.`
            : 'Bu dönemde yeni hata kaydı açılmadı.',
        [r.newChanges.length ? `${n(r.newChanges.length)} değişiklik talebi alındı` : '', r.reopened.length ? `${n(r.reopened.length)} kayıt düzeltme sonrası yeniden açıldı` : ''].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase()) + (r.newChanges.length || r.reopened.length ? '.' : ''),
        `Dönem sonunda ${testing ? `${n(testing.now)} kayıt testte` : ''}${testing && waiting ? ', ' : ''}${waiting ? `${n(waiting.now)} kayıt test için bekliyor` : ''}${testing || waiting ? '; ' : ''}açık hata sayısı ${n(r.openBugs.length)}${critical.length ? ` (${n(critical.length)} kritik)` : ''}${r.openBugsBefore !== null ? `, geçen haftaya göre ${diff(r.openBugs.length, r.openBugsBefore)}` : ''}.`,
    ].filter(s => s && s !== '.');

    const kpiRows: [string, number, number | null][] = [
        ['Test edilip onaylanan madde', r.approved.length, null],
        ['Yeni açılan hata', r.newBugs.length, null],
        ['  — engelleyici / yüksek öncelikli', bugsCritical, null],
        ['Yeni değişiklik talebi', r.newChanges.length, null],
        ['Yeniden açılan kayıt', r.reopened.length, null],
        ...(testing ? [[testing.name, testing.now, testing.before] as [string, number, number | null]] : []),
        ...(waiting ? [[waiting.name, waiting.now, waiting.before] as [string, number, number | null]] : []),
        ['Açık hata (toplam)', r.openBugs.length, r.openBugsBefore],
        ['  — kritik (engelleyici + yüksek)', critical.length, null],
    ];
    const kpis = table(['Gösterge', 'Bu hafta', 'Geçen hafta', 'Değişim'], kpiRows.map(([l, v, b]) => [l, n(v), b === null ? '—' : n(b), diff(v, b)]));

    // Öne çıkanlar ve riskler
    const risks = [
        ...(critical.length ? [`${n(critical.length)} kritik hata açık: ${critical.slice(0, 5).map(b => `${b.key} (${PRIO_TR[b.priority]})`).join(', ')}${critical.length > 5 ? '…' : ''}.`] : []),
        ...(r.reopened.length ? [`Yeniden açılan kayıtlar (${n(r.reopened.length)}) düzeltme kalitesine işaret eder: ${r.reopened.slice(0, 5).map(i => i.key).join(', ')}.`] : []),
        ...(waiting && waiting.before !== null && waiting.now > waiting.before ? [`Test bekleyen kuyruk büyüdü (${n(waiting.before)} → ${n(waiting.now)}); test kapasitesi gözden geçirilmeli.`] : []),
        ...(r.waiting[0]?.days && r.waiting[0].days >= 5 ? [`En uzun test bekleyen kayıt ${r.waiting[0].key}: ${n(r.waiting[0].days)} gündür bekliyor.`] : []),
        ...(r.testing[0]?.days && r.testing[0].days >= 10 ? [`En uzun süredir testte olan kayıt ${r.testing[0].key}: ${n(r.testing[0].days)} gün.`] : []),
        ...(r.newBugs.length > r.approved.length && r.newBugs.length ? [`Yeni hata girişi (${n(r.newBugs.length)}) onaylanan madde sayısının (${n(r.approved.length)}) üstünde; açık hata stoku artma eğiliminde.`] : []),
        ...(r.newChanges.length ? [`${n(r.newChanges.length)} yeni değişiklik talebi kapsam ve takvim etkisi açısından değerlendirilmeli.`] : []),
    ];

    const sections: ReportSection[] = [
        { title: 'Öne çıkanlar ve riskler', bullets: risks, empty: 'Bu hafta öne çıkan bir risk yok.' },
        { title: 'Açık kritik hatalar', table: table(['Kayıt', 'Başlık', 'Öncelik', 'Durum', 'Atanan'], critical.map(b => [b.key, b.name, PRIO_TR[b.priority], b.status, b.assignee || '—'])), empty: 'Açık engelleyici ya da yüksek öncelikli hata yok.' },
        { title: 'Bu hafta test edilip onaylananlar', table: table(['Kayıt', 'Başlık', 'Tür', 'Atanan'], r.approved.map(a => [a.k, a.n, typeTr(a.t), a.a || '—'])), empty: 'Bu hafta onaylanan madde yok.' },
        { title: 'Bu hafta açılan hatalar', table: table(['Kayıt', 'Başlık', 'Öncelik', 'Durum', 'Açan', 'Atanan'], [...r.newBugs].sort((a, b) => rank(a.priority) - rank(b.priority)).map(b => [b.key, b.summary, PRIO_TR[mapJiraPriority(b.priority)], b.status, b.reporter || '—', b.assignee || '—'])), empty: 'Bu hafta yeni hata açılmadı.' },
        { title: 'Değişiklik talepleri', table: table(['Kayıt', 'Başlık', 'Durum', 'Açan'], r.newChanges.map(c => [c.key, c.summary, c.status, c.reporter || '—'])), empty: 'Bu hafta değişiklik talebi gelmedi.' },
        { title: 'Yeniden açılan kayıtlar', table: table(['Kayıt', 'Başlık', 'Durum', 'Atanan'], r.reopened.map(c => [c.key, c.summary, c.status, c.assignee || '—'])), empty: 'Bu hafta yeniden açılan kayıt yok.' },
        ...(testing || waiting ? [{
            title: 'Test kuyruğu',
            intro: [testing ? `${testing.name}: ${n(testing.now)}` : '', waiting ? `${waiting.name}: ${n(waiting.now)}` : ''].filter(Boolean).join(' · '),
            table: table(['Kayıt', 'Başlık', 'Aşama', 'Bekleme (gün)', 'Atanan'], [
                ...r.waiting.map(x => [x.key, x.name, waiting?.name || 'Test bekliyor', x.days === null ? '—' : n(x.days), x.assignee || '—']),
                ...r.testing.map(x => [x.key, x.name, testing?.name || 'Testte', x.days === null ? '—' : n(x.days), x.assignee || '—']),
            ]),
            empty: 'Test kuyruğunda kayıt yok.',
        }] : []),
        { title: 'Pano dağılımı', table: table(['Kolon', 'Bu hafta', 'Geçen hafta', 'Değişim'], [
            ...r.columns.map(c => [c.name, n(c.now), c.before === null ? '—' : n(c.before), diff(c.now, c.before)]),
            ...(r.unmatched ? [['Eşleşmeyen (kural dışı)', n(r.unmatched), '—', '—']] : []),
        ]) },
    ];

    const notes = [
        ...(!r.hasPrevious ? ['Önceki haftanın görüntüsü bulunmadığından dönem son 7 gün olarak alındı; geçen haftayla karşılaştırma yapılamadı.'] : []),
        'Yeni açılan hata ve değişiklik talebi sayıları Jira açılış tarihine göredir. Panodaki "Açılan hatalar" kolonu ise o an çözülmemiş test hatalarının toplamıdır; bu nedenle iki sayı farklı olabilir.',
        ...(!r.testerRoleDefined && r.newBugs.length ? ['Test ekibi projede tanımlı olmadığından (Proje ayarları › Roller › Test) hataların test ekibince açılıp açılmadığı ayrıştırılamadı.'] : []),
        ...(r.reporterMissing && r.reporterMissing === r.newBugs.length && r.newBugs.length ? ['Jira\'dan kaydı açan bilgisi gelmedi; sunucu güncellendikten sonra "Jira\'dan yenile" yapılmalı.'] : []),
        ...(r.unmatched ? [`${n(r.unmatched)} kayıt hiçbir kolon kuralına uymadı; pano kuralları gözden geçirilmeli.`] : []),
    ];

    return {
        title: `${meta.project} · Test Durum Raporu`,
        subtitle: `${w}. Hafta · ${period}`,
        meta: [
            ['Rapor tarihi', stamp(meta.generatedAt || r.to)],
            ['Dönem', `${stamp(r.from)} – ${stamp(r.to)}`],
            ['Kapsam', `${meta.filter ? `Jira kayıtlı filtre "${meta.filter}"` : 'Jira kayıtlı filtre'} · ${n(r.total)} kayıt`],
        ],
        health: testHealth(r),
        summary: sentences.join(' '),
        kpis,
        sections,
        notes,
    };
};

const rank = (p: string) => ({ Blocker: 0, High: 1, Medium: 2, Low: 3 } as Record<string, number>)[mapJiraPriority(p)] ?? 3;
const TYPE_TR: Record<string, string> = { bug: 'Hata', change: 'Değişiklik talebi', story: 'Hikâye', feature: 'Yeni özellik', improvement: 'İyileştirme', task: 'Görev', subtask: 'Alt görev', test: 'Test', epic: 'Epic' };
const typeTr = (t: string) => TYPE_TR[kindOfJiraType(t) || ''] || t || '—';

// ---------------------------------------------------------------- düz metin

const pad = (s: string, w: number) => (s.length >= w ? s : s + ' '.repeat(w - s.length));
const cut = (s: string, w: number) => (s.length > w ? `${s.slice(0, w - 1)}…` : s);

const textTable = (t: ReportTable): string[] => {
    const widths = t.columns.map((c, i) => Math.min(i === 1 && t.columns.length > 4 ? 48 : i === 0 ? 40 : 30, Math.max(c.length, ...t.rows.map(r => (r[i] || '').length))));
    const line = (cells: string[]) => cells.map((c, i) => pad(cut(c || '', widths[i]), widths[i])).join('  ').trimEnd();
    return [line(t.columns), widths.map(w => '─'.repeat(w)).join('  '), ...t.rows.map(line), ...(t.more ? [`… ve ${n(t.more)} kayıt daha`] : [])];
};

export const reportPlainText = (d: TestReportDoc): string => {
    const out: string[] = [d.title.toLocaleUpperCase('tr-TR'), d.subtitle, '', ...d.meta.map(([k, v]) => `${k}: ${v}`), '', `GENEL DURUM: ${d.health.level.toLocaleUpperCase('tr-TR')} — ${d.health.reason}`, '', 'YÖNETİCİ ÖZETİ', d.summary, '', 'TEMEL GÖSTERGELER', ...textTable(d.kpis)];
    d.sections.forEach((s, i) => {
        out.push('', `${i + 1}. ${s.title.toLocaleUpperCase('tr-TR')}`);
        if (s.intro) out.push(s.intro);
        if (s.bullets) out.push(...(s.bullets.length ? s.bullets.map(b => `• ${b}`) : [s.empty || '']));
        if (s.table) out.push(...(s.table.rows.length ? textTable(s.table) : [s.empty || '']));
    });
    if (d.notes.length) out.push('', 'NOTLAR', ...d.notes.map(x => `• ${x}`));
    return out.join('\n');
};

// ---------------------------------------------------------------- biçimli (HTML, satır içi stil: e-posta istemcileri)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HEALTH_STYLE: Record<TestHealth, string> = {
    Riskli: 'background:#fde8e8;color:#9b1c1c;border:1px solid #f8b4b4',
    Dikkat: 'background:#fdf6b2;color:#723b13;border:1px solid #fce96a',
    Yolunda: 'background:#def7ec;color:#03543f;border:1px solid #84e1bc',
};
const FONT = "font-family:Segoe UI,Calibri,Arial,sans-serif;color:#1f2937";
const TH = 'text-align:left;padding:6px 10px;background:#f3f4f6;border-bottom:1px solid #d1d5db;font-size:12px;font-weight:600;color:#374151';
const TD = 'padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top';

const htmlTable = (t: ReportTable): string => {
    const num = (i: number) => t.columns[i] && /hafta|değişim|gün/i.test(t.columns[i]);
    return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:6px 0 4px">`
        + `<tr>${t.columns.map((c, i) => `<th style="${TH}${num(i) ? ';text-align:right' : ''}">${esc(c)}</th>`).join('')}</tr>`
        // Başlık sütunu (çok sütunlu tablolarda 2.) kırılır; kısa sütunlar (kayıt, öncelik, durum, kişi, sayı) tek satır kalır
        + t.rows.map(r => `<tr>${r.map((c, i) => `<td style="${TD}${num(i) ? ';text-align:right' : ''}${i === 1 && t.columns.length > 3 ? '' : ';white-space:nowrap'}${i === 0 ? ';font-weight:600' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')
        + `</table>${t.more ? `<div style="font-size:12px;color:#6b7280">… ve ${n(t.more)} kayıt daha</div>` : ''}`;
};

export const reportHtml = (d: TestReportDoc): string => {
    const h2 = (t: string) => `<h2 style="font-size:15px;margin:22px 0 6px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:4px">${esc(t)}</h2>`;
    const parts = [
        `<div style="${FONT};max-width:900px;line-height:1.5">`,
        `<h1 style="font-size:22px;margin:0;color:#111827">${esc(d.title)}</h1>`,
        `<div style="font-size:15px;color:#4b5563;margin:2px 0 10px">${esc(d.subtitle)}</div>`,
        `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:12px">${d.meta.map(([k, v]) => `<tr><td style="padding:1px 12px 1px 0;font-size:12.5px;color:#6b7280">${esc(k)}</td><td style="padding:1px 0;font-size:12.5px">${esc(v)}</td></tr>`).join('')}</table>`,
        `<div style="${HEALTH_STYLE[d.health.level]};padding:10px 14px;border-radius:6px;font-size:14px"><b>Genel durum: ${esc(d.health.level)}</b> — ${esc(d.health.reason)}</div>`,
        h2('Yönetici özeti'),
        `<p style="margin:4px 0;font-size:14px">${esc(d.summary)}</p>`,
        h2('Temel göstergeler'),
        htmlTable(d.kpis),
        ...d.sections.flatMap((s, i) => [
            h2(`${i + 1}. ${s.title}`),
            s.intro ? `<div style="font-size:13px;color:#4b5563">${esc(s.intro)}</div>` : '',
            s.bullets ? (s.bullets.length ? `<ul style="margin:4px 0 0 18px;padding:0;font-size:13.5px">${s.bullets.map(b => `<li style="margin:2px 0">${esc(b)}</li>`).join('')}</ul>` : `<p style="margin:4px 0;font-size:13px;color:#6b7280">${esc(s.empty || '')}</p>`) : '',
            s.table ? (s.table.rows.length ? htmlTable(s.table) : `<p style="margin:4px 0;font-size:13px;color:#6b7280">${esc(s.empty || '')}</p>`) : '',
        ]),
        d.notes.length ? `${h2('Notlar')}<ul style="margin:4px 0 0 18px;padding:0;font-size:12.5px;color:#4b5563">${d.notes.map(x => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ul>` : '',
        '</div>',
    ];
    return parts.join('');
};
