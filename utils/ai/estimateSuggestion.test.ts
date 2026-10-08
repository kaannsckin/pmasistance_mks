import { describe, expect, it } from 'vitest';
import { EstimateLogEntry, Task, TaskStatus } from '../../types';
import { appendEstimateLog, estimateLogCsv, estimateStats } from '../planning/estimateLog';
import { buildHistory } from '../planning/history';
import { estimateFromHistory } from '../planning/referenceClass';
import { createProject } from '../workspace';
import { contextIds, ESTIMATE_PROMPT_VERSION, estimateSuggestionPrompt, finalizeEstimateSuggestion, parseEstimateSuggestion } from './estimateSuggestion';

const closed = (id: string, name: string, days: number, extra: Partial<Task> = {}): Task => {
    const start = new Date('2026-06-01T09:00:00'); // Pazartesi
    const end = new Date(start);
    let left = days - 1;
    while (left > 0) { end.setDate(end.getDate() + 1); if (end.getDay() % 6 !== 0) left--; }
    return {
        id, name, availability: true, priority: 'High', version: 1, predecessor: null, unit: 'Yazılım', resourceName: '', time: { best: 1, avg: 2, worst: 3 },
        jiraId: '', notes: '', status: TaskStatus.Done, issueType: 'bug', createdAt: start.toISOString(), startedAt: start.toISOString(), resolvedAt: end.toISOString(), ...extra,
    };
};

const history = (visibleOther = true) => {
    const mine = createProject('Benim', { tasks: Array.from({ length: 6 }, (_, i) => closed(`m${i}`, `Giriş ekranında oturum hatası ${i}`, 2 + (i % 3))) });
    mine.id = 'mine';
    const other = createProject('Başka', { tasks: [closed('x1', 'Giriş ekranında oturum hatası gizli', 3)] });
    other.id = 'other';
    const h = buildHistory([mine, other]);
    const ref = estimateFromHistory({ name: 'Oturum açma ekranı hatası', issueType: 'bug', unit: 'Yazılım', projectId: 'mine' }, h, { visibleProjectIds: new Set(visibleOther ? ['mine', 'other'] : ['mine']) });
    return { h, ref };
};

describe('AI kayıt tahmini istemi', () => {
    it('bağlam gerçek efor ve kapanma süreleriyle kurulur; görünmeyen projelerin kayıtları AI\'ya gitmez', () => {
        const { ref } = history(false);
        const prompt = estimateSuggestionPrompt({ name: 'Oturum açma ekranı hatası', notes: 'Zaman aşımında hata veriyor' }, ref);
        expect(prompt).toContain('[R1]');
        expect(prompt).toMatch(/gerçek efor \d/);
        expect(prompt).toContain('Önem dağılımı: Yüksek %100');
        expect(prompt).not.toContain('gizli');
        expect(ref.context.every(m => m.record.projectId === 'mine')).toBe(true);
    });

    it('geçmiş yoksa model düşük güvene yönlendirilir', () => {
        const ref = estimateFromHistory({ name: 'Yeni iş' }, buildHistory([]));
        expect(estimateSuggestionPrompt({ name: 'Yeni iş' }, ref)).toContain('Geçmiş kapanmış kayıt yok');
    });
});

describe('AI yanıtı doğrulama ve hibrit güven', () => {
    it('Türkçe/İngilizce değerleri eşler, aralığı sıralar ve yarım güne yuvarlar', () => {
        const p = parseEstimateSuggestion('```json\n{"tur":"Hata","onem":"yüksek","efor":{"iyimser":"3","olasi":"1,2","kotumser":5},"dayanak":["R1","r2"],"eksik_bilgi":["a","b","c","d"],"guven":"Yüksek"}\n```');
        expect(p).toMatchObject({ issueType: 'bug', priority: 'High', effort: { best: 1, likely: 3, worst: 5 }, evidenceIds: ['R1', 'R2'], selfConfidence: 'high' });
        expect(p.questions).toHaveLength(3);
        expect(() => parseEstimateSuggestion('{"efor":{"olasi":0}}')).toThrow();
        expect(() => parseEstimateSuggestion('bilmiyorum')).toThrow();
    });

    it('dayanaklar bağlamdaki kayıtlara çevrilir; bağlamda olmayan numara güveni düşürür', () => {
        const { ref } = history();
        const ids = contextIds(ref);
        const ok = finalizeEstimateSuggestion({ ...parseEstimateSuggestion(`{"onem":"High","efor":{"iyimser":${ref.effort!.best},"olasi":${ref.effort!.likely},"kotumser":${ref.effort!.worst}},"dayanak":["R1","R2"],"guven":"yuksek"}`) }, ref);
        expect(ok.evidence).toEqual([ids.get('R1'), ids.get('R2')]);
        expect(ok.flags).toEqual([]);
        expect(ok.confidence).toBe(ref.confidence === 'high' ? 'high' : ref.confidence);
        const bad = finalizeEstimateSuggestion(parseEstimateSuggestion('{"onem":"High","efor":{"iyimser":1,"olasi":2,"kotumser":3},"dayanak":["R99"],"guven":"yuksek"}'), ref);
        expect(bad.flags).toContain('unknown_evidence');
        expect(bad.flags).toContain('no_evidence');
        expect(bad.confidence).toBe('low');
    });

    it('geçmişin çok dışındaki efor ve güçlü çoğunluğa aykırı önem işaretlenir', () => {
        const { ref } = history();
        const r = finalizeEstimateSuggestion(parseEstimateSuggestion('{"onem":"Low","efor":{"iyimser":20,"olasi":30,"kotumser":40},"dayanak":["R1"],"guven":"yuksek"}'), ref);
        expect(r.flags).toEqual(expect.arrayContaining(['outside_history', 'priority_conflict']));
        expect(r.confidence).toBe('low');
        const none = finalizeEstimateSuggestion(parseEstimateSuggestion('{"efor":{"olasi":2}}'), estimateFromHistory({ name: 'x' }, buildHistory([])));
        expect(none.flags).toEqual(['no_history']);
        expect(none.confidence).toBe('low');
    });
});

describe('öneri günlüğü ve isabet', () => {
    const entry = (taskId: string, extra: Partial<EstimateLogEntry> = {}): EstimateLogEntry => ({
        id: `e-${taskId}`, at: '2026-06-01T08:00:00Z', projectId: 'p', taskId,
        draft: { name: taskId, issueType: 'bug', hasNotes: false },
        reference: { method: 'similar', n: 8, confidence: 'medium', p50Days: 2, p80Days: 3, effort: { best: 1, likely: 2, worst: 3 } },
        ai: { promptVersion: ESTIMATE_PROMPT_VERSION, priority: 'High', effort: { best: 2, likely: 3, worst: 4 }, confidence: 'medium', flags: [], evidence: [], questions: 0 },
        blind: { effortDays: 5 },
        final: { source: 'ai', priority: 'High', effort: { best: 2, likely: 3, worst: 4 }, version: 1 },
        ...extra,
    });

    it('günlük en yeni sonda tutulur ve sınırlanır', () => {
        let log: EstimateLogEntry[] | undefined;
        for (let i = 0; i < 5; i++) log = appendEstimateLog(log, entry(`t${i}`), 3);
        expect(log!.map(e => e.taskId)).toEqual(['t2', 't3', 't4']);
    });

    it('kapanan kayıtlar gerçekleşenle eşlenir: kaynak bazında hata, kapsama ve kabul oranı', () => {
        // Her kayıt 3 iş gününde kapandı → efor eşdeğeri 3 gün (tek kişi, eşzamanlılık yok)
        const tasks = ['a', 'b'].map(id => closed(id, `Kayıt ${id}`, 3, { resourceName: '' }));
        const h = buildHistory([createProject('P', { tasks })]);
        const ws = { estimateLog: [entry('a'), entry('b', { final: { source: 'reference', priority: 'Medium', effort: { best: 1, likely: 2, worst: 3 }, version: 1 } }), entry('acik')] };
        const s = estimateStats(ws, h);
        expect(s).toMatchObject({ entries: 3, sent: 3, closed: 2, aiShown: 3 });
        expect(s.ai).toMatchObject({ n: 2, mae: 0, coverage: 1 });
        expect(s.reference).toMatchObject({ n: 2, mae: 1, coverage: 1, p80Coverage: 1 });
        expect(s.blind).toMatchObject({ n: 2, mae: 2, coverage: 0 });
        expect(s.aiVsBlind).toEqual({ n: 2, aiMae: 0, blindMae: 2 });
        expect(s.aiAccept).toEqual({ effort: 0.67, priority: 0.67, type: null }); // 'a' ve 'acik' AI eforunu kullandı, 'b' kullanmadı
        expect(s.advice[0]).toMatch(/en az 10/);
        const csv = estimateLogCsv({ ...ws, projects: [{ id: 'p', name: 'P' }] }, h);
        expect(csv.split('\n')).toHaveLength(4);
        expect(csv).toContain('evet');
    });
});

describe('AI yanıtının çözümlenmesi: eksik alanlar ve dayanak yazımları', () => {
    it('eksik uç olası değere eşit sayılır; aralık kaymaz', () => {
        expect(parseEstimateSuggestion('{"efor":{"olasi":3}}').effort).toEqual({ best: 3, likely: 3, worst: 3 });
        expect(parseEstimateSuggestion('{"efor":{"iyimser":2,"olasi":3}}').effort).toEqual({ best: 2, likely: 3, worst: 3 });
        expect(parseEstimateSuggestion('{"efor":{"min":1,"olasi":3,"max":6}}').effort).toEqual({ best: 1, likely: 3, worst: 6 });
        expect(() => parseEstimateSuggestion('{"efor":{"iyimser":1,"kotumser":4}}')).toThrow(/efor/);
        expect(() => parseEstimateSuggestion('{"efor":{"iyimser":"az","olasi":3}}')).toThrow(/efor/);
    });

    it('dayanak: virgüllü, sayı ya da "ve" ile yazılmış kimlikler', () => {
        expect(parseEstimateSuggestion('{"efor":{"olasi":2},"dayanak":"R1, R3"}').evidenceIds).toEqual(['R1', 'R3']);
        expect(parseEstimateSuggestion('{"efor":{"olasi":2},"dayanak":[1,3]}').evidenceIds).toEqual(['R1', 'R3']);
        expect(parseEstimateSuggestion('{"efor":{"olasi":2},"dayanak":["R1 ve R2","r2"]}').evidenceIds).toEqual(['R1', 'R2']);
    });

    it('JSON önünde ve arkasında metin olsa da nesne okunur', () => {
        expect(parseEstimateSuggestion('İşte önerim:\n{"efor":{"iyimser":1,"olasi":2,"kotumser":4},"dayanak":["R1"]}\nUmarım faydalı olur.')).toMatchObject({ effort: { likely: 2 }, evidenceIds: ['R1'] });
    });
});

