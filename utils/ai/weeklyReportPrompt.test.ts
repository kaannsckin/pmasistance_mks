import { describe, expect, it } from 'vitest';
import { CustomerMeeting, WeeklyReport } from '../../types';
import { createProject } from '../workspace';
import { newItem } from '../weeklyReport';
import { buildReportInput, buildReportPrompt, parseReportSuggestion, REPORT_EXAMPLE, REPORT_SYSTEM } from './weeklyReportPrompt';

const project = () => {
    const p = createProject('Safir Posta');
    p.code = 'P-100';
    p.ragNote = 'Pilot hazırlığı sürüyor';
    p.notes = [
        { id: 'n1', content: 'Gebze demo yapıldı, pilot kararı', createdAt: '2026-10-06T09:00:00Z', weekNumber: 41, year: 2026, tags: [], mentions: [] },
        { id: 'n2', content: 'eski hafta notu', createdAt: '2026-09-28T09:00:00Z', weekNumber: 40, year: 2026, tags: [], mentions: [] },
    ];
    p.risks = [{ id: 'r1', title: 'Sunucu tedariki gecikebilir', probability: 4, impact: 4, status: 'open', createdAt: '' }];
    return p;
};

describe('istem', () => {
    it('kılavuz kuralları ve JSON biçimi sistem isteminde', () => {
        expect(REPORT_SYSTEM).toContain('Kısaltmaların açılımı mutlaka yazılacak');
        expect(REPORT_SYSTEM).toContain('Bu hafta çalışmalara devam edildi');
        expect(REPORT_SYSTEM).toContain('"buHafta"');
        expect(() => JSON.parse(REPORT_EXAMPLE.output)).not.toThrow();
    });

    it('girdi: yalnız bu haftanın notları, worklog, görüşmeler, riskler, geçen hafta planı', () => {
        const meeting = { date: '2026-10-05T10:00', customer: 'Gebze Belediyesi', locationType: 'bilgem', location: '', customerParticipants: '', ourParticipants: 'Ürün Yönetimi', agenda: 'Demo', title: 'Demo', decisions: 'Pilot', status: 'held' } as CustomerMeeting;
        const prev = { nextWeek: [newItem('plan', 'Pilot sunucuları kurulacak.')] } as WeeklyReport;
        const input = buildReportInput({
            project: project(), year: 2026, week: 41,
            worklog: [{ date: '2026-10-06', author: 'Kaan', issueKey: 'MKS-12', summary: 'Multi-domain', hours: 6, source: 'file' }],
            heldMeetings: [meeting], previous: prev, dictionary: [{ abbr: 'İG', expansion: 'İş Geliştirme' }],
        });
        expect(input).toContain('Hafta: 41. hafta (5–9 Ekim 2026)');
        expect(input).toContain('Gebze demo yapıldı');
        expect(input).not.toContain('eski hafta notu');
        expect(input).toContain('MKS-12 Multi-domain: 6 sa');
        expect(input).toContain("BİLGEM'de Demo yapıldı");
        expect(input).toContain('Yüksek riskler: Sunucu tedariki gecikebilir');
        expect(input).toContain('Geçen hafta planlananlar: Pilot sunucuları kurulacak.');
        expect(input).toContain('İG=İş Geliştirme');
    });

    it('tam istem örnek ve onaylı stil örneklerini içerir', () => {
        const style = { thisWeek: [newItem('invoice', '2. hakediş faturası (450.000 TL) 1 Ekim 2026 tarihinde kesildi.')] } as WeeklyReport;
        const prompt = buildReportPrompt('GİRDİ', [style]);
        expect(prompt).toContain('ÖRNEK ÇIKTI');
        expect(prompt).toContain('2. hakediş faturası');
        expect(prompt.endsWith('raporunu JSON olarak yaz.')).toBe(true);
    });
});

describe('yanıt ayrıştırma', () => {
    it('tür doğrulama, tekrar ve boş madde ayıklama', () => {
        const s = parseReportSuggestion('```json\n{"buHafta":[{"tur":"delivery","metin":"Sürüm 2 teslim edildi."},{"tur":"bilinmeyen","metin":"Konu net."},{"tur":"delivery","metin":"Sürüm 2 teslim edildi."},{"tur":"meeting","metin":" "}],"gelecekHafta":["Kabul toplantısı yapılacak.",{"metin":"Pilot başlayacak."}],"kisaltmalar":[{"kisaltma":"KYS","acilim":"Kurumsal Yazışma Sistemi"},{"kisaltma":"X"}],"eksikBilgi":["Tutar?"]}\n```');
        expect(s.thisWeek.map(i => [i.category, i.text, i.source])).toEqual([['delivery', 'Sürüm 2 teslim edildi.', 'ai'], ['ongoing', 'Konu net.', 'ai']]);
        expect(s.nextWeek.map(i => i.text)).toEqual(['Kabul toplantısı yapılacak.', 'Pilot başlayacak.']);
        expect(s.abbreviations).toEqual([{ abbr: 'KYS', expansion: 'Kurumsal Yazışma Sistemi' }]);
        expect(s.missing).toEqual(['Tutar?']);
    });

    it('geçersiz ya da boş yanıt anlaşılır hata verir', () => {
        expect(() => parseReportSuggestion('üzgünüm')).toThrow();
        expect(() => parseReportSuggestion('{"buHafta":[],"gelecekHafta":[]}')).toThrow(/Öneri üretilemedi/);
    });
});
