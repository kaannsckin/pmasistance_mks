import { describe, expect, it } from 'vitest';
import { TaskStatus, WorkspaceData } from '../../types';
import { buildToolContext } from '../ai/scope';
import { createEmptyWorkspace, createProject } from '../workspace';
import { Retriever } from './retriever';
import { guideDocs, workspaceDocs } from './sources';

/**
 * RAG doğruluk değerlendirmesi (golden set): gerçekçi Türkçe sorular —
 * aksansız yazım, çekim ekleri, eş anlamlı ifade — doğru kaynağı ilk 3
 * sonuçta bulmalı. Ölçütler: recall@3 ve MRR (ortalama karşılıklı sıra).
 * Embedding olmadan (yalnızca BM25) ölçülür; anlamsal arama açıkken sonuçlar
 * ancak iyileşir.
 */

const NOW = new Date('2026-07-15T09:00:00Z');

const buildWs = (): WorkspaceData => {
    const p = createProject('ALTAY Sistemi', { code: 'ALT' });
    p.id = 'altay';
    p.pmPersonId = 'pm';
    const task = (id: string, name: string, notes: string) => ({
        id, name, notes, availability: true, priority: 'High' as const, version: 1, predecessor: null, unit: '', resourceName: 'Ayşe Kaya',
        time: { best: 1, avg: 2, worst: 3 }, jiraId: '', status: TaskStatus.ToDo,
    });
    p.tasks = [
        task('t1', 'Veritabanı göçü', 'PostgreSQL 16 sürümüne geçiş; hafta sonu kesinti penceresi gerekiyor.'),
        task('t2', 'Kullanıcı eğitimi', 'Saha personeline iki günlük uygulamalı eğitim verilecek.'),
        task('t3', 'Güvenlik testi', 'Sızma testi dış firmaya yaptırılacak, rapor KVKK uyumu için şart.'),
    ];
    p.risks = [
        { id: 'r1', title: 'Donanım tedarik gecikmesi', description: 'Sunucu donanımı ithalatı gümrükte bekliyor.', mitigation: 'Yerli tedarikçiden geçici kiralama.', probability: 4, impact: 4, status: 'open', createdAt: '2026-06-01' },
        { id: 'r2', title: 'Kilit personel ayrılığı', description: 'Baş mimarın ayrılma ihtimali.', mitigation: 'Bilgi aktarımı ve dokümantasyon.', probability: 2, impact: 5, status: 'open', createdAt: '2026-06-10' },
    ];
    p.notes = [
        { id: 'n1', content: 'Müşteri ile toplantı: kapsamın raporlama modülüyle genişlemesi istendi, ek bütçe talep edeceğiz.', createdAt: '2026-07-08T10:00:00Z', weekNumber: 28, year: 2026, tags: ['müşteri'], mentions: [] },
        { id: 'n2', content: 'Sprint 4 retrospektifi: test ortamı sık çöküyor, DevOps ekibinden destek alınacak.', createdAt: '2026-07-01T10:00:00Z', weekNumber: 27, year: 2026, tags: ['retro'], mentions: [] },
        { id: 'n3', content: 'Yönetim kurulu sunumu ertelendi; yeni tarih Ağustos ortası.', createdAt: '2026-06-24T10:00:00Z', weekNumber: 26, year: 2026, tags: [], mentions: [] },
    ];
    p.customerRequests = [{ id: 'c1', title: 'Excel dışa aktarım', description: 'Aylık raporların Excel olarak indirilmesi istendi.', customerName: 'Kurum A', createdAt: '2026-07-02', status: 'New' }];
    p.pestelItems = [{ id: 'pe1', category: 'legal', text: 'KVKK kapsamında veri yerelleştirme zorunluluğu', kind: 'threat', impact: 4 }];
    return { ...createEmptyWorkspace(), currentRole: 'py', currentPersonId: 'pm', activeProjectId: 'altay', projects: [p] };
};

const GOLDEN: { q: string; expect: string }[] = [
    { q: 'müşteri ek butce istedi mi', expect: 'not:altay:n1' },
    { q: 'raporlama modulu kapsam genislemesi', expect: 'not:altay:n1' },
    { q: 'test ortamindaki cokmeler', expect: 'not:altay:n2' },
    { q: 'yönetim kurulu sunumu ne zaman', expect: 'not:altay:n3' },
    { q: 'postgresql geçişi kesinti', expect: 'gorev:altay:t1' },
    { q: 'saha personeli eğitimleri', expect: 'gorev:altay:t2' },
    { q: 'sızma testini kim yapacak', expect: 'gorev:altay:t3' },
    { q: 'sunucu donanımı gümrük', expect: 'risk:altay:r1' },
    { q: 'baş mimar ayrılırsa ne yapacağız', expect: 'risk:altay:r2' },
    { q: 'excel olarak indirme talebi', expect: 'istek:altay:c1' },
    { q: 'veri yerelleştirme zorunluluğu', expect: 'pestel:altay:pe1' },
    { q: 'plan nasıl onaya gönderilir ve kilitlenir', expect: 'kilavuz:Plan onayı ve kilitleme' },
    { q: 'jira saatlerini gerçekleşen olarak aktarma', expect: 'kilavuz:Jira Billed Hours ile gerçekleşen girişi' },
    { q: 'personel izni nasıl girilir', expect: 'kilavuz:Kişi sayfası, izin ve uygunluk' },
    { q: 'supabase bulut senkronizasyonu kurulumu', expect: 'kilavuz:Yedekleme ve bulut senkronizasyonu' },
    { q: 'boş kapasitesi olan kişiyi bulmak', expect: 'kilavuz:Doluluk ısı haritası ve uygun kişi bulma' },
    { q: 'işe alım ihtiyacı personel açığı', expect: 'kilavuz:Kapasite-talep analizi ve personel açığı' },
    { q: 'teklifleri kazanılmış saymak senaryo', expect: 'kilavuz:Senaryo (what-if) planlama' },
];

describe('RAG doğruluk değerlendirmesi', () => {
    it('golden set: recall@3 ≥ 0,9 ve MRR ≥ 0,75', async () => {
        const ctx = buildToolContext(buildWs(), NOW);
        const r = new Retriever();
        r.sync([...workspaceDocs(ctx), ...guideDocs()]);
        let hit3 = 0;
        let rr = 0;
        const misses: string[] = [];
        for (const g of GOLDEN) {
            const hits = await r.search(g.q, { k: 10 });
            const rank = hits.findIndex(h => h.chunk.docId === g.expect) + 1;
            if (rank > 0 && rank <= 3) hit3++;
            else misses.push(`${g.q} → ${hits.slice(0, 3).map(h => h.chunk.docId).join(', ')}`);
            rr += rank > 0 ? 1 / rank : 0;
        }
        const recall = hit3 / GOLDEN.length;
        const mrr = rr / GOLDEN.length;
        console.log(`RAG değerlendirme: recall@3=${recall.toFixed(2)} MRR=${mrr.toFixed(2)} (${GOLDEN.length} soru)${misses.length ? `\nKaçanlar:\n${misses.join('\n')}` : ''}`);
        expect(recall).toBeGreaterThanOrEqual(0.9);
        expect(mrr).toBeGreaterThanOrEqual(0.75);
    });
});
