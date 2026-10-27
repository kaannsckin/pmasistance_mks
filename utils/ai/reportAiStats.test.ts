import { describe, expect, it } from 'vitest';
import { ReportAiLogEntry, ReportItem, WeeklyReport, WorkspaceData } from '../../types';
import { createReport, newItem } from '../weeklyReport';
import { createEmptyWorkspace, createProject } from '../workspace';
import { appendReportAiLog, MAX_REPORT_AI_LOG, normText, reportAcceptance, reportAiStats, submitLogEntry, suggestionLogEntry, tokenF1 } from './reportAiStats';

const NOW = new Date('2026-10-07T10:00:00Z');
const py = { role: 'py' as const, personId: 'pm1', name: 'Ayşe Yılmaz' };

const ai = (text: string, id: string, category: ReportItem['category'] = 'ongoing'): ReportItem =>
    ({ ...newItem(category, text, { source: 'ai', aiOriginal: { text, category } }), id });

const report = (patch: Partial<WeeklyReport> = {}): WeeklyReport => ({
    ...createReport({ kind: 'project', projectId: 'a', departmentCode: 'U310', year: 2026, week: 41 }, py, NOW),
    ...patch,
});

describe('metin karşılaştırma', () => {
    it('normalleştirme Türkçe harf ve boşluktan bağımsız', () => {
        expect(normText('  Sürüm   2 TESLİM edildi ')).toBe(normText('sürüm 2 teslim edildi'));
    });
    it('terim F1: aynı 1, ayrık 0, kısmi arada', () => {
        expect(tokenF1('Pilot kurulum yapıldı', 'Pilot kurulum yapıldı')).toBe(1);
        expect(tokenF1('Fatura kesildi', 'Demo sunuldu')).toBe(0);
        const f = tokenF1('Gebze Belediyesi pilot kurulumu tamamlandı', 'Gebze Belediyesi pilot kurulumu 12 Ekim tarihinde tamamlandı');
        expect(f).toBeGreaterThan(0.6);
        expect(f).toBeLessThan(1);
        expect(tokenF1('', '')).toBe(1);
    });
});

describe('kabul oranı', () => {
    it('eski rapor (AI kaydı yok) için null', () => {
        expect(reportAcceptance(report())).toBeNull();
        expect(reportAcceptance(report({ aiDraft: { generatedAt: '', input: 'x', output: 'y' } }))).toBeNull();
    });

    it('sonuna ekle: aynen kalan, düzenlenen, silinen ve insan eklemesi', () => {
        const a1 = ai('Sürüm 2 Gebze Belediyesine teslim edildi.', 'a1', 'delivery');
        const a2 = { ...ai('Pilot kurulum yapıldı.', 'a2'), text: 'Pilot kurulum 12 Ekim 2026 tarihinde yapıldı.' };
        const human = newItem('invoice', '2. hakediş faturası kesildi (450.000 TL).', { source: 'manual' });
        const r = report({
            thisWeek: [human, a1, a2],
            nextWeek: [],
            aiDraft: { generatedAt: '', input: 'x', output: 'y', mode: 'append', itemIds: ['a1', 'a2', 'a3'] },
        });
        const acc = reportAcceptance(r)!;
        expect(acc).toMatchObject({ aiItems: 3, kept: 1, edited: 1, deleted: 1, humanAdded: 1 });
        expect(acc.similarity).toBeGreaterThan(0.5);
        expect(acc.similarity).toBeLessThan(1);
    });

    it('yerine koy: yalnız son öneri sayılır; büyük-küçük harf düzeltmesi aynen kalmış sayılır', () => {
        const a = { ...ai('pilot kurulum yapıldı.', 'n1'), text: 'Pilot kurulum yapıldı.' };
        const r = report({ thisWeek: [a], nextWeek: [ai('Kabul toplantısı yapılacak.', 'n2', 'plan')], aiDraft: { generatedAt: '', input: 'x', output: 'y', mode: 'replace', itemIds: ['n1', 'n2'] } });
        expect(reportAcceptance(r)).toMatchObject({ aiItems: 2, kept: 2, edited: 0, deleted: 0, humanAdded: 0, similarity: 1 });
    });

    it('özgün hâli olmayan madde insan eklemesi sayılır', () => {
        const r = report({ thisWeek: [{ ...newItem('ongoing', 'Elle'), id: 'x1' }], aiDraft: { generatedAt: '', input: '', output: '', itemIds: ['x1'] } });
        expect(reportAcceptance(r)).toMatchObject({ kept: 0, edited: 0, humanAdded: 1, deleted: 0 });
    });
});

describe('günlük', () => {
    it('en çok 2.000 kayıt tutulur, en yeni sonda', () => {
        let log: ReportAiLogEntry[] = [];
        const e = (i: number): ReportAiLogEntry => ({ at: String(i), reportId: `r${i}`, departmentCode: 'U310', promptVersion: 'v', outcome: 'discarded', nThis: 0, nNext: 0, lintErrors: 0, lintWarnings: 0 });
        for (let i = 0; i < MAX_REPORT_AI_LOG + 5; i++) log = appendReportAiLog(log, e(i));
        expect(log).toHaveLength(MAX_REPORT_AI_LOG);
        expect(log[log.length - 1].reportId).toBe(`r${MAX_REPORT_AI_LOG + 4}`);
        expect(log[0].reportId).toBe('r5');
    });

    it('öneri kaydı metin içermez; lint sayıları öneriden', () => {
        const entry = suggestionLogEntry({
            report: report(), promptVersion: 'rapor-taslak-1', model: 'm', outcome: 'applied_append', at: NOW,
            suggestion: { thisWeek: [newItem('ongoing', 'Bazı çalışmalar yapıldı.')], nextWeek: [], abbreviations: [] },
        });
        expect(entry).toMatchObject({ outcome: 'applied_append', nThis: 1, nNext: 0, model: 'm', projectId: 'a', departmentCode: 'U310' });
        expect(entry.lintWarnings).toBeGreaterThan(0);
        expect(JSON.stringify(entry)).not.toContain('çalışmalar');
    });

    it('gönderim kaydı: AI yoksa null; varsa akıbet ve lint kodları', () => {
        expect(submitLogEntry(report())).toBeNull();
        const r = report({ thisWeek: [ai('KYS geliştirmesine devam edildi.', 'k1')], aiDraft: { generatedAt: '', input: 'x', output: 'y', promptVersion: 'rapor-taslak-1', itemIds: ['k1'] } });
        const e = submitLogEntry(r, [], NOW)!;
        expect(e).toMatchObject({ outcome: 'submitted', aiItems: 1, kept: 1, promptVersion: 'rapor-taslak-1' });
        expect(e.lintCodes?.abbr).toBe(1);
        expect(e.lintErrors).toBeGreaterThan(0);
    });
});

describe('gruplu ölçüler', () => {
    const ws = (): WorkspaceData => {
        const a = createProject('Safir Posta'); a.id = 'a'; a.pmPersonId = 'pm1';
        const b = createProject('Portal'); b.id = 'b'; b.pmPersonId = 'pm2';
        const base = (o: Partial<ReportAiLogEntry>): ReportAiLogEntry => ({ at: '2026-10-07T09:00:00Z', reportId: 'r1', projectId: 'a', departmentCode: 'U310', promptVersion: 'v1', outcome: 'applied_append', nThis: 2, nNext: 1, lintErrors: 0, lintWarnings: 0, ...o });
        const returned = report({ id: 'r2', projectId: 'b', departmentCode: 'U320', aiDraft: { generatedAt: '', input: '', output: '', promptVersion: 'v2', itemIds: ['x'] } });
        returned.history = [...returned.history, { at: '2026-10-08T00:00:00Z', action: 'submit', byRole: 'py' }, { at: '2026-10-08T01:00:00Z', action: 'return', byRole: 'bolum_sorumlu' }];
        const sent = report({ id: 'r1', aiDraft: { generatedAt: '', input: '', output: '', promptVersion: 'v1', itemIds: ['y'] } });
        sent.history = [...sent.history, { at: '2026-10-08T00:00:00Z', action: 'submit', byRole: 'py' }];
        return {
            ...createEmptyWorkspace(),
            projects: [a, b],
            departments: [{ code: 'U310', name: 'Yazılım' }, { code: 'U320', name: 'Altyapı' }],
            people: [
                { id: 'pm1', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U310', availableAA: 1, roles: [] },
                { id: 'pm2', firstName: 'Ali', lastName: 'Veli', departmentCode: 'U320', availableAA: 1, roles: [] },
            ],
            weeklyReports: [sent, returned],
            reportAiLog: [
                base({}),
                base({ outcome: 'discarded', at: '2026-10-07T09:30:00Z' }),
                base({ reportId: 'r2', projectId: 'b', departmentCode: 'U320', promptVersion: 'v2', outcome: 'error' }),
                // İlk gönderim (sonra iade ve ikinci gönderim): yalnız son gönderim sayılır
                base({ outcome: 'submitted', aiItems: 4, kept: 1, edited: 1, deleted: 2, lintErrors: 2, lintWarnings: 2 }),
                base({ outcome: 'submitted', at: '2026-10-08T10:00:00Z', aiItems: 4, kept: 2, edited: 1, deleted: 1, lintErrors: 0, lintWarnings: 1 }),
                base({ at: '2026-09-01T00:00:00Z' }), // süzgeç dışı
            ],
        };
    };

    it('bölüme göre: uygulama/ret/hata, kabul ve iade oranı', () => {
        const rows = reportAiStats(ws(), { by: 'department', from: '2026-10-01' });
        const u310 = rows.find(r => r.key === 'U310')!;
        expect(u310).toMatchObject({ label: 'Yazılım', suggestions: 2, applyRate: 0.5, discardRate: 0.5, errorRate: 0, submitted: 1, aiItems: 4, keptRate: 0.5, editedRate: 0.25, deletedRate: 0.25, returnRate: 0, avgLintErrors: 0, avgLintWarnings: 1 });
        const u320 = rows.find(r => r.key === 'U320')!;
        expect(u320).toMatchObject({ suggestions: 1, errorRate: 1, submitted: 0, keptRate: null, returnRate: 1 });
    });

    it('süzgeçsiz eski kayıt da sayılır; PY, proje ve istem sürümü gruplaması', () => {
        expect(reportAiStats(ws(), { by: 'department' }).find(r => r.key === 'U310')!.suggestions).toBe(3);
        expect(reportAiStats(ws(), { by: 'pm', from: '2026-10-01' }).map(r => r.label).sort()).toEqual(['Ali Veli', 'Ayşe Yılmaz']);
        expect(reportAiStats(ws(), { by: 'project', from: '2026-10-01' }).map(r => r.label).sort()).toEqual(['Portal', 'Safir Posta']);
        const byVer = reportAiStats(ws(), { by: 'promptVersion', from: '2026-10-01' });
        expect(byVer.map(r => r.key).sort()).toEqual(['v1', 'v2']);
        expect(byVer.find(r => r.key === 'v2')!.returnRate).toBe(1);
    });

    it('veri yoksa boş', () => {
        expect(reportAiStats({ ...createEmptyWorkspace() }, { by: 'department' })).toEqual([]);
    });
});
