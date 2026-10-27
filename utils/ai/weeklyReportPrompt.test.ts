import { describe, expect, it } from 'vitest';
import { CustomerMeeting, Project, Task, TaskStatus, WeeklyReport } from '../../types';
import { meetingToDetails } from '../customerMeetings';
import { createProject } from '../workspace';
import { itemDisplay, meetingSentence, newItem, weekLabel } from '../weeklyReport';
import { summarizeWorklog } from '../worklog';
import { PROFILE_HEADER } from './projectProfile';
import { buildDepartmentInput, buildReportInput, buildReportPrompt, parseReportSuggestion, REPORT_EXAMPLE, REPORT_INPUT_BUDGET, REPORT_SYSTEM, ReportPromptInput } from './weeklyReportPrompt';
import { DEPARTMENT_TASK } from './reportGuide';
import { buildDepartmentRequest } from './reportVariants';

/** F3 öncesi girdi oluşturucu (kartsız projelerde yeni bölümler hariç aynı çıktı beklenir) */
const legacyInput = (i: ReportPromptInput): string => {
    const clip = (s: string | undefined, n: number) => { const t = (s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
    const p = i.project;
    const L: string[] = [`Proje: ${p.name}${p.code ? ` (${p.code})` : ''}`, `Hafta: ${weekLabel(i.year, i.week, true)}`];
    if (p.ragNote) L.push(`PY haftalık durum notu: ${clip(p.ragNote, 300)}`);
    const notes = p.notes.filter(n => n.year === i.year && n.weekNumber === i.week);
    if (notes.length) {
        L.push('Haftalık notlar:');
        let budget = 3500;
        for (const n of notes) {
            const line = `- ${n.createdAt.slice(5, 10).split('-').reverse().join('.')}: ${clip(n.content, 600)}`;
            if (line.length > budget) break;
            budget -= line.length;
            L.push(line);
        }
    } else L.push('Haftalık notlar: (bu hafta not girilmemiş)');
    const wl = summarizeWorklog(i.worklog || []);
    if (wl.length) {
        L.push('Worklog (konu bazında, saat):');
        wl.slice(0, 15).forEach(w => L.push(`- ${w.issueKey ? `${w.issueKey} ` : ''}${clip(w.summary, 90)}: ${w.hours} sa${w.comments.length ? ` — ${clip(w.comments.join(' / '), 160)}` : ''}`));
    }
    if (i.heldMeetings?.length) { L.push('Bu hafta yapılan müşteri görüşmeleri (kayıtlı):'); i.heldMeetings.forEach(m => L.push(`- ${meetingSentence(meetingToDetails(m))}`)); }
    if (i.plannedMeetings?.length) { L.push('Gelecek hafta planlanan görüşmeler:'); i.plannedMeetings.forEach(m => L.push(`- ${m.date.slice(0, 10)} ${m.customer}: ${m.title}`)); }
    const due = p.tasks.filter(t => t.dueDate && t.status !== TaskStatus.Done).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 8);
    if (due.length) L.push(`Terminli açık işler: ${due.map(t => `${t.name} (${t.dueDate!.slice(0, 10)})`).join('; ')}`);
    const risks = (p.risks || []).filter(r => r.status !== 'closed' && r.probability * r.impact >= 15);
    if (risks.length) L.push(`Yüksek riskler: ${risks.map(r => r.title).join('; ')}`);
    if (i.previous?.nextWeek.length) L.push(`Geçen hafta planlananlar: ${i.previous.nextWeek.map(itemDisplay).join(' | ')}`);
    if (i.dictionary?.length) L.push(`Kurum kısaltma sözlüğü: ${i.dictionary.map(a => `${a.abbr}=${a.expansion}`).join('; ')}`);
    return L.join('\n');
};

const task = (o: Partial<Task>): Task => ({
    id: Math.random().toString(36), name: 'İş', availability: true, priority: 'Medium', version: 1, predecessor: null, unit: '', resourceName: '',
    time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...o,
});

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

describe('zengin girdi (proje kartı, kapanan işler, plan durumu, bütçe)', () => {
    const meeting = { date: '2026-10-05T10:00', customer: 'Gebze Belediyesi', locationType: 'bilgem', location: '', customerParticipants: '', ourParticipants: 'Ürün Yönetimi', agenda: 'Demo', title: 'Demo', decisions: 'Pilot', status: 'held' } as CustomerMeeting;
    const base = (p: Project): ReportPromptInput => ({
        project: p, year: 2026, week: 41,
        worklog: [{ date: '2026-10-06', author: 'Kaan', issueKey: 'MKS-12', summary: 'Multi-domain', hours: 6, source: 'file' }],
        heldMeetings: [meeting], plannedMeetings: [{ ...meeting, date: '2026-10-13T10:00', title: 'Kabul' }],
        previous: { nextWeek: [newItem('plan', 'Pilot sunucuları kurulacak.')] } as WeeklyReport,
        dictionary: [{ abbr: 'İG', expansion: 'İş Geliştirme' }],
    });

    it('kartsız, kapanan işi ve plan değerlendirmesi olmayan projede girdi eskisiyle aynı', () => {
        const p = project();
        p.tasks = [task({ name: 'Açık iş', dueDate: '2026-10-20' })];
        expect(buildReportInput(base(p))).toBe(legacyInput(base(p)));
        const empty = createProject('Boş'); // not, worklog, görüşme yok
        expect(buildReportInput({ project: empty, year: 2026, week: 41 })).toBe(legacyInput({ project: empty, year: 2026, week: 41 }));
    });

    it('yalnız bu hafta kapanan işler (en çok 10), kart ve plan durumu girer', () => {
        const p = project();
        p.aiProfile = { summary: 'Belediyeler için e-posta ürünü.', glossary: [{ term: 'Multi-domain', explanation: 'Birden fazla alan adını tek kurulumda yönetme' }] };
        p.tasks = [
            task({ name: 'Pilot kurulum betiği', jiraId: 'MKS-40', status: TaskStatus.Done, resolvedAt: '2026-10-07T12:00:00' }),
            task({ name: 'Geçen hafta kapanan', status: TaskStatus.Done, resolvedAt: '2026-10-02T12:00:00' }),
            task({ name: 'Gelecek hafta kapanan', status: TaskStatus.Done, resolvedAt: '2026-10-12T09:00:00' }),
            task({ name: 'Açık ama kapanış tarihli', status: TaskStatus.InProgress, resolvedAt: '2026-10-07T12:00:00' }),
            ...Array.from({ length: 12 }, (_, k) => task({ name: `Toplu iş ${k}`, status: TaskStatus.Done, resolvedAt: `2026-10-08T0${k % 10}:00:00` })),
        ];
        const prev = { nextWeek: [{ ...newItem('plan', 'Pilot sunucuları kurulacak.'), id: 'pl1' }, { ...newItem('plan', 'Kabul yapılacak.'), id: 'pl2' }] } as WeeklyReport;
        const input = buildReportInput({ ...base(p), previous: prev, planReview: [{ itemId: 'pl1', text: 'Pilot sunucuları kurulacak.', status: 'slipped' }] });
        expect(input).toContain(PROFILE_HEADER);
        expect(input).toContain('- Terimler: Multi-domain = Birden fazla alan adını tek kurulumda yönetme');
        expect(input.indexOf(PROFILE_HEADER)).toBe(input.indexOf('\n', input.indexOf('Hafta:')) + 1);
        expect(input).toContain('- MKS-40 Pilot kurulum betiği (2026-10-07)');
        expect(input).not.toContain('Geçen hafta kapanan');
        expect(input).not.toContain('Gelecek hafta kapanan');
        expect(input).not.toContain('Açık ama kapanış tarihli');
        const closedLines = input.split('\n').filter(l => /^- (MKS-40 |Toplu iş)/.test(l));
        expect(closedLines).toHaveLength(10);
        expect(input).toContain('Geçen haftanın planı ve durumu: Pilot sunucuları kurulacak. (Ertelendi) | Kabul yapılacak. (değerlendirilmedi)');
        expect(input).not.toContain('Geçen hafta planlananlar:');
        // Kart istenmezse girmez
        expect(buildReportInput({ ...base(p), withProfile: false })).not.toContain(PROFILE_HEADER);
    });

    it('bütçe aşılmaz; önce önemsiz bölümler kırpılır, notlar korunur', () => {
        const p = project();
        p.notes = Array.from({ length: 6 }, (_, k) => ({ id: `n${k}`, content: `Önemli not ${k} `.repeat(40), createdAt: '2026-10-06T09:00:00Z', weekNumber: 41, year: 2026, tags: [], mentions: [] }));
        p.aiProfile = { summary: 'Ö'.repeat(600), customers: 'M'.repeat(300), product: 'Ü'.repeat(300), glossary: Array.from({ length: 30 }, (_, k) => ({ term: `Terim${k}`, explanation: 'A'.repeat(200) })) };
        const worklog = Array.from({ length: 15 }, (_, k) => ({ date: '2026-10-06', author: 'Kaan', issueKey: `MKS-${k}`, summary: 'S'.repeat(90), hours: 2, comment: 'Y'.repeat(200), source: 'file' as const }));
        const input = buildReportInput({ ...base(p), worklog });
        expect(input.length).toBeLessThanOrEqual(REPORT_INPUT_BUDGET);
        expect(input).toContain('Önemli not 0');
        expect(input).toContain('- MKS-0 ');
        expect(input).not.toContain('Kurum kısaltma sözlüğü');
    });
});

describe('bölüm eklemesi önerisi', () => {
    it('girdi: bölüm projelerinin raporları ve bölüm görüşmeleri; istemde bölüm görevi', () => {
        const meeting = { date: '2026-10-06T10:00', customer: 'Kocaeli Valiliği', locationType: 'customer', location: '', customerParticipants: '', ourParticipants: 'İG', agenda: 'İşbirliği görüşmesi', title: 'İşbirliği', decisions: 'Protokol hazırlanacak', status: 'held' } as CustomerMeeting;
        const input = buildDepartmentInput({
            departmentName: 'Yazılım', departmentCode: 'U310', year: 2026, week: 41,
            projectReports: [{ name: 'Safir Posta', code: 'P-100', report: { thisWeek: [newItem('delivery', 'Sürüm 3.2 teslim edildi.')], nextWeek: [newItem('plan', 'Kabul yapılacak.')] } }],
            heldMeetings: [meeting],
        });
        expect(input.split('\n').slice(0, 2)).toEqual(['Bölüm: Yazılım (U310)', 'Hafta: 41. hafta (5–9 Ekim 2026)']);
        expect(input).toContain('- Safir Posta (P-100): Sürüm 3.2 teslim edildi. | Plan: Kabul yapılacak.');
        expect(input).toContain('Bu hafta yapılan bölüm görüşmeleri (kayıtlı):');
        expect(buildDepartmentInput({ departmentName: 'Yazılım', departmentCode: 'U310', year: 2026, week: 41, projectReports: [] })).toContain('(henüz gönderilmiş rapor yok)');
        const req = buildDepartmentRequest({ ws: { projects: [] }, report: { departmentCode: 'U310' }, input });
        expect(req.system).toContain(DEPARTMENT_TASK);
        expect(REPORT_SYSTEM).not.toContain(DEPARTMENT_TASK);
        expect(req.promptVersion.endsWith('·bolum')).toBe(true);
        expect(req.prompt).toContain('ÖRNEK GİRDİ');
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
