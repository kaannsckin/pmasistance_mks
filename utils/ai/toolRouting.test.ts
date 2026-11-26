import { describe, expect, it } from 'vitest';
import { createEmptyWorkspace } from '../workspace';
import { EVAL_SET, EvalCase } from './evalSet';
import { AI_LIMITS } from './protocol';
import { buildToolContext, ToolContext } from './scope';
import { matchSkills } from './skills';
import { ALL_GROUPS, groupsOfTool, routeToolGroups, ToolGroup } from './toolRouting';
import { AI_TOOLS, executeTool, toolSpecsFor } from './tools';
import { createMemoryStore } from './memory';
import { UserRole } from '../../types';

const NOW = new Date('2026-11-20T09:00:00Z');

/** Tüm çalışma zamanları bağlı (tarayıcı sohbeti + Jira): en geniş araç kümesi */
const fullCtx = (role: UserRole = 'py'): ToolContext => {
    const ctx = buildToolContext({ ...createEmptyWorkspace(), currentRole: role, currentPersonId: 'p1' }, NOW);
    ctx.files = [];
    ctx.memory = { store: createMemoryStore('test-mem'), userPrompt: '' };
    ctx.rag = { search: async () => [], mode: () => 'bm25' };
    ctx.ui = { run: () => ({ ok: true, message: '' }) };
    ctx.jira = {} as ToolContext['jira'];
    return ctx;
};

const routed = (c: EvalCase, role: UserRole = 'py') => {
    const ctx = fullCtx(role);
    ctx.toolGroups = routeToolGroups({ text: c.soru, view: c.view, hasAttachments: c.ek, skills: matchSkills(c.soru).map(s => s.id) });
    return { ctx, names: toolSpecsFor(ctx).map(s => s.name) };
};

describe('araç grupları', () => {
    it('her araç en az bir gruba ait (gruba konmayan araç her istekte gider)', () => {
        const orphans = AI_TOOLS.map(t => t.spec.name).filter(n => groupsOfTool(n).length === 0);
        expect(orphans).toEqual([]);
    });

    it('tüm gruplar açılsa bile hiçbir rol sunucu araç sınırını aşmaz', () => {
        for (const role of ['py', 'bolum_sorumlu', 'pyb_destek', 'pyb_sorumlu', 'mudur', 'admin'] as UserRole[]) {
            const ctx = fullCtx(role);
            ctx.toolGroups = new Set(ALL_GROUPS);
            expect(toolSpecsFor(ctx).length, role).toBeLessThanOrEqual(AI_LIMITS.maxTools);
        }
    });

    it('arac_ac turun ortasında grup açar; rol kapsamı korunur', async () => {
        const ctx = fullCtx('py');
        ctx.toolGroups = routeToolGroups({ text: 'merhaba' });
        expect(toolSpecsFor(ctx).map(s => s.name)).not.toContain('evm_analizi');
        const r = JSON.parse((await executeTool({ name: 'arac_ac', arguments: { gruplar: ['maliyet'] } }, ctx)).content);
        expect(r.araclar).toEqual(expect.arrayContaining(['evm_analizi', 'maliyet_raporu']));
        expect(toolSpecsFor(ctx).map(s => s.name)).toContain('evm_analizi');
        const mgr = fullCtx('mudur');
        mgr.toolGroups = new Set<ToolGroup>(['temel']);
        const m = JSON.parse((await executeTool({ name: 'arac_ac', arguments: { gruplar: ['gorev_degisiklik'] } }, mgr)).content);
        expect(m.araclar).toEqual([]);
        // MCP gibi yönlendirmesiz ortamda araç sunulmaz, tüm araçlar açıktır
        const plain = buildToolContext({ ...createEmptyWorkspace(), currentRole: 'py', currentPersonId: 'p1' }, NOW);
        expect(toolSpecsFor(plain).map(s => s.name)).not.toContain('arac_ac');
    });

    it('takip sorusu önceki turun alanında kalır; ekli dosya analiz araçlarını açar', () => {
        const g = routeToolGroups({ text: 'peki ya Mehmet?', previousTools: ['doluluk_analizi'] });
        expect([...g]).toEqual(expect.arrayContaining(['temel', 'ekip']));
        expect(routeToolGroups({ text: 'özetle', hasAttachments: true }).has('dosya')).toBe(true);
        expect([...routeToolGroups({ text: 'merhaba' })].sort()).toEqual(['bilgi', 'temel']);
    });
});

describe('ölçüm seti', () => {
    it('yönlendirme gereken araçları kaçırmaz ve isteği küçültür', () => {
        const full = toolSpecsFor(fullCtx('py'));
        // Rolün hiç alamadığı araç (ör. PY'de denetim/veri sağlığı) yönlendirme kaçağı sayılmaz
        const allowed = new Set(full.map(s => s.name));
        const fullChars = JSON.stringify(full).length;
        const misses: string[] = [];
        let tools = 0;
        let chars = 0;
        for (const c of EVAL_SET) {
            const { ctx, names } = routed(c);
            for (const need of c.gerekli.filter(x => allowed.has(x))) if (!names.includes(need)) misses.push(`${c.id}: ${need}`);
            tools += names.length;
            chars += JSON.stringify(toolSpecsFor(ctx)).length;
        }
        const n = EVAL_SET.length;
        const needed = EVAL_SET.reduce((s, c) => s + c.gerekli.filter(x => allowed.has(x)).length, 0);
        const recall = 1 - misses.length / needed;
        console.log(`yönlendirme: ${n} soru, kapsama %${Math.round(recall * 100)}, ortalama ${(tools / n).toFixed(1)} / ${full.length} araç, ${Math.round(chars / n)} / ${fullChars} karakter`);
        if (misses.length) console.log(`kaçanlar (model arac_ac ile açar): ${misses.join('; ')}`);
        expect(recall).toBeGreaterThanOrEqual(0.95);
        expect(tools / n).toBeLessThan(full.length * 0.6);
    });

    it('ağır yönerge (yetenek) yalnız gerektiğinde açılır', () => {
        const wrong: string[] = [];
        const cases = EVAL_SET.filter(c => c.yetenek !== undefined);
        for (const c of cases) {
            const got = matchSkills(c.soru).map(s => s.id);
            const ok = c.yetenek === null ? got.length === 0 : got.includes(c.yetenek!);
            if (!ok) wrong.push(`${c.id}: beklenen ${c.yetenek ?? 'yok'}, gelen ${got.join('+') || 'yok'}`);
        }
        console.log(`yetenek eşleşmesi: ${cases.length - wrong.length}/${cases.length}${wrong.length ? ` — ${wrong.join('; ')}` : ''}`);
        expect(wrong).toEqual([]);
    });
});
