import { describe, expect, it } from 'vitest';
import { ReportSettings } from '../../types';
import { CATEGORY_META, DEFAULT_REPORT_SETTINGS, THIS_WEEK_CATEGORIES } from '../weeklyReport';
import {
    buildReportSystem, DEFAULT_REPORT_GUIDE, DEPARTMENT_GUIDE_HEADER, DEPARTMENT_GUIDE_LIMIT, GUIDE_LIMIT, LEARNED_RULES_HEADER, REPORT_JSON_CONTRACT, REPORT_PROMPT_VERSION,
    REPORT_SYSTEM, reportConfigVersion, reportPromptVersion, reportSystemFor, resetReportGuide, saveDepartmentGuide, saveReportGuide,
} from './reportGuide';

/** F4 öncesi koda gömülü sistem istemi (birebir) */
const LEGACY_REPORT_SYSTEM = `Sen TÜBİTAK BİLGEM'de proje yöneticisinin (PY) haftalık raporunu hazırlayan yazım asistanısın. Raporu müdürler okur.
Yalnızca sana verilen verilere dayan; tarih, rakam, kişi ya da kurum UYDURMA. Bilgi eksikse maddeyi yazma, "eksikBilgi" listesine soru olarak ekle.
Proje kartındaki açıklamaları, konuya yabancı okurun anlaması gerektiğinde kısa açıklama olarak kullan; kartta olmayan teknik ayrıntı uydurma.

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

const NOW = new Date('2026-10-09T10:00:00Z');
const steward = { role: 'pyb_destek' as const };
const settings = (): ReportSettings => ({ ...DEFAULT_REPORT_SETTINGS });

describe('sistem istemi', () => {
    it('ayarsız istem eski gömülü istemle birebir aynı', () => {
        expect(buildReportSystem()).toBe(LEGACY_REPORT_SYSTEM);
        expect(REPORT_SYSTEM).toBe(LEGACY_REPORT_SYSTEM);
        expect(reportSystemFor(undefined, 'U310')).toBe(LEGACY_REPORT_SYSTEM);
        expect(reportSystemFor(settings(), 'U310')).toBe(LEGACY_REPORT_SYSTEM);
    });

    it('kurum adı, kılavuz, bölüm eki ve kurallar; JSON sözleşmesi hep sonda', () => {
        const sys = buildReportSystem({ institutionName: 'TÜBİTAK UEKAE', guide: 'KURAL: kısa yaz.', departmentGuide: 'Hakedişte KDV hariç yaz.', learnedRules: ['Tarih ekle.'] });
        expect(sys.startsWith("Sen TÜBİTAK UEKAE'de proje yöneticisinin")).toBe(true);
        expect(sys).toContain('KURAL: kısa yaz.');
        expect(sys).not.toContain('KURUM RAPOR KILAVUZU');
        expect(sys).toContain(`${DEPARTMENT_GUIDE_HEADER}\nHakedişte KDV hariç yaz.`);
        expect(sys).toContain(`${LEARNED_RULES_HEADER}\n- Tarih ekle.`);
        expect(sys.endsWith(REPORT_JSON_CONTRACT)).toBe(true);
    });

    it('bölüm eki yalnız o bölümün raporunda; kurallar katmanı kapalıyken varsayılan kılavuz', () => {
        let s = saveReportGuide(settings(), steward, { text: 'ÖZEL KILAVUZ' }, 'Destek', NOW)!;
        s = saveDepartmentGuide(s, steward, 'U310', 'Yazılım bölümü eki', 'Destek', NOW)!;
        expect(reportSystemFor(s, 'U310')).toContain('Yazılım bölümü eki');
        expect(reportSystemFor(s, 'U320')).not.toContain('Yazılım bölümü eki');
        expect(reportSystemFor(s, 'U320')).toContain('ÖZEL KILAVUZ');
        expect(reportSystemFor(s, 'U310', { rules: false })).toBe(LEGACY_REPORT_SYSTEM);
    });
});

describe('kılavuz kaydı ve sürüm', () => {
    it('yalnız PYB destek; sürüm artar; sınır aşılırsa reddedilir', () => {
        expect(saveReportGuide(settings(), { role: 'py' }, { text: 'x' })).toBeNull();
        expect(saveReportGuide(settings(), steward, { text: 'x'.repeat(GUIDE_LIMIT + 1) })).toBeNull();
        const s1 = saveReportGuide(settings(), steward, { text: 'Bir', institutionName: 'Kurum A' }, 'Destek', NOW)!;
        expect(s1.guide).toEqual({ text: 'Bir', version: 1, updatedAt: NOW.toISOString(), institutionName: 'Kurum A', updatedByName: 'Destek' });
        const s2 = saveReportGuide(s1, steward, { text: 'İki', institutionName: 'Kurum A' })!;
        expect(s2.guide!.version).toBe(2);
        const reset = resetReportGuide(s2, steward)!;
        expect(reset.guide).toMatchObject({ text: '', version: 3, institutionName: 'Kurum A' });
        // Varsayılanla aynı metin boş saklanır
        expect(saveReportGuide(settings(), steward, { text: DEFAULT_REPORT_GUIDE })!.guide!.text).toBe('');
    });

    it('bölüm eki: sınır, boş metin eki kaldırır, sürüm', () => {
        expect(saveDepartmentGuide(settings(), steward, 'U310', 'x'.repeat(DEPARTMENT_GUIDE_LIMIT + 1))).toBeNull();
        expect(saveDepartmentGuide(settings(), { role: 'bolum_sorumlu' }, 'U310', 'x')).toBeNull();
        const a = saveDepartmentGuide(settings(), steward, 'U310', 'Ek', undefined, NOW)!;
        expect(a.departmentGuides!.U310.version).toBe(1);
        expect(saveDepartmentGuide(a, steward, 'U310', 'Ek 2')!.departmentGuides!.U310.version).toBe(2);
        expect(saveDepartmentGuide(a, steward, 'U310', '  ')!.departmentGuides).toBeUndefined();
    });

    it('etkin sürüm: varsayılanda istem sürümü; içerik değişince değişir, geri dönünce aynı', () => {
        expect(reportPromptVersion(undefined, 'U310')).toBe(REPORT_PROMPT_VERSION);
        expect(reportConfigVersion(undefined)).toBe(REPORT_PROMPT_VERSION);
        const s1 = saveReportGuide(settings(), steward, { text: 'A' })!;
        const s2 = saveReportGuide(s1, steward, { text: 'B' })!;
        const s3 = saveReportGuide(s2, steward, { text: 'A' })!;
        expect(reportPromptVersion(s1, 'U310')).not.toBe(REPORT_PROMPT_VERSION);
        expect(reportPromptVersion(s2, 'U310')).not.toBe(reportPromptVersion(s1, 'U310'));
        expect(reportPromptVersion(s3, 'U310')).toBe(reportPromptVersion(s1, 'U310'));
        // Bölüm eki: yalnız o bölümün sürümü değişir; yapılandırma sürümü her bölüm ekinde değişir
        const d = saveDepartmentGuide(s1, steward, 'U310', 'Ek')!;
        expect(reportPromptVersion(d, 'U320')).toBe(reportPromptVersion(s1, 'U320'));
        expect(reportPromptVersion(d, 'U310')).not.toBe(reportPromptVersion(s1, 'U310'));
        expect(reportConfigVersion(d)).not.toBe(reportConfigVersion(s1));
        expect(reportConfigVersion(s1, ['kural'])).not.toBe(reportConfigVersion(s1));
    });

    it('kategori listesi kodda kalır', () => {
        expect(REPORT_SYSTEM).toContain(THIS_WEEK_CATEGORIES.map(c => `${c} (${CATEGORY_META[c].label})`).join(', '));
    });
});
