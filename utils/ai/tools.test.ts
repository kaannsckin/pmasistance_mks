import { describe, expect, it, vi } from 'vitest';
import { Allocation, Person, Task, TaskStatus, UserRole, WorkspaceData } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { TOOL_NAME_PATTERN } from './protocol';
import { buildToolContext, resolveProject, ToolError } from './scope';
import { buildSystemPrompt } from './systemPrompt';
import { AI_TOOLS, executeTool, MAX_TOOL_RESULT_CHARS, toolSpecsFor } from './tools';

const NOW = new Date('2026-07-15T09:00:00Z');

const person = (id: string, first: string, last: string, dept = 'U310', extra: Partial<Person> = {}): Person => ({
    id, firstName: first, lastName: last, departmentCode: dept, availableAA: 1, roles: ['Yazılım Geliştirme Mühendisi'], sicil: `SC${id}99`, titleCode: 'ARŞ', ...extra,
});

const task = (id: string, name: string, extra: Partial<Task> = {}): Task => ({
    id, name, availability: true, priority: 'High', version: 1, predecessor: null, unit: 'U310', resourceName: 'Ayşe Kaya',
    time: { best: 1, avg: 2, worst: 4 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...extra,
});

const buildWs = (role: UserRole = 'py', personId: string | null = 'p1'): WorkspaceData => {
    const altay = createProject('ALTAY Sistemi', { code: 'ALT-01' });
    altay.id = 'altay';
    altay.pmPersonId = 'p1';
    altay.rag = 'amber';
    altay.tasks = [
        task('t1', 'Arayüz tasarımı', { dueDate: '2026-06-01' }), // geciken
        task('t2', 'Test planı', { dueDate: '2026-07-20', resourceName: 'Mehmet Demir' }), // yaklaşan
        task('t3', 'Kurulum', { status: TaskStatus.Done, dueDate: '2026-05-01' }),
    ];
    altay.risks = [{ id: 'r1', title: 'Tedarik gecikmesi', probability: 4, impact: 5, status: 'open', createdAt: '2026-06-01', owner: 'Ayşe Kaya' }];
    altay.notes = [{ id: 'n1', content: 'Müşteri toplantısı: kapsam genişliyor, ek bütçe isteyeceğiz.', createdAt: '2026-07-10T10:00:00Z', weekNumber: 28, year: 2026, tags: ['müşteri'], mentions: [] }];
    altay.customerRequests = [{ id: 'c1', title: 'Rapor ekranı', description: 'Aylık rapor', customerName: 'Kurum A', createdAt: '2026-07-01', status: 'New' }];

    const gizli = createProject('Gizli Proje', { code: 'GZL' });
    gizli.id = 'gizli';
    gizli.pmPersonId = 'p2';
    gizli.tasks = [task('g1', 'Gizli görev')];
    gizli.notes = [{ id: 'n2', content: 'gizli not', createdAt: '2026-07-10T10:00:00Z', weekNumber: 28, year: 2026, tags: [], mentions: [] }];

    return {
        ...createEmptyWorkspace(),
        currentRole: role,
        currentPersonId: personId ?? undefined,
        activeProjectId: 'altay',
        projects: [altay, gizli],
        people: [person('p1', 'Ayşe', 'Kaya'), person('p2', 'Mehmet', 'Demir'), person('p3', 'Zeynep', 'Şahin', 'U320', { roles: ['Test Mühendisi'] })],
        departments: [{ code: 'U310', name: 'Yazılım' }, { code: 'U320', name: 'Test' }],
        titles: [{ code: 'ARŞ', name: 'Araştırmacı', monthlyCost: 100000 }],
        allocations: [
            { id: 'a1', personId: 'p1', projectId: 'altay', year: 2026, plan: { 7: 1.2, 8: 0.5 }, actual: { 6: 0.8 } } as Allocation, // Temmuz aşırı
            { id: 'a2', personId: 'p2', projectId: 'gizli', year: 2026, plan: { 7: 0.5, 8: 0.5 }, actual: { 6: 0.5 } } as Allocation,
        ],
        auditLog: [
            { id: 'au1', at: '2026-07-14T08:00:00Z', actorRole: 'py', actorName: 'Ayşe Kaya', action: 'project.rag', summary: 'ALTAY RAG → Riskli', projectId: 'altay' },
            { id: 'au2', at: '2026-07-14T09:00:00Z', actorRole: 'py', actorName: 'Mehmet Demir', action: 'project.rag', summary: 'Gizli RAG', projectId: 'gizli' },
        ],
    };
};

const run = async (name: string, args: Record<string, unknown>, ws: WorkspaceData = buildWs()) => {
    const out = await executeTool({ name, arguments: args }, buildToolContext(ws, NOW));
    return { ...out, json: JSON.parse(out.content) };
};

describe('araç kataloğu', () => {
    it('tüm araç adları ve şemaları sağlayıcı kurallarına uyar', async () => {
        const names = new Set<string>();
        for (const t of AI_TOOLS) {
            expect(t.spec.name).toMatch(TOOL_NAME_PATTERN);
            expect(names.has(t.spec.name)).toBe(false);
            names.add(t.spec.name);
            expect(t.spec.parameters.type).toBe('object');
            expect(t.spec.description.length).toBeGreaterThan(20);
            expect(t.spec.description.length).toBeLessThanOrEqual(2000);
        }
    });

    it('araç tanımlarının toplam boyutu sınırlı kalır (her istekte gönderilir)', async () => {
        const size = JSON.stringify(AI_TOOLS.map(t => t.spec)).length;
        console.log(`araç tanımları: ${AI_TOOLS.length} adet, ${size} karakter`);
        // 16 000'den 18 000'e: PY'nin risk güncelleme, istek kararı ve not araçları (kısaltılmış tanımlarla
        // ~2 100 karakter). Yönetici rolleri yazma araçlarını almadığı için onların istek boyutu değişmedi.
        expect(size).toBeLessThan(18_000);
    });

    it('her araç parametresiz çalışır (duman testi) ve sicil sızdırmaz', async () => {
        for (const role of ['py', 'mudur', 'bolum_sorumlu', 'pyb_destek'] as UserRole[]) {
            const ws = buildWs(role, role === 'mudur' || role === 'pyb_destek' ? null : 'p1');
            const ctx = buildToolContext(ws, NOW);
            for (const spec of toolSpecsFor(ctx)) {
                const out = await executeTool({ name: spec.name, arguments: {} }, ctx);
                expect(() => JSON.parse(out.content)).not.toThrow();
                expect(out.content.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
                expect(out.content).not.toMatch(/SCp\d99/);
            }
        }
    });
});

describe('rol kapsamı', () => {
    it('PY yalnızca kendi projesini görür; başka projenin içeriği yetki hatası verir', async () => {
        const list = await run('proje_listesi', {});
        expect(list.json.projeler.map((p: any) => p.ad)).toEqual(['ALTAY Sistemi']);
        const denied = await run('proje_detayi', { proje: 'Gizli Proje' });
        expect(denied.ok).toBe(false);
        expect(denied.json.hata).toMatch(/yetki kapsamında değil/);
        expect((await run('gorev_ara', { metin: 'gizli' })).json.eslesen).toBe(0);
    });

    it('yönetici rolleri tüm projeleri görür ama not/istek araçları hiç sunulmaz', async () => {
        const ws = buildWs('mudur', null);
        const ctx = buildToolContext(ws, NOW);
        expect(ctx.scoped.projects).toHaveLength(2);
        expect(ctx.scoped.projects.every(p => p.notes.length === 0 && p.customerRequests.length === 0)).toBe(true);
        const names = toolSpecsFor(ctx).map(t => t.name);
        expect(names).not.toContain('notlari_ara');
        expect(names).not.toContain('musteri_istekleri');
        // Doğrudan çağrılsa bile reddedilir
        expect((await executeTool({ name: 'notlari_ara', arguments: {} }, ctx)).ok).toBe(false);
        // Durum raporu taslağı yöneticide notları içermez
        const rep = await executeTool({ name: 'durum_raporu_taslagi', arguments: { proje: 'ALTAY' } }, ctx);
        expect(rep.content).not.toContain('Müşteri toplantısı');
    });

    it('PY kendi projesinin notlarını arayabilir', async () => {
        const r = await run('notlari_ara', { metin: 'bütçe' });
        expect(r.json.eslesen).toBe(1);
        expect(r.json.notlar[0].proje).toBe('ALTAY Sistemi');
        expect((await run('musteri_istekleri', {})).json.istekler[0].baslik).toBe('Rapor ekranı');
    });

    it('son değişiklikler yalnız denetim yetkisiyle; görünmeyen projelerin kayıtlarını içermez', async () => {
        expect((await run('son_degisiklikler', { gun: 30 })).ok).toBe(false); // varsayılanda yalnız admin
        const ws = { ...buildWs(), rolePermissions: { py: ['project.create' as const, 'app.audit' as const] } };
        const r = await run('son_degisiklikler', { gun: 30 }, ws);
        expect(r.json.degisiklikler.map((d: any) => d.ozet)).toEqual(['ALTAY RAG → Riskli']);
    });

    it('kişi seçilmemiş PY için kapsam boştur ve açıklama döner', async () => {
        const r = await run('proje_listesi', {}, buildWs('py', null));
        expect(r.json.proje_sayisi).toBe(0);
        expect(r.json.not).toMatch(/kişi seçilmedi/);
    });
});

describe('çözücüler', () => {
    it('proje adı/kodu Türkçe karakter ve büyük-küçük harf duyarsız eşleşir; boşsa açık proje', async () => {
        const ctx = buildToolContext(buildWs(), NOW);
        expect(resolveProject(ctx, 'alt-01').id).toBe('altay');
        expect(resolveProject(ctx, 'altay sİstemi').id).toBe('altay');
        expect(resolveProject(ctx, '').id).toBe('altay');
        expect(() => resolveProject(ctx, 'yok böyle')).toThrow(ToolError);
    });
});

describe('veri araçları', () => {
    it('proje detayı: geciken/yaklaşan görevler, risk ve tahsis', async () => {
        const d = (await run('proje_detayi', {})).json;
        expect(d.ad).toBe('ALTAY Sistemi');
        expect(d.gorevler.geciken_sayisi).toBe(1);
        expect(d.gorevler.geciken[0].gorev).toBe('Arayüz tasarımı');
        expect(d.gorevler.yaklasan_14_gun[0].gorev).toBe('Test planı');
        expect(d.riskler.en_yuksek[0]).toMatchObject({ baslik: 'Tedarik gecikmesi', skor: 20 });
        expect(d.tahsis).toMatchObject({ yil: 2026, plan_aa: 1.7, gerceklesen_aa: 0.8 });
    });

    it('kişi profili: aylık yük, kapasite aşımı; sicil yok', async () => {
        const r = await run('kisi_profili', { kisi: 'ayse kaya' });
        expect(r.json.ad).toBe('Ayşe Kaya');
        expect(r.json.aylik_plan[6]).toBe(1.2);
        expect(r.json.kapasite_asimi_olan_aylar).toContain(7);
        expect(r.content).not.toContain('SCp199');
    });

    it('kişi verilmezse kullanıcının kendisi', async () => {
        expect((await run('kisi_profili', {})).json.ad).toBe('Ayşe Kaya');
    });

    it('uygun kişi bulma: rol ve pencere', async () => {
        const r = (await run('uygun_kisi_bul', { rol: 'test muhendisi', baslangic_ay: 8, bitis_ay: 10, gerekli_aa: 0.5 })).json;
        expect(r.sorgu.rol).toBe('Test Mühendisi');
        expect(r.adaylar.map((a: any) => a.ad)).toEqual(['Zeynep Şahin']);
        expect(r.adaylar[0].uygun).toBe(true);
    });

    it('doluluk analizi aşırı yüklü kişiyi ve ayı bulur', async () => {
        const r = (await run('doluluk_analizi', {})).json;
        expect(r.kapasitesini_asan_kisi).toBe(1);
        expect(r.asiri_yuklu[0].ad).toBe('Ayşe Kaya');
        expect(r.asiri_yuklu[0].asiri_aylar[0].ay).toBe(7);
    });

    it('geciken görev filtresi', async () => {
        const r = (await run('gorev_ara', { geciken: true })).json;
        expect(r.gorevler.map((g: any) => g.gorev)).toEqual(['Arayüz tasarımı']);
    });

    it('tahsis özeti tüm projeleri kapsar (Tahsis ekranı gibi)', async () => {
        const r = (await run('tahsis_ozeti', {})).json;
        expect(r.projeler.map((p: any) => p.proje).sort()).toEqual(['ALTAY Sistemi', 'Gizli Proje']);
    });

    it('bilinmeyen araç ve geçersiz yıl hata olarak döner', async () => {
        expect((await run('olmayan_arac', {})).ok).toBe(false);
        const bad = await run('portfoy_ozeti', { yil: 1800 });
        expect(bad.ok).toBe(false);
        expect(bad.json.hata).toMatch(/Geçersiz yıl/);
    });
});

describe('sistem talimatı', () => {
    it('rol, kişi, açık proje ve görünür projeleri içerir; sicil içermez', async () => {
        const ctx = buildToolContext(buildWs(), NOW);
        const s = buildSystemPrompt(ctx);
        expect(s).toContain('Proje Yöneticisi — Ayşe Kaya');
        expect(s).toContain('Açık proje: ALTAY Sistemi (ALT-01)');
        expect(s).toContain('Görebildiği projeler (1)');
        expect(s).not.toContain('Gizli Proje');
        expect(s).not.toMatch(/SCp\d99/);
    });

    it('yönetici rolünde not erişimi olmadığını belirtir', async () => {
        const s = buildSystemPrompt(buildToolContext(buildWs('mudur', null), NOW));
        expect(s).toContain('notlarını ve müşteri isteklerini göremez');
    });
});

describe('bilgi_ara (RAG)', () => {
    const fakeHit = (id: string, type: any, title: string, text: string, projectName?: string) => ({
        chunk: { id: `${id}#0`, docId: id, type, title, text, projectName, ref: { kind: 'guide', section: title }, hash: id },
        score: 1, lexical: true, semantic: false,
    });

    it('kaynakları numaralar, tekrar eden parçaya aynı numarayı verir, sicili maskeler', async () => {
        const ctx = buildToolContext(buildWs(), NOW);
        const search = vi.fn(async () => [
            fakeHit('not:1', 'not', 'ALTAY notu', 'Ayşe Kaya (SCp199) ek bütçe istedi.', 'ALTAY Sistemi'),
            fakeHit('kilavuz:x', 'kilavuz', 'Plan onayı', 'Onaya Gönder ile gönderilir.'),
        ]);
        ctx.rag = { search: search as any, mode: () => 'anahtar kelime' };
        const r1 = JSON.parse((await executeTool({ name: 'bilgi_ara', arguments: { sorgu: 'ek bütçe', kaynak: 'not', proje: 'ALTAY' } }, ctx)).content);
        expect(r1.sonuclar.map((s: any) => s.no)).toEqual([1, 2]);
        expect(r1.sonuclar[0].metin).toContain('[sicil]');
        expect(search).toHaveBeenCalledWith('ek bütçe', { k: 6, types: ['not'], projectId: 'altay' });
        const r2 = JSON.parse((await executeTool({ name: 'bilgi_ara', arguments: { sorgu: 'plan onayı' } }, ctx)).content);
        expect(r2.sonuclar.map((s: any) => s.no)).toEqual([1, 2]);
        expect(ctx.citations.map(c => c.no)).toEqual([1, 2]);
    });

    it('RAG yoksa ya da sorgu boşsa hata; yönetici yalnız notlarda arayamaz', async () => {
        const ctx = buildToolContext(buildWs(), NOW);
        expect((await executeTool({ name: 'bilgi_ara', arguments: { sorgu: 'x' } }, ctx)).ok).toBe(false);
        ctx.rag = { search: async () => [], mode: () => 'anahtar kelime' };
        expect((await executeTool({ name: 'bilgi_ara', arguments: {} }, ctx)).ok).toBe(false);
        const empty = JSON.parse((await executeTool({ name: 'bilgi_ara', arguments: { sorgu: 'yok' } }, ctx)).content);
        expect(empty.not).toMatch(/bulunamadı/);
        const ex = buildToolContext(buildWs('mudur', null), NOW);
        ex.rag = { search: async () => [], mode: () => 'anahtar kelime' };
        const denied = await executeTool({ name: 'bilgi_ara', arguments: { sorgu: 'x', kaynak: 'not' } }, ex);
        expect(denied.ok).toBe(false);
    });
});

describe('değişiklik öneri araçları', () => {
    it('yalnızca veri girebilen rollere sunulur', () => {
        expect(toolSpecsFor(buildToolContext(buildWs(), NOW)).map(t => t.name)).toContain('oner_risk_ekle');
        expect(toolSpecsFor(buildToolContext(buildWs('mudur', null), NOW)).some(t => t.name.startsWith('oner_'))).toBe(false);
        expect(toolSpecsFor(buildToolContext(buildWs('py', null), NOW)).some(t => t.name.startsWith('oner_'))).toBe(false);
    });

    it('öneri üretir ama veriyi DEĞİŞTİRMEZ', async () => {
        const ws = buildWs();
        const ctx = buildToolContext(ws, NOW);
        const before = JSON.stringify(ws);
        const r = JSON.parse((await executeTool({ name: 'oner_risk_ekle', arguments: { baslik: 'Kur riski', olasilik: 3, etki: 4, sahip: 'mehmet demir' } }, ctx)).content);
        expect(r.oneri_no).toBe(1);
        expect(r.durum).toMatch(/onay/);
        expect(ctx.proposals[0].action).toMatchObject({ type: 'risk_ekle', projectId: 'altay', ownerPersonId: 'p2', probability: 3, impact: 4 });
        expect(JSON.stringify(ws)).toBe(before);
    });

    it('yetki ve doğrulama hataları modele döner', async () => {
        const ctx = buildToolContext(buildWs(), NOW);
        const other = await executeTool({ name: 'oner_tahsis_ayarla', arguments: { kisi: 'Mehmet Demir', proje: 'Gizli Proje', ay: 7, aa: 0.5 } }, ctx);
        expect(other.ok).toBe(false);
        expect(JSON.parse(other.content).hata).toMatch(/yetkiniz yok/);
        const ambiguous = await executeTool({ name: 'oner_gorev_durumu', arguments: { gorev: 'i', durum: 'Done' } }, ctx); // 'Arayüz tasarımı' + 'Test planı'
        expect(ambiguous.ok).toBe(false);
        const ok = JSON.parse((await executeTool({ name: 'oner_gorev_durumu', arguments: { gorev: 'test planı', durum: 'Done' } }, ctx)).content);
        expect(ok.ozet).toMatch(/Test planı/);
        const bad = await executeTool({ name: 'oner_risk_ekle', arguments: { baslik: 'x', olasilik: 7, etki: 1 } }, ctx);
        expect(JSON.parse(bad.content).hata).toMatch(/1-5/);
        expect(ctx.proposals).toHaveLength(1);
    });
});

describe('pilot bulgularından gelen iyileştirmeler', () => {
    it('gorev_ara metni Jira anahtarında da arar', async () => {
        const ws = buildWs('pyb_destek', null);
        ws.projects[0].tasks[0].jiraId = 'ALT-77';
        const r = await run('gorev_ara', { metin: 'alt-77' }, ws);
        expect(r.json.eslesen).toBe(1);
        expect(r.json.gorevler[0].jira).toBe('ALT-77');
    });

    it('kapasite_talep rolsüz tahsis satırlarında uyarır', async () => {
        const r = await run('kapasite_talep', { yil: 2026 }, buildWs('pyb_destek', null));
        expect(r.json.uyari).toContain('rolü girilmemiş');
        const ws = buildWs('pyb_destek', null);
        ws.allocations = ws.allocations.map(a => ({ ...a, role: 'Yazılım Geliştirme Mühendisi' }));
        expect((await run('kapasite_talep', { yil: 2026 }, ws)).json.uyari).toBeUndefined();
    });
});
