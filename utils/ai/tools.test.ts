import { describe, expect, it, vi } from 'vitest';
import { Allocation, Person, Task, TaskStatus, UserRole, WorkspaceData } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { AI_LIMITS, TOOL_NAME_PATTERN } from './protocol';
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
        // Çalışma zamanı gerektiren araçlar (ajan gezinmesi, Jira okuma/worklog/eşitleme) yalnız
        // bağlıyken gönderilir; onlarsız istek BL-15 sınırında kalır.
        // Ölçü, bir isteğe GERÇEKTEN giden araçlardır: veri havuzu öneri araçları yalnız veri havuzunu
        // düzenleyen role (PYB Destek), proje öneri araçları yalnız PY/Bölüm Sorumlusu'na gider; ikisi
        // aynı istekte bulunmaz. Her rolün temel isteği BL-15 sınırında kalır.
        const runtime = JSON.stringify(AI_TOOLS.filter(t => t.requires === 'ui' || t.requires === 'jira').map(t => t.spec)).length;
        // Dosya çıktısı (dosya_olustur) yalnız tarayıcı sohbetinde gider; ayrı ölçülür
        const files = JSON.stringify(AI_TOOLS.filter(t => t.requires === 'files' || t.requires === 'memory').map(t => t.spec)).length;
        console.log(`dosya ve hafıza araçları: ${files}`);
        // 3 000 → 6 000: rapor dosyasına gösterge (KPI), vurgu ve grafik bölümleri; sohbete hesap motoru
        // (veri_analiz) ve yetenek oyun kitabı (yetenek_yukle) eklendi. Yalnız tarayıcı sohbetinde gider.
        // 6 000 → 7 000: sürüm planı optimizasyonu (plan_optimizasyonu: taş tahmini, kurtarma senaryoları, onaylı öneri).
        // 7 000 → 8 000: hafıza belgesi (hafiza_kaydet: bölüm, önem, etiket). Tarayıcı sohbeti artık araçları
        // soruya göre süzdüğü için bir isteğe giden toplam küçüldü (bkz. toolRouting.test.ts).
        expect(files).toBeLessThan(8_000);
        let base = 0;
        for (const role of ['py', 'mudur', 'bolum_sorumlu', 'pyb_destek', 'pyb_sorumlu', 'admin'] as UserRole[]) {
            const ctx = buildToolContext(buildWs(role, role === 'py' || role === 'bolum_sorumlu' ? 'p1' : null), NOW);
            const specs = toolSpecsFor(ctx);
            const size = JSON.stringify(specs).length;
            console.log(`${role}: ${specs.length} araç, ${size} karakter`);
            expect(specs.length).toBeLessThanOrEqual(AI_LIMITS.maxTools);
            base = Math.max(base, size);
        }
        console.log(`çalışma zamanısız en büyük istek: ${base}, çalışma zamanlı: ${runtime}`);
        // 18 000 → 18 500: PY / Bölüm Sorumlusu'na görev silme önerisi (oner_gorev_sil, ~600 karakter).
        // Yazma aracı almayan yönetici rollerinin istek boyutu değişmedi.
        expect(base).toBeLessThan(18_500);
        // 5 000 → 7 000: ajan + Jira okuma araçlarına Jira worklog raporu, eşitleme önerisi, iş gücü
        // raporu ve kayıt worklog'u eklendi. Yalnız Jira bağlıyken gönderilir; temel istek BL-15'te kalır.
        expect(runtime).toBeLessThan(7_000);
        // Katalogun tamamı hiçbir istekte birlikte gitmez (veri havuzu ve proje öneri araçları ayrı rollerde).
        // Ölçü, en geniş istek: her çalışma zamanı bağlıyken (ajan, Jira, dosya, hafıza) her rol sınırda kalır.
        for (const role of ['py', 'bolum_sorumlu', 'pyb_destek', 'mudur'] as UserRole[]) {
            const ctx = buildToolContext(buildWs(role, role === 'py' || role === 'bolum_sorumlu' ? 'p1' : null), NOW);
            Object.assign(ctx, { ui: { run: () => ({ ok: true }) }, jira: {}, files: [], memory: { store: {}, userPrompt: '' } });
            const n = toolSpecsFor(ctx).length;
            console.log(`${role} (tüm çalışma zamanı): ${n} araç`);
            expect(n).toBeLessThanOrEqual(AI_LIMITS.maxTools);
        }
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

    it('plan kilidi öneri denenmeden görünür: proje listesi ve kişi profili (B-014)', async () => {
        const ws = { ...buildWs(), planLocks: [{ projectId: 'altay', year: 2026, status: 'locked' as const }] };
        const list = await run('proje_listesi', {}, ws);
        expect(list.json.projeler.find((p: { ad: string }) => p.ad === 'ALTAY Sistemi').plan_kilidi).toBe('Onaylı/Kilitli');
        const prof = await run('kisi_profili', { kisi: 'Ayşe Kaya' }, ws);
        expect(prof.json.projeler[0]).toMatchObject({ proje: 'ALTAY Sistemi', plan_kilidi: 'Onaylı/Kilitli' });
        expect((await run('proje_listesi', {})).json.projeler[0].plan_kilidi).toBe('Taslak');
    });

    it('uygulama içi asistanda da seçeneğin Türkçe karşılığı kabul edilir (B-009)', async () => {
        const ctx = buildToolContext(buildWs(), NOW);
        expect((await executeTool({ name: 'oner_rag_guncelle', arguments: { rag: 'Kritik' } }, ctx)).ok).toBe(true);
        expect(ctx.proposals[0].action).toMatchObject({ type: 'rag_guncelle', projectId: 'altay', rag: 'red' });
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

    it('kapasite_talep: rolsüz satır kişinin rolüne yazılır ve not düşülür; kişinin rolü yoksa uyarır (B-025)', async () => {
        const r = await run('kapasite_talep', { yil: 2026, sadece_acik: false }, buildWs('pyb_destek', null));
        expect(r.json.uyari).toBeUndefined();
        expect(r.json.not).toContain('rolüne yazıldı');
        expect((r.json.satirlar as { rol: string }[]).map(x => x.rol)).not.toContain('Rol atanmamış');
        const roleless = buildWs('pyb_destek', null);
        roleless.people = roleless.people.map(p => ({ ...p, roles: [] }));
        expect((await run('kapasite_talep', { yil: 2026 }, roleless)).json.uyari).toContain('rolü girilmemiş');
        const ws = buildWs('pyb_destek', null);
        ws.allocations = ws.allocations.map(a => ({ ...a, role: 'Yazılım Geliştirme Mühendisi' }));
        const full = (await run('kapasite_talep', { yil: 2026 }, ws)).json;
        expect(full.uyari).toBeUndefined();
        expect(full.not).toBeUndefined();
    });
});

describe('ajan modu: arayüz komutları', () => {
    const withUi = (ws = buildWs()) => {
        const ctx = buildToolContext(ws, NOW);
        const run = vi.fn((_cmd: unknown) => ({ ok: true, message: 'açıldı' }));
        ctx.ui = { run };
        return { ctx, run };
    };

    it('arayüz araçları yalnız çalışma zamanı bağlıysa sunulur', () => {
        const names = (ctx: ReturnType<typeof buildToolContext>) => toolSpecsFor(ctx).map(t => t.name);
        expect(names(buildToolContext(buildWs(), NOW))).not.toContain('ekrana_git');
        expect(names(withUi().ctx)).toEqual(expect.arrayContaining(['ekrana_git', 'gorev_ac', 'kisi_profili_ac', 'pencere_ac']));
        expect(buildSystemPrompt(withUi().ctx)).toContain('Ajan yetenekleri');
        expect(buildSystemPrompt(buildToolContext(buildWs(), NOW))).not.toContain('Ajan yetenekleri');
    });

    it('ekran ve görev komutları kapsam içinde çözülür; açık proje güncellenir', async () => {
        const { ctx, run } = withUi();
        expect((await executeTool({ name: 'ekrana_git', arguments: { ekran: 'riskler', proje: 'ALT-01' } }, ctx)).ok).toBe(true);
        expect(run).toHaveBeenLastCalledWith({ type: 'screen', screen: 'riskler', projectId: 'altay' });
        expect((await executeTool({ name: 'gorev_ac', arguments: { gorev: 'test planı' } }, ctx)).ok).toBe(true);
        expect(run).toHaveBeenLastCalledWith({ type: 'task', projectId: 'altay', taskId: 't2' });
        expect((await executeTool({ name: 'kisi_profili_ac', arguments: { kisi: 'Zeynep Şahin' } }, ctx)).ok).toBe(true);
        expect(run).toHaveBeenLastCalledWith({ type: 'person', personId: 'p3' });
        // Kapsam dışı proje ve geçersiz ekran arayüze hiç ulaşmaz
        run.mockClear();
        expect((await executeTool({ name: 'ekrana_git', arguments: { ekran: 'gorevler', proje: 'Gizli Proje' } }, ctx)).ok).toBe(false);
        expect((await executeTool({ name: 'ekrana_git', arguments: { ekran: 'yok' } }, ctx)).ok).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });

    it('arayüzün reddi modele hata olarak döner', async () => {
        const { ctx, run } = withUi();
        run.mockReturnValue({ ok: false, message: 'Yönetim ekranı bu rolde açık değil.' });
        const out = await executeTool({ name: 'ekrana_git', arguments: { ekran: 'yonetim' } }, ctx);
        expect(out.ok).toBe(false);
        expect(JSON.parse(out.content).hata).toMatch(/açık değil/);
    });
});

describe('Jira araçları', () => {
    const issue = (key: string, extra: Record<string, unknown> = {}) => ({
        key, summary: `Özet ${key}`, description: 'Açıklama', issueType: 'Bug', status: 'Devam Ediyor', statusCategory: 'indeterminate' as const,
        priority: 'High', created: '2026-07-01T10:00:00Z', resolved: null, components: [], labels: [], fixVersions: ['1.2'],
        originalEstimateSeconds: 7200, timeSpentSeconds: 3600, storyPoints: 3, assignee: 'Ayşe Kaya', blockedBy: [],
        transitions: [{ at: '2026-07-02T10:00:00Z', from: 'Açık', to: 'Devam Ediyor', fromCategory: 'new' as const, toCategory: 'indeterminate' as const }],
        due: '2026-07-30', updated: '2026-07-10T10:00:00Z', ...extra,
    });
    const withJira = () => {
        const ws = buildWs();
        ws.projects[0].jiraProjectKey = 'ALT';
        ws.projects[0].tasks[1].jiraId = 'ALT-2';
        ws.projects[1].jiraProjectKey = 'GZL';
        const ctx = buildToolContext(ws, NOW);
        const jira = {
            meta: vi.fn(async () => ({ user: 'svc', projects: [{ key: 'ALT', name: 'Altay' }], filters: [{ id: '10', name: 'Sprint', jql: 'x' }] })),
            byKeys: vi.fn(async (keys: string[]) => ({ issues: keys.filter(k => k !== 'ALT-9').map(k => issue(k)), total: null, next: null, missing: keys.filter(k => k === 'ALT-9') })),
            search: vi.fn(async () => ({ issues: [issue('ALT-1'), issue('ALT-2', { assignee: 'Mehmet Demir' }), issue('GZL-1')], total: 3, next: null, missing: [] })),
            worklogs: vi.fn(async () => []),
            issueWorklogs: vi.fn(async (keys: string[]) => ({ entries: keys.includes('ALT-1') ? [{ issueKey: 'ALT-1', date: '2026-10-06', author: 'Mehmet Demir', hours: 3 }, { issueKey: 'ALT-1', date: '2026-10-07', author: 'Dış Kişi', hours: 1.5 }] : [], missing: keys.filter(k => k === 'ALT-9') })),
        };
        ctx.jira = jira;
        return { ctx, jira };
    };

    it('Jira bağlı değilse araçlar sunulmaz', () => {
        expect(toolSpecsFor(buildToolContext(buildWs(), NOW)).some(t => t.name.startsWith('jira_'))).toBe(false);
        expect(toolSpecsFor(withJira().ctx).map(t => t.name)).toEqual(expect.arrayContaining(['jira_kayit_getir', 'jira_kayit_ara', 'jira_baglanti']));
    });

    it('anahtarla güncel kayıt ve uygulamadaki karşılığı', async () => {
        const { ctx, jira } = withJira();
        const out = await executeTool({ name: 'jira_kayit_getir', arguments: { anahtarlar: 'alt-2, ALT-9' } }, ctx);
        expect(out.ok).toBe(true);
        expect(jira.byKeys).toHaveBeenCalledWith(['ALT-2', 'ALT-9']);
        const r = JSON.parse(out.content);
        expect(r.kayitlar[0]).toMatchObject({ anahtar: 'ALT-2', durum: 'Devam Ediyor', tahmin_saat: 2, harcanan_saat: 1, uygulamada: { proje: 'ALTAY Sistemi', gorev: 'Test planı' } });
        expect(r.kayitlar[0].durum_gecmisi).toEqual(['2026-07-02: Açık → Devam Ediyor']);
        expect(r.bulunamayan).toEqual(['ALT-9']);
    });

    it('kapsam dışı uygulama projesine bağlı Jira anahtarı okunmaz', async () => {
        const { ctx, jira } = withJira();
        expect((await executeTool({ name: 'jira_kayit_getir', arguments: { anahtarlar: 'GZL-1' } }, ctx)).ok).toBe(false);
        expect((await executeTool({ name: 'jira_kayit_ara', arguments: { jira_proje: 'GZL' } }, ctx)).ok).toBe(false);
        expect((await executeTool({ name: 'jira_kayit_getir', arguments: { anahtarlar: 'X" OR 1=1' } }, ctx)).ok).toBe(false);
        expect(jira.byKeys).not.toHaveBeenCalled();
    });

    it('arama: kaynak verilmezse açık projenin Jira anahtarı; gizli projenin kayıtları süzülür', async () => {
        const { ctx, jira } = withJira();
        const r = JSON.parse((await executeTool({ name: 'jira_kayit_ara', arguments: { metin: 'giriş hatası', limit: 5 } }, ctx)).content);
        expect(jira.search).toHaveBeenCalledWith({ projectKey: 'ALT', text: 'giriş hatası' }, { openOnly: true, pageSize: 50 });
        expect(r.kayitlar.map((k: { anahtar: string }) => k.anahtar)).toEqual(['ALT-1', 'ALT-2']);
        expect(r.atanan_dagilimi).toEqual({ 'Ayşe Kaya': 1, 'Mehmet Demir': 1 });
        await executeTool({ name: 'jira_kayit_ara', arguments: { etiket: 'a, b', kapali_dahil: true } }, ctx);
        expect(jira.search).toHaveBeenLastCalledWith({ labels: ['a', 'b'] }, { openOnly: false, pageSize: 50 });
    });

    it('jira_kayit_worklog: kayıtta kim kaç saat; bulunamayan ve kapsam dışı kayıt', async () => {
        const { ctx } = withJira();
        const r = JSON.parse((await executeTool({ name: 'jira_kayit_worklog', arguments: { anahtarlar: 'alt-1, ALT-9' } }, ctx)).content);
        expect(r.kayitlar).toHaveLength(1);
        expect(r.kayitlar[0]).toMatchObject({ anahtar: 'ALT-1', kisi_sayisi: 2, toplam_saat: 4.5 });
        expect(r.kayitlar[0].kisiler.map((k: { kisi: string; saat: number }) => [k.kisi, k.saat])).toEqual([['Mehmet Demir', 3], ['Dış Kişi', 1.5]]);
        expect(r.bulunamayan).toEqual(['ALT-9']);
        const out = await executeTool({ name: 'jira_kayit_worklog', arguments: { anahtarlar: 'GZL-1' } }, ctx);
        expect(out.ok).toBe(false);
    });

    it('is_gucu_raporu: kayıtlı worklog\'tan kişi araması ve kayıt kırılımı; kapsam dışı proje sayılmaz', async () => {
        const { ctx } = withJira();
        const altay = ctx.ws.projects.find(p => p.id === 'altay')!;
        altay.tasks[1].actualHours = 7;
        altay.tasks[1].jiraWorklog = { at: '2026-07-10T00:00:00Z', forHours: 7, entries: [
            { author: 'Mehmet Demir', date: '2026-07-08', hours: 5 },
            { author: 'Ayşe Kaya', date: '2026-07-09', hours: 2 },
        ] };
        const gizli = ctx.ws.projects.find(p => p.id === 'gizli')!;
        gizli.tasks = [{ ...altay.tasks[1], id: 'gx', jiraId: 'GZL-1', jiraWorklog: { at: '', forHours: 9, entries: [{ author: 'Mehmet Demir', date: '2026-07-08', hours: 9 }] } }];
        const fresh = buildToolContext(ctx.ws, NOW);
        fresh.jira = ctx.jira;
        const byPerson = JSON.parse((await executeTool({ name: 'is_gucu_raporu', arguments: { kisi: 'mehmet' } }, fresh)).content);
        expect(byPerson.toplam_saat).toBe(5); // gizli projedeki 9 saat kapsam dışı
        expect(byPerson.satirlar[0]).toMatchObject({ kisi: 'Mehmet Demir', saat: 5, kayit_sayisi: 1, en_cok: ['ALT-2 5 sa'] });
        const byRecord = JSON.parse((await executeTool({ name: 'is_gucu_raporu', arguments: { grupla: 'kayit', ay: '2026-07' } }, fresh)).content);
        expect(byRecord.satirlar).toEqual([expect.objectContaining({ anahtar: 'ALT-2', saat: 7, kisiler: ['Mehmet Demir 5 sa', 'Ayşe Kaya 2 sa'] })]);
        expect(byRecord.donem).toBe('2026-07-01 – 2026-07-15');
    });

    it('Jira hatası modele açıklamayla döner', async () => {
        const { ctx, jira } = withJira();
        jira.meta.mockRejectedValueOnce(new Error('Jira bağlantısı yapılandırılmadı'));
        const out = await executeTool({ name: 'jira_baglanti', arguments: {} }, ctx);
        expect(out.ok).toBe(false);
        expect(JSON.parse(out.content).hata).toMatch(/Jira'dan okunamadı: Jira bağlantısı/);
        const ok = JSON.parse((await executeTool({ name: 'jira_baglanti', arguments: {} }, ctx)).content);
        expect(ok.uygulama_baglantilari).toEqual([{ proje: 'ALTAY Sistemi', jira_proje: 'ALT' }]);
    });
});

describe('panoya_ciz (Whiteboard)', () => {
    it('pano açık değilse sunulmaz; açıkken isteği panoya iletir', async () => {
        const ctx = buildToolContext(buildWs(), NOW);
        expect(toolSpecsFor(ctx).some(t => t.name === 'panoya_ciz')).toBe(false);
        const draw = vi.fn(async () => ({ summary: '3 değişiklik işaretlendi', added: 6, moved: 0, noImage: false }));
        ctx.whiteboard = { describe: () => '"Ekran" panosu, 1 nesne seçili (ekran görüntüsü dahil)', draw };
        expect(toolSpecsFor(ctx).some(t => t.name === 'panoya_ciz')).toBe(true);
        const out = await executeTool({ name: 'panoya_ciz', arguments: { istek: 'Kaydet düğmesini sağa al' } }, ctx);
        expect(draw).toHaveBeenCalledWith('Kaydet düğmesini sağa al');
        expect(JSON.parse(out.content)).toMatchObject({ tamam: true, ozet: '3 değişiklik işaretlendi', eklenen_nesne: 6 });
    });

    it('panodan_gorev_ac: notlardan kayıt açmayı panoya iletir (gruplama isteğiyle)', async () => {
        const ctx = buildToolContext(buildWs(), NOW);
        const createTasks = vi.fn(async () => ({ summary: '5 not tek kayıtta birleşti', created: [{ title: 'Toplu onay', notes: 5 }] }));
        ctx.whiteboard = { describe: () => 'pano', draw: vi.fn(), createTasks };
        expect(toolSpecsFor(ctx).some(t => t.name === 'panodan_gorev_ac')).toBe(true);
        const out = await executeTool({ name: 'panodan_gorev_ac', arguments: { istek: 'Bu notlardan kayıt aç' } }, ctx);
        expect(createTasks).toHaveBeenCalledWith('Bu notlardan kayıt aç');
        expect(JSON.parse(out.content)).toEqual({ tamam: true, ozet: '5 not tek kayıtta birleşti', acilan_kayit: 1, kayitlar: [{ baslik: 'Toplu onay', not_sayisi: 5 }] });
    });
});
