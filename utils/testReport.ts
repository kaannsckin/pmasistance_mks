import { kindOfJiraType } from './issueTypeMeta';
import { mapJiraPriority } from './planning/jiraFields';
import { TestWeekReport, weekNumber } from './testBoard';

/**
 * Haftalık test raporları: panonun dökümü değil, okunacak belgeler.
 *  - Yönetici özeti: genel durum, haftalık "geçen hafta → bu hafta"
 *    (kalan madde, test kuyruğu, açık ve kritik hata, onaylanan), açılan
 *    kayıtlar, 3-5 öne çıkan madde.
 *  - Detaylı rapor: yukarıdakiler + kişi bazında (en çok kapatan, en çok
 *    hata açan, açık hataların sahipleri) ve kayıt tabloları.
 * Belge blok listesidir; Markdown'a (Teams, wiki, .md) ve satır içi stilli
 * HTML'e (Outlook / Teams / Word'e biçimli yapıştırma, yazdır / PDF) çevrilir.
 * Metindeki **kalın** her iki çıktıda da korunur; Jira metinleri kaçışlıdır.
 */

export type TestHealth = 'Riskli' | 'Dikkat' | 'Yolunda';
export type ReportKind = 'executive' | 'detailed';

export interface ReportTable {
    columns: string[];
    /** Sağa hizalı (sayı) sütunlar */
    numeric?: number[];
    rows: string[][];
    /** Gösterilmeyen satır sayısı */
    more: number;
}

export type ReportBlock =
    | { kind: 'title'; text: string; sub: string }
    | { kind: 'meta'; items: [string, string][] }
    | { kind: 'status'; level: TestHealth; text: string }
    | { kind: 'h'; text: string }
    | { kind: 'p'; text: string }
    | { kind: 'list'; items: string[] }
    | { kind: 'table'; table: ReportTable }
    | { kind: 'note'; items: string[] };

export interface TestReportDoc {
    kind: ReportKind;
    title: string;
    subtitle: string;
    blocks: ReportBlock[];
}

const MAX_ROWS = 25;
const TZ = 'Europe/Istanbul';
const PRIO_TR: Record<string, string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };
const HEALTH_ICON: Record<TestHealth, string> = { Riskli: '🔴', Dikkat: '🟡', Yolunda: '🟢' };
const day = (iso: string, year = false) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}), timeZone: TZ });
const stamp = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const n = (v: number) => v.toLocaleString('tr-TR');
const diff = (now: number, before: number | null) => (before === null ? '—' : now === before ? '=' : `${now > before ? '+' : '−'}${n(Math.abs(now - before))}`);
const fromTo = (now: number, before: number | null) => (before === null ? n(now) : `${n(before)} → ${n(now)}`);
const cap = (s: string) => s.replace(/^./, c => c.toLocaleUpperCase('tr-TR'));

const table = (columns: string[], all: string[][], numeric: number[] = []): ReportTable => ({ columns, numeric, rows: all.slice(0, MAX_ROWS), more: Math.max(0, all.length - MAX_ROWS) });

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
    if (why.length) return { level: 'Dikkat', reason: `${cap(why.join('; '))}.` };
    return { level: 'Yolunda', reason: 'Açık kritik hata yok; onaylanan madde sayısı yeni hataların üstünde.' };
};

// ---------------------------------------------------------------- ortak parçalar

interface Ctx { r: TestWeekReport; w: number; period: string; meta: { project: string; filter?: string; generatedAt?: string } }

const header = (c: Ctx, label: string): ReportBlock[] => [
    { kind: 'title', text: `${c.meta.project} · ${label}`, sub: `${c.w}. Hafta · ${c.period}` },
    {
        kind: 'meta', items: [
            ['Rapor tarihi', stamp(c.meta.generatedAt || c.r.to)],
            ['Dönem', `${stamp(c.r.from)} – ${stamp(c.r.to)}`],
            ['Kapsam', `${c.meta.filter ? `Jira kayıtlı filtre "${c.meta.filter}"` : 'Jira kayıtlı filtre'} · ${n(c.r.total)} kayıt`],
        ],
    },
];

const statusBlock = (r: TestWeekReport): ReportBlock => { const h = testHealth(r); return { kind: 'status', level: h.level, text: h.reason }; };

const col = (r: TestWeekReport, m: string) => r.columns.find(c => c.meaning === m);
const critical = (r: TestWeekReport) => r.openBugs.filter(b => b.priority === 'Blocker' || b.priority === 'High');

/** Dönemde açılan kayıtlar cümlesi: "25 kayıt açıldı: 23 hata (5 engelleyici, 3 yüksek, 15 orta), 2 değişiklik talebi" */
const openedLine = (r: TestWeekReport): string => {
    const total = r.newByType.reduce((a, t) => a + t.n, 0);
    if (!total) return 'Bu hafta yeni kayıt açılmadı.';
    const prio = r.bugsByPriority.filter(p => p.n).map(p => `${n(p.n)} ${PRIO_TR[p.priority].toLocaleLowerCase('tr-TR')}`);
    const parts = r.newByType.map(t => {
        const k = kindOfJiraType(t.type);
        if (k === 'bug') return `**${n(t.n)} hata**${prio.length ? ` (${prio.join(', ')})` : ''}`;
        if (k === 'change') return `**${n(t.n)} değişiklik talebi**`;
        return `${n(t.n)} ${t.type.toLocaleLowerCase('tr-TR')}`;
    });
    return `Bu hafta **${n(total)} kayıt** açıldı: ${parts.join(', ')}.`;
};

/** Haftalık değişim tablosu: geçen hafta → bu hafta */
const movementTable = (r: TestWeekReport): ReportTable => {
    const crit = critical(r).length;
    const rows: [string, number, number | null][] = [
        ['Kalan test maddesi (onaylanmamış)', r.remaining, r.remainingBefore],
        ['Test kuyruğu (testte + test bekleyen)', r.queue, r.queueBefore],
        ['Açık hata', r.openBugs.length, r.openBugsBefore],
        ['Kritik açık hata (engelleyici + yüksek)', crit, r.criticalBefore],
        ['Toplam onaylanan (kümülatif)', r.approvedTotal, r.approvedTotalBefore],
    ];
    return table(['Gösterge', 'Geçen hafta', 'Bu hafta', 'Değişim'], rows.map(([l, v, b]) => [l, b === null ? '—' : n(b), n(v), diff(v, b)]), [1, 2, 3]);
};

const highlights = (r: TestWeekReport, max = 6): string[] => {
    const crit = critical(r);
    const waiting = col(r, 'waiting');
    return [
        ...(r.approved.length ? [`**${n(r.approved.length)} madde** test edilerek onaylandı${r.closers[0] ? `; en çok kapatan **${r.closers[0].name}** (${n(r.closers[0].n)})` : ''}.`] : ['Bu hafta onaylanan madde yok.']),
        ...(r.bugReporters[0] && r.bugReporters[0].name !== 'Bilinmiyor' ? [`**${n(r.newBugs.length)} bug kaydı** açıldı; en çok açan **${r.bugReporters[0].name}** (${n(r.bugReporters[0].n)}${r.bugReporters[0].critical ? `, ${n(r.bugReporters[0].critical)} kritik` : ''}).`] : []),
        ...(r.remainingBefore !== null ? [`Kalan test maddesi **${fromTo(r.remaining, r.remainingBefore)}** (${diff(r.remaining, r.remainingBefore)}).`] : []),
        ...(crit.length ? [`**${n(crit.length)} kritik hata açık**: ${crit.slice(0, 4).map(b => `${b.key} (${PRIO_TR[b.priority]})`).join(', ')}${crit.length > 4 ? ` ve ${n(crit.length - 4)} kayıt daha` : ''}.`] : []),
        ...(r.reopened.length ? [`**${n(r.reopened.length)} kayıt yeniden açıldı** (${r.reopened.slice(0, 4).map(i => i.key).join(', ')}); düzeltme kalitesi izlenmeli.`] : []),
        ...(waiting && waiting.before !== null && waiting.now > waiting.before ? [`Test bekleyen kuyruk büyüdü (${n(waiting.before)} → ${n(waiting.now)}); test kapasitesi gözden geçirilmeli.`] : []),
        ...(r.newBugs.length > r.approved.length && r.newBugs.length ? [`Yeni hata girişi (${n(r.newBugs.length)}) onaylanan madde sayısının (${n(r.approved.length)}) üstünde.`] : []),
        ...(r.newChanges.length ? [`**${n(r.newChanges.length)} değişiklik talebi** kapsam ve takvim etkisi açısından değerlendirilmeli.`] : []),
    ].slice(0, max);
};

const notes = (r: TestWeekReport, detailed: boolean): string[] => [
    ...(!r.hasPrevious ? ['Önceki haftanın görüntüsü bulunmadığından dönem son 7 gün olarak alındı; geçen haftayla karşılaştırma yapılamadı.'] : []),
    ...(detailed ? ['Yeni açılan kayıt sayıları Jira açılış tarihine göredir; panodaki "Açılan hatalar" kolonu ise o an çözülmemiş test hatalarının toplamıdır.'] : []),
    ...(!r.testerRoleDefined && r.newBugs.length ? ['Test ekibi projede tanımlı olmadığından (Proje ayarları › Roller › Test) hataların test ekibince açılıp açılmadığı ayrıştırılamadı.'] : []),
    ...(r.reporterMissing && r.reporterMissing === r.newBugs.length && r.newBugs.length ? ['Jira\'dan kaydı açan bilgisi gelmedi; sunucu güncellendikten sonra "Jira\'dan yenile" yapılmalı.'] : []),
    ...(detailed && r.approved.length && r.closersFromHistory < r.approved.length ? [`Kapatan kişi ${r.closersFromHistory ? `${n(r.approved.length - r.closersFromHistory)} kayıtta` : ''} Jira geçmişinden okunamadığı için kaydın atananı esas alındı.`.replace('  ', ' ')] : []),
    ...(detailed && r.unmatched ? [`${n(r.unmatched)} kayıt hiçbir kolon kuralına uymadı; pano kuralları gözden geçirilmeli.`] : []),
];

// ---------------------------------------------------------------- yönetici özeti

/** Haftanın kişileri (yönetici özeti): en çok test maddesi kapatan ve en çok bug kaydı açan ilk üç kişi */
const peopleBrief = (r: TestWeekReport): ReportBlock[] => {
    const top = <T extends { name: string; n: number }>(list: T[]) => list.filter(x => x.name !== 'Bilinmiyor').slice(0, 3);
    const closers = top(r.closers), reporters = top(r.bugReporters);
    if (!closers.length && !reporters.length) return [];
    const rows = Array.from({ length: Math.max(closers.length, reporters.length) }, (_, i) => [
        closers[i] ? `${closers[i].name} (${n(closers[i].n)})` : '',
        reporters[i] ? `${reporters[i].name} (${n(reporters[i].n)}${reporters[i].critical ? `, ${n(reporters[i].critical)} kritik` : ''})` : '',
    ]);
    return [{ kind: 'h', text: 'Haftanın kişileri' }, { kind: 'table', table: table(['En çok test maddesi kapatan', 'En çok bug kaydı açan'], rows) }];
};

const executive = (c: Ctx): ReportBlock[] => {
    const { r } = c;
    const crit = critical(r);
    return [
        ...header(c, 'Test Durumu — Yönetici Özeti'),
        statusBlock(r),
        { kind: 'h', text: 'Haftalık değişim' },
        { kind: 'table', table: movementTable(r) },
        { kind: 'p', text: `${openedLine(r)} Aynı dönemde **${n(r.approved.length)} madde** test edilip onaylandı${r.reopened.length ? `, **${n(r.reopened.length)} kayıt** yeniden açıldı` : ''}.` },
        { kind: 'h', text: 'Öne çıkanlar' },
        { kind: 'list', items: highlights(r, 6) },
        ...peopleBrief(r),
        ...(crit.length ? [
            { kind: 'h', text: 'Kritik açık hatalar' } as ReportBlock,
            { kind: 'table', table: table(['Kayıt', 'Başlık', 'Öncelik', 'Atanan'], crit.slice(0, 8).map(b => [b.key, b.name, PRIO_TR[b.priority], b.assignee || '—'])) } as ReportBlock,
            ...(crit.length > 8 ? [{ kind: 'p', text: `… ve ${n(crit.length - 8)} kritik hata daha (detaylı raporda).` } as ReportBlock] : []),
        ] : []),
        ...(notes(r, false).length ? [{ kind: 'note', items: notes(r, false) } as ReportBlock] : []),
    ];
};

// ---------------------------------------------------------------- detaylı rapor

const typeTr = (t: string) => ({ bug: 'Hata', change: 'Değişiklik talebi', story: 'Hikâye', feature: 'Yeni özellik', improvement: 'İyileştirme', task: 'Görev', subtask: 'Alt görev', test: 'Test', epic: 'Epic' } as Record<string, string>)[kindOfJiraType(t) || ''] || t || '—';
const rank = (p: string) => ({ Blocker: 0, High: 1, Medium: 2, Low: 3 } as Record<string, number>)[mapJiraPriority(p)] ?? 3;

const detailed = (c: Ctx): ReportBlock[] => {
    const { r } = c;
    const crit = critical(r);
    const testing = col(r, 'testing'), waiting = col(r, 'waiting');
    const section = (title: string, t: ReportTable, empty: string): ReportBlock[] => [{ kind: 'h', text: title }, t.rows.length ? { kind: 'table', table: t } : { kind: 'p', text: empty }];
    return [
        ...header(c, 'Test Durum Raporu (Detaylı)'),
        statusBlock(r),
        { kind: 'h', text: '1. Özet' },
        { kind: 'p', text: `${c.w}. haftada (${c.period}) **${n(r.approved.length)} madde** test edilerek onaylandı. ${openedLine(r)}${r.testerRoleDefined && r.newBugs.length ? ` Açılan hataların **${n(r.bugsFromTesters)}** tanesi test ekibince bildirildi.` : ''}${r.reopened.length ? ` **${n(r.reopened.length)} kayıt** düzeltme sonrası yeniden açıldı.` : ''} Dönem sonunda kalan test maddesi **${n(r.remaining)}**, test kuyruğu **${n(r.queue)}**, açık hata **${n(r.openBugs.length)}**${crit.length ? ` (${n(crit.length)} kritik)` : ''}.` },
        { kind: 'h', text: '2. Haftalık değişim' },
        { kind: 'table', table: movementTable(r) },
        { kind: 'table', table: table(['Bu hafta', 'Adet'], [
            ['Test edilip onaylanan', n(r.approved.length)],
            ['Yeni açılan hata', n(r.newBugs.length)],
            ...r.bugsByPriority.filter(p => p.n).map(p => [`  — ${PRIO_TR[p.priority].toLocaleLowerCase('tr-TR')}`, n(p.n)]),
            ['Yeni değişiklik talebi', n(r.newChanges.length)],
            ['Yeniden açılan', n(r.reopened.length)],
        ], [1]) },
        { kind: 'h', text: '3. Öne çıkanlar ve riskler' },
        { kind: 'list', items: highlights(r, 8) },
        { kind: 'h', text: '4. Kişiler' },
        ...(r.closers.length ? [{ kind: 'table', table: table(['En çok test maddesi kapatan', 'Kapatılan'], r.closers.slice(0, 8).map(x => [x.name, n(x.n)]), [1]) } as ReportBlock] : [{ kind: 'p', text: 'Bu hafta kapatılan madde yok.' } as ReportBlock]),
        ...(r.bugReporters.length ? [{ kind: 'table', table: table(['En çok bug kaydı açan', 'Açılan bug', 'Kritik'], r.bugReporters.slice(0, 8).map(x => [x.name, n(x.n), n(x.critical)]), [1, 2]) } as ReportBlock] : [{ kind: 'p', text: 'Bu hafta hata açılmadı.' } as ReportBlock]),
        ...(r.openByAssignee.length ? [{ kind: 'table', table: table(['Açık hataların sahibi (atanan)', 'Açık hata', 'Kritik'], r.openByAssignee.slice(0, 8).map(x => [x.name, n(x.n), n(x.critical)]), [1, 2]) } as ReportBlock] : []),
        ...section('5. Açık kritik hatalar', table(['Kayıt', 'Başlık', 'Öncelik', 'Durum', 'Atanan'], crit.map(b => [b.key, b.name, PRIO_TR[b.priority], b.status, b.assignee || '—'])), 'Açık engelleyici ya da yüksek öncelikli hata yok.'),
        ...section('6. Bu hafta test edilip onaylananlar', table(['Kayıt', 'Başlık', 'Tür', 'Atanan'], r.approved.map(a => [a.k, a.n, typeTr(a.t), a.a || '—'])), 'Bu hafta onaylanan madde yok.'),
        ...section('7. Bu hafta açılan hatalar', table(['Kayıt', 'Başlık', 'Öncelik', 'Durum', 'Açan', 'Atanan'], [...r.newBugs].sort((a, b) => rank(a.priority) - rank(b.priority)).map(b => [b.key, b.summary, PRIO_TR[mapJiraPriority(b.priority)], b.status, b.reporter || '—', b.assignee || '—'])), 'Bu hafta yeni hata açılmadı.'),
        ...section('8. Değişiklik talepleri', table(['Kayıt', 'Başlık', 'Durum', 'Açan'], r.newChanges.map(x => [x.key, x.summary, x.status, x.reporter || '—'])), 'Bu hafta değişiklik talebi gelmedi.'),
        ...section('9. Yeniden açılan kayıtlar', table(['Kayıt', 'Başlık', 'Durum', 'Atanan'], r.reopened.map(x => [x.key, x.summary, x.status, x.assignee || '—'])), 'Bu hafta yeniden açılan kayıt yok.'),
        ...(testing || waiting ? section('10. Test kuyruğu', table(['Kayıt', 'Başlık', 'Aşama', 'Bekleme (gün)', 'Atanan'], [
            ...r.waiting.map(x => [x.key, x.name, waiting?.name || 'Test bekliyor', x.days === null ? '—' : n(x.days), x.assignee || '—']),
            ...r.testing.map(x => [x.key, x.name, testing?.name || 'Testte', x.days === null ? '—' : n(x.days), x.assignee || '—']),
        ], [3]), 'Test kuyruğunda kayıt yok.') : []),
        { kind: 'h', text: `${testing || waiting ? 11 : 10}. Pano dağılımı` },
        { kind: 'table', table: table(['Kolon', 'Geçen hafta', 'Bu hafta', 'Değişim'], [
            ...r.columns.map(x => [x.name, x.before === null ? '—' : n(x.before), n(x.now), diff(x.now, x.before)]),
            ...(r.unmatched ? [['Eşleşmeyen (kural dışı)', '—', n(r.unmatched), '—']] : []),
        ], [1, 2, 3]) },
        ...(notes(r, true).length ? [{ kind: 'note', items: notes(r, true) } as ReportBlock] : []),
    ];
};

export const buildTestReport = (r: TestWeekReport, meta: Ctx['meta'], kind: ReportKind = 'detailed'): TestReportDoc => {
    const c: Ctx = { r, w: weekNumber(r.week), period: `${day(r.from)} – ${day(r.to, true)}`, meta };
    const blocks = kind === 'executive' ? executive(c) : detailed(c);
    const t = blocks[0] as Extract<ReportBlock, { kind: 'title' }>;
    return { kind, title: t.text, subtitle: t.sub, blocks };
};

// ---------------------------------------------------------------- Markdown (Teams, wiki)

const mdCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim() || ' ';
const mdTable = (t: ReportTable): string[] => [
    `| ${t.columns.map(mdCell).join(' | ')} |`,
    `| ${t.columns.map((_, i) => (t.numeric?.includes(i) ? '---:' : '---')).join(' | ')} |`,
    ...t.rows.map(r => `| ${r.map(mdCell).join(' | ')} |`),
    ...(t.more ? ['', `_… ve ${n(t.more)} kayıt daha_`] : []),
];

export const reportMarkdown = (d: TestReportDoc): string => {
    const out: string[] = [];
    for (const b of d.blocks) {
        if (b.kind === 'title') out.push(`## ${b.text}`, `**${b.sub}**`, '');
        else if (b.kind === 'meta') out.push(b.items.map(([k, v]) => `${k}: ${v}`).join('  \n'), '');
        else if (b.kind === 'status') out.push(`> ${HEALTH_ICON[b.level]} **Genel durum: ${b.level}** — ${b.text}`, '');
        else if (b.kind === 'h') out.push(`### ${b.text}`, '');
        else if (b.kind === 'p') out.push(b.text, '');
        else if (b.kind === 'list') out.push(...b.items.map(x => `- ${x}`), '');
        else if (b.kind === 'table') out.push(...mdTable(b.table), '');
        else if (b.kind === 'note') out.push('---', '**Notlar**', '', ...b.items.map(x => `- _${x}_`), '');
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
};

// ---------------------------------------------------------------- biçimli (HTML, satır içi stil: e-posta istemcileri)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Kaçış sonrası **kalın** */
const rich = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const HEALTH_STYLE: Record<TestHealth, string> = {
    Riskli: 'background:#fde8e8;color:#9b1c1c;border:1px solid #f8b4b4',
    Dikkat: 'background:#fdf6b2;color:#723b13;border:1px solid #fce96a',
    Yolunda: 'background:#def7ec;color:#03543f;border:1px solid #84e1bc',
};
const FONT = 'font-family:Segoe UI,Calibri,Arial,sans-serif;color:#1f2937';
const TH = 'text-align:left;padding:6px 10px;background:#f3f4f6;border-bottom:1px solid #d1d5db;font-size:12px;font-weight:600;color:#374151';
const TD = 'padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top';

const htmlTable = (t: ReportTable): string => {
    const num = (i: number) => !!t.numeric?.includes(i);
    const wrap = (i: number) => i === 1 && t.columns.length > 3;
    return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:6px 0 10px">`
        + `<tr>${t.columns.map((c, i) => `<th style="${TH}${num(i) ? ';text-align:right' : ''}">${esc(c)}</th>`).join('')}</tr>`
        // Başlık sütunu kırılır; kısa sütunlar (kayıt, öncelik, durum, kişi, sayı) tek satır kalır
        + t.rows.map(r => `<tr>${r.map((c, i) => `<td style="${TD}${num(i) ? ';text-align:right' : ''}${wrap(i) ? '' : ';white-space:nowrap'}${i === 0 && !c.startsWith(' ') ? ';font-weight:600' : ''}">${rich(c)}</td>`).join('')}</tr>`).join('')
        + `</table>${t.more ? `<div style="font-size:12px;color:#6b7280">… ve ${n(t.more)} kayıt daha</div>` : ''}`;
};

export const reportHtml = (d: TestReportDoc): string => {
    const parts: string[] = [`<div style="${FONT};max-width:900px;line-height:1.5">`];
    for (const b of d.blocks) {
        if (b.kind === 'title') parts.push(`<h1 style="font-size:21px;margin:0;color:#111827">${esc(b.text)}</h1><div style="font-size:15px;color:#4b5563;margin:2px 0 10px">${esc(b.sub)}</div>`);
        else if (b.kind === 'meta') parts.push(`<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:12px">${b.items.map(([k, v]) => `<tr><td style="padding:1px 12px 1px 0;font-size:12.5px;color:#6b7280">${esc(k)}</td><td style="padding:1px 0;font-size:12.5px">${esc(v)}</td></tr>`).join('')}</table>`);
        else if (b.kind === 'status') parts.push(`<div style="${HEALTH_STYLE[b.level]};padding:10px 14px;border-radius:6px;font-size:14px;margin-bottom:4px"><b>${HEALTH_ICON[b.level]} Genel durum: ${esc(b.level)}</b> — ${esc(b.text)}</div>`);
        else if (b.kind === 'h') parts.push(`<h2 style="font-size:15px;margin:20px 0 6px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:4px">${esc(b.text)}</h2>`);
        else if (b.kind === 'p') parts.push(`<p style="margin:6px 0;font-size:14px">${rich(b.text)}</p>`);
        else if (b.kind === 'list') parts.push(`<ul style="margin:4px 0 0 18px;padding:0;font-size:13.5px">${b.items.map(x => `<li style="margin:3px 0">${rich(x)}</li>`).join('')}</ul>`);
        else if (b.kind === 'table') parts.push(htmlTable(b.table));
        else if (b.kind === 'note') parts.push(`<div style="margin-top:18px;border-top:1px solid #e5e7eb;padding-top:8px"><div style="font-size:12.5px;font-weight:600;color:#4b5563">Notlar</div><ul style="margin:4px 0 0 18px;padding:0;font-size:12.5px;color:#4b5563">${b.items.map(x => `<li style="margin:2px 0">${rich(x)}</li>`).join('')}</ul></div>`);
    }
    parts.push('</div>');
    return parts.join('');
};
