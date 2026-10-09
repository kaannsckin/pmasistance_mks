import { describe, expect, it } from 'vitest';
import { WeeklyReport, WorkspaceData } from '../types';
import {
    actorOf, advanceReport, buildEml, DEFAULT_REPORT_FLOW, DEFAULT_REPORT_SETTINGS, flowBlockers, flowStages, nextStage, previousPlansOf, returnStage, dueDate, latestPublication, markWeekEmailed, publishWeek, reminderText, reportDictionary,
    returnReportIn, saveReport, unpublishWeek, canEditReport, consolidate, createReport, editReport, findAbbreviations, glossaryFor, isoWeekOf,
    lintCounts, lintReport, locative, mailtoLink, meetingSentence, newItem, pendingAuthors, projectDepartment, renderReportHtml, renderReportText,
    returnReport, setPlanReview, setReportAiAssessment, shiftWeek, teamsChatLink, visibleReports, weekLabel, weekProgress, weekStart,
} from './weeklyReport';
import { createEmptyWorkspace, createProject } from './workspace';

const NOW = new Date(2026, 9, 6, 10); // 6 Ekim 2026 Salı → 41. hafta

const buildWs = (): WorkspaceData => {
    const a = createProject('Safir Posta'); a.id = 'a'; a.pmPersonId = 'pm1'; a.code = 'P-100';
    const b = createProject('Kurumsal Portal'); b.id = 'b'; b.pmPersonId = 'pm2';
    const c = createProject('Bitmiş'); c.id = 'c'; c.pmPersonId = 'pm1'; c.status = 'tamamlandi';
    return {
        ...createEmptyWorkspace(),
        projects: [a, b, c],
        departments: [{ code: 'U310', name: 'Yazılım' }, { code: 'U320', name: 'Altyapı' }],
        people: [
            { id: 'pm1', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U310', availableAA: 1, roles: [], email: 'ayse@kurum.gov.tr' },
            { id: 'pm2', firstName: 'Ali', lastName: 'Veli', departmentCode: 'U320', availableAA: 1, roles: [] },
            { id: 'bs1', firstName: 'Zeynep', lastName: 'Kara', departmentCode: 'U310', availableAA: 1, roles: [] },
        ],
    };
};

const py = { role: 'py' as const, personId: 'pm1', name: 'Ayşe Yılmaz' };
const bs = { role: 'bolum_sorumlu' as const, personId: 'bs1', name: 'Zeynep Kara' };
const pyds = { role: 'pyb_destek' as const, name: 'Destek' };

describe('haftalar', () => {
    it('ISO hafta, Pazartesi ve kaydırma (yıl geçişi dahil)', () => {
        expect(isoWeekOf(NOW)).toEqual({ year: 2026, week: 41 });
        expect(weekStart(2026, 41).getDate()).toBe(5);
        expect(isoWeekOf(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
        expect(shiftWeek(2026, 53, 1)).toEqual({ year: 2027, week: 1 });
        expect(weekLabel(2026, 41)).toBe('41. hafta · 5–9 Eki');
        expect(weekLabel(2026, 40, true)).toBe('40. hafta (28 Eylül–2 Ekim 2026)');
    });
});

describe('onay akışı', () => {
    it('PY → BS → PYDS → onaylı; her aşamada tek düzenleyen', () => {
        const ws = buildWs();
        let r = createReport({ kind: 'project', projectId: 'a', departmentCode: projectDepartment(ws, ws.projects[0]), year: 2026, week: 41 }, py, NOW);
        expect(r.departmentCode).toBe('U310');
        const wsWith = (rep: WeeklyReport) => ({ ...ws, weeklyReports: [rep] });
        expect(canEditReport(wsWith(r), { role: 'py', personId: 'pm1' }, r)).toBe(true);
        expect(canEditReport(wsWith(r), { role: 'py', personId: 'pm2' }, r)).toBe(false);
        r = advanceReport(r, py, NOW);
        expect(r.stage).toBe('bs_review');
        expect(canEditReport(wsWith(r), { role: 'py', personId: 'pm1' }, r)).toBe(false);
        expect(canEditReport(wsWith(r), { role: 'bolum_sorumlu', personId: 'bs1' }, r)).toBe(true);
        r = editReport(r, { thisWeek: [newItem('delivery', '3 Ekim 2026 tarihinde sürüm 2 teslim edildi.')] }, bs, NOW);
        expect(r.history.map(h => h.action)).toEqual(['create', 'submit', 'edit']);
        r = editReport(r, { nextWeek: [] }, bs, NOW);
        expect(r.history).toHaveLength(3); // aynı düzenleyen tekrar kaydedilmez
        r = returnReport(r, bs, 'Tutarı ekleyin', NOW);
        expect(r).toMatchObject({ stage: 'draft', returnNote: 'Tutarı ekleyin' });
        r = advanceReport(advanceReport(r, py, NOW), bs, NOW);
        expect(r.stage).toBe('pyds_review');
        expect(canEditReport(wsWith(r), { role: 'pyb_destek' }, r)).toBe(true);
        expect(returnReport(r, pyds, 'Format', NOW).stage).toBe('bs_review');
        r = advanceReport(r, pyds, NOW);
        expect(r.stage).toBe('approved');
        expect(r.returnNote).toBeUndefined();
        const published = { ...wsWith(r), weeklyPublications: [{ year: 2026, week: 41, publishedAt: '' }] };
        expect(canEditReport(published, { role: 'pyb_destek' }, r)).toBe(false);
    });

    it('bölüm eklemeleri BS taslağından doğrudan PYDS\'ye gider', () => {
        const d = createReport({ kind: 'department', departmentCode: 'U310', year: 2026, week: 41 }, bs, NOW);
        expect(advanceReport(d, bs, NOW).stage).toBe('pyds_review');
        expect(returnReport(advanceReport(d, bs, NOW), pyds, '', NOW).stage).toBe('draft');
    });

    it('görünürlük: müdür yalnız yayınlanmış haftanın onaylılarını görür', () => {
        const ws = buildWs();
        const r1 = { ...createReport({ kind: 'project', projectId: 'a', departmentCode: 'U310', year: 2026, week: 41 }, py, NOW), stage: 'approved' as const };
        const r2 = { ...createReport({ kind: 'project', projectId: 'b', departmentCode: 'U320', year: 2026, week: 41 }, py, NOW), stage: 'bs_review' as const };
        const w = { ...ws, weeklyReports: [r1, r2] };
        expect(visibleReports(w, { role: 'mudur' })).toHaveLength(0);
        expect(visibleReports({ ...w, weeklyPublications: [{ year: 2026, week: 41, publishedAt: '' }] }, { role: 'mudur' }).map(r => r.id)).toEqual([r1.id]);
        expect(visibleReports(w, { role: 'py', personId: 'pm1' }).map(r => r.id)).toEqual([r1.id]);
        expect(visibleReports(w, { role: 'bolum_sorumlu', personId: 'bs1' }).map(r => r.id)).toEqual([r1.id]);
        expect(visibleReports(w, { role: 'pyb_destek' })).toHaveLength(2);
    });
});

describe('format denetimi', () => {
    const base = { abbreviations: [], nextWeek: [newItem('plan', '13 Ekim 2026 tarihinde pilot kurulum yapılacak.')] };

    it('Türkçe harfle başlayan/biten belirsiz ve rutin ifadeler yakalanır (sözcük içinde değil)', () => {
        const codes = (t: string) => lintReport({ ...base, thisWeek: [newItem('ongoing', t)] }).map(i => i.code);
        expect(codes('Bazı modüllerde iyileştirme yapıldı.')).toContain('vague');
        expect(codes('Birkaç kurumla görüşüldü.')).toContain('vague');
        expect(codes('Çeşitli düzeltmeler yapıldı.')).toContain('vague');
        expect(codes('Ekip iç toplantı yaptı.')).toContain('routine');
        expect(codes('Bazılarıyla 7 Ekim 2026 tarihinde sözleşme imzalandı.')).not.toContain('vague');
    });

    it('kısaltma: sözlükte, raporda ya da satır içinde açılmamışsa hata', () => {
        expect(findAbbreviations('İG ile AR-GE ve SAP-42 için BİLGEM’de görüşüldü; Api değil')).toEqual(['İG', 'AR-GE', 'BİLGEM']);
        const issues = lintReport({ ...base, thisWeek: [newItem('customer_feature', 'MKS (Mesajlaşma Komuta Sistemi) için KYS entegrasyonu tamamlandı; 3 kurum kullanıyor.')] });
        expect(issues.filter(i => i.code === 'abbr').map(i => i.message)).toEqual([expect.stringContaining('“KYS”')]);
        const ok = lintReport({ ...base, abbreviations: [{ abbr: 'KYS', expansion: 'Kurumsal Yazışma Sistemi' }], thisWeek: [newItem('customer_feature', 'KYS entegrasyonu 2 Ekim 2026 tarihinde tamamlandı.')] });
        expect(ok.filter(i => i.code === 'abbr')).toHaveLength(0);
    });

    it('belirsiz, genel, rutin, uzun ve paragraf ifadeler uyarılır', () => {
        const codes = (text: string, cat: Parameters<typeof newItem>[0] = 'ongoing') => lintReport({ ...base, thisWeek: [newItem(cat, text)] }).map(i => i.code);
        expect(codes('Bazı müşterilerle yakında görüşülecek.')).toContain('vague');
        expect(codes('Bu hafta çalışmalara devam edildi.')).toContain('generic');
        expect(codes('Bu hafta Safir Posta’da multi-domain özelliğinin geliştirilmesine devam edildi.')).not.toContain('generic');
        expect(codes('Sprint planlama ve code review yapıldı, 12 bugfix kapatıldı.')).toContain('routine');
        expect(codes(Array.from({ length: 30 }, (_, i) => `sözcük${i}`).join(' ') + '.')).toContain('long');
        expect(codes('Bir. İki. Üç. Dört.')).toContain('paragraph');
        expect(codes('Hakediş faturası kesildi.', 'invoice')).toContain('figure');
        expect(codes('2. hakediş faturası (450.000 TL) 1 Ekim 2026 tarihinde kesildi.', 'invoice')).toEqual([]);
    });

    it('toplantı alanları zorunlu; boş rapor hata', () => {
        const m = newItem('meeting', '', { meeting: { date: '2026-09-10', place: 'BİLGEM', participants: 'Gebze Belediyesi', agenda: '', decisions: '' } });
        expect(lintReport({ ...base, thisWeek: [m] }).find(i => i.code === 'meeting')?.message).toBe('Toplantı için eksik: gündem, kararlar.');
        const free = newItem('meeting', "10 Eylül 2026 tarihinde BİLGEM'de Gebze Belediyesi'ne demo yapıldı. Pilot kararlaştırıldı.");
        expect(lintReport({ ...base, thisWeek: [free] }).find(i => i.code === 'meeting')?.level).toBe('warn');
        const empty = lintReport({ thisWeek: [], nextWeek: [], abbreviations: [] });
        expect(lintCounts(empty)).toEqual({ errors: 1, warnings: 1 });
    });
});

describe('toplantı cümlesi', () => {
    it('kılavuz örneğine yakın, Türkçe bulunma ekiyle', () => {
        expect(locative('BİLGEM')).toBe("BİLGEM'de");
        expect(locative('Ankara')).toBe("Ankara'da");
        expect(locative('Paris')).toBe("Paris'te");
        expect(locative('Gebze Belediyesi')).toBe("Gebze Belediyesi'nde");
        expect(locative('müşteri yerinde')).toBe('müşteri yerinde');
        expect(meetingSentence({
            date: '2026-09-10', place: 'BİLGEM', participants: 'Gebze Belediyesi; Ürün Yönetimi, Proje Yönetimi ve Mesajlaşma birimleri',
            agenda: 'Safir Posta tanıtım demosu', decisions: 'Belediyede on-prem 50 kişilik pilot kurulum yapılması kararlaştırıldı',
        })).toBe("10 Eylül 2026 tarihinde BİLGEM'de Safir Posta tanıtım demosu yapıldı (katılımcılar: Gebze Belediyesi; Ürün Yönetimi, Proje Yönetimi ve Mesajlaşma birimleri). Belediyede on-prem 50 kişilik pilot kurulum yapılması kararlaştırıldı.");
    });
});

describe('birleştirme ve çıktılar', () => {
    const ws = buildWs();
    const mk = (projectId: string | undefined, dept: string, stage: WeeklyReport['stage'], kind: WeeklyReport['kind'] = 'project') => ({
        ...createReport({ kind, projectId, departmentCode: dept, year: 2026, week: 41 }, py, NOW),
        stage,
        thisWeek: [newItem('delivery', `İG ile ${projectId || 'bölüm'} teslimatı 2 Ekim 2026 tarihinde yapıldı.`)],
        nextWeek: [newItem('plan', 'Kabul toplantısı 14 Ekim 2026.')],
    });
    const reports = [mk('a', 'U310', 'approved'), mk('b', 'U320', 'pyds_review'), mk(undefined, 'U310', 'approved', 'department')];
    const w = { ...ws, weeklyReports: reports };

    it('bölüm → proje gruplu; varsayılan yalnız onaylı', () => {
        const s = consolidate(w, 2026, 41);
        expect(s.map(x => x.code)).toEqual(['U310']);
        expect(s[0]).toMatchObject({ name: 'Yazılım', projects: [{ name: 'Safir Posta', code: 'P-100', pmName: 'Ayşe Yılmaz' }] });
        expect(s[0].additions?.kind).toBe('department');
        expect(consolidate(w, 2026, 41, ['approved', 'pyds_review']).map(x => x.code)).toEqual(['U310', 'U320']);
    });

    it('doluluk ve hatırlatılacak PY listesi (tamamlanan proje beklenmez)', () => {
        const p = weekProgress(w, 2026, 41);
        expect(p.find(x => x.code === 'U310')).toMatchObject({ expected: 1, missing: [] });
        expect(p.find(x => x.code === 'U320')?.byStage.pyds_review).toBe(1);
        const pending = pendingAuthors({ ...ws, weeklyReports: [] }, 2026, 41);
        expect(pending.map(x => [x.name, x.projects, x.email])).toEqual([['Ali Veli', ['Kurumsal Portal'], undefined], ['Ayşe Yılmaz', ['Safir Posta'], 'ayse@kurum.gov.tr']]);
    });

    it('metin/HTML: başlık, bölüm, proje ve kısaltma sözlüğü', () => {
        const s = consolidate(w, 2026, 41);
        const gl = glossaryFor(s.flatMap(x => [...x.projects.map(p => p.report), ...(x.additions ? [x.additions] : [])]), [{ abbr: 'İG', expansion: 'İş Geliştirme' }]);
        expect(gl).toEqual([{ abbr: 'İG', expansion: 'İş Geliştirme' }]);
        const text = renderReportText(s, gl, 2026, 41);
        expect(text).toContain('Haftalık Proje Raporu — 41. hafta (5–9 Ekim 2026)');
        expect(text).toContain('■ Yazılım (U310)');
        expect(text).toContain('▸ Safir Posta (P-100) — PY: Ayşe Yılmaz');
        expect(text).toContain('▸ Bölüm genel');
        expect(text).toContain('Kısaltmalar: İG: İş Geliştirme');
        const html = renderReportHtml(s, gl, 2026, 41);
        expect(html).toContain('<h2');
        expect(html).not.toContain('<script');
    });

    it('e-posta taslağı, mailto ve Teams bağlantıları', () => {
        const eml = buildEml({ to: ['mudur@kurum.gov.tr'], subject: 'Haftalık rapor — 41. hafta', html: '<p>ç</p>', text: 'ç' });
        expect(eml).toContain('X-Unsent: 1');
        expect(eml).toContain('To: mudur@kurum.gov.tr');
        expect(eml).toMatch(/Subject: =\?UTF-8\?B\?/);
        expect(mailtoLink({ bcc: ['a@x', 'b@y'], subject: 'Hatırlatma', body: 'x'.repeat(3000) }).length).toBeLessThan(2200);
        expect(teamsChatLink(['a@x', 'b@y'], 'Merhaba', 'Rapor')).toBe('https://teams.microsoft.com/l/chat/0/0?users=a%40x,b%40y&message=Merhaba&topicName=Rapor');
    });
});

describe('admin akış ayarları (reportSettings.flow)', () => {
    const rep = (kind: WeeklyReport['kind'], stage: WeeklyReport['stage']): WeeklyReport => ({ ...createReport({ kind, projectId: kind === 'project' ? 'a' : undefined, departmentCode: 'U310', year: 2026, week: 41 }, py, NOW), stage });

    it('kapalı onay adımı atlanır; iade bir önceki açık adıma döner', () => {
        const noBs = { ...DEFAULT_REPORT_FLOW, bsReview: false };
        const none = { ...DEFAULT_REPORT_FLOW, bsReview: false, pydsReview: false };
        expect(nextStage(rep('project', 'draft'), noBs)).toMatchObject({ stage: 'pyds_review', label: 'PYB desteğe gönder' });
        expect(nextStage(rep('project', 'draft'), none)).toMatchObject({ stage: 'approved', action: 'submit', label: 'Raporu gönder' });
        expect(nextStage(rep('project', 'bs_review'), { ...DEFAULT_REPORT_FLOW, pydsReview: false })).toMatchObject({ stage: 'approved', action: 'bs_approve' });
        expect(nextStage(rep('department', 'draft'), none)?.stage).toBe('approved');
        expect(returnStage(rep('project', 'pyds_review'), noBs)).toBe('draft');
        expect(returnStage(rep('project', 'approved'), { ...DEFAULT_REPORT_FLOW, pydsReview: false })).toBe('bs_review');
        expect(returnStage(rep('project', 'approved'), none)).toBe('draft');
        expect(returnStage(rep('project', 'approved'))).toBe('pyds_review'); // varsayılan
        expect(flowStages(noBs)).toEqual(['draft', 'pyds_review', 'approved']);
        expect(flowStages(DEFAULT_REPORT_FLOW, 'department')).toEqual(['draft', 'pyds_review', 'approved']);
    });

    it('gönderim kuralları: PY puanı ve geçen haftanın planı zorunlu olabilir', () => {
        const strict = { ...DEFAULT_REPORT_FLOW, requirePmScore: true, requirePlanReview: true };
        const plans = [newItem('plan', 'A yapılacak.'), newItem('plan', 'B yapılacak.')];
        const r = rep('project', 'draft');
        expect(flowBlockers(r, DEFAULT_REPORT_FLOW, plans)).toEqual([]);
        expect(flowBlockers(r, strict, plans)).toEqual(['Proje sağlığı puanı verilmeli', 'Geçen haftanın planından 2 madde değerlendirilmeli']);
        const ok = { ...r, pmScore: 7, planReview: setPlanReview(setPlanReview(undefined, plans[0], 'done'), plans[1], 'slipped') };
        expect(flowBlockers(ok, strict, plans)).toEqual([]);
        expect(flowBlockers({ ...r, stage: 'bs_review' }, strict, plans)).toEqual([]); // yalnız taslaktan gönderim
        expect(flowBlockers(rep('department', 'draft'), strict, plans)).toEqual([]);
    });

    it('saveReport akışı ve kuralları uygular', () => {
        const prev = { ...rep('project', 'approved'), id: 'prev', week: 40, nextWeek: [newItem('plan', '13 Ekim 2026 tarihinde kabul toplantısı yapılacak.')] };
        const ws = { ...buildWs(), weeklyReports: [prev], reportSettings: { ...DEFAULT_REPORT_SETTINGS, flow: { ...DEFAULT_REPORT_FLOW, bsReview: false, requirePlanReview: true } } };
        const id = { role: 'py' as const, personId: 'pm1' };
        expect(previousPlansOf(ws.weeklyReports, rep('project', 'draft'))).toHaveLength(1);
        const draft = { ...rep('project', 'draft'), thisWeek: [newItem('delivery', '3 Ekim 2026 tarihinde Gebze Belediyesine sürüm 2 teslim edildi.')] };
        expect(saveReport(ws, id, draft, py, { advance: true, now: NOW })).toBeNull(); // plan değerlendirilmedi
        const reviewed = { ...draft, planReview: setPlanReview(undefined, prev.nextWeek[0], 'done') };
        const saved = saveReport(ws, id, reviewed, py, { advance: true, now: NOW })!;
        expect(saved.report.stage).toBe('pyds_review'); // BS adımı kapalı
        const back = returnReportIn({ ...ws, weeklyReports: saved.reports }, { role: 'pyb_destek' }, saved.report.id, pyds, 'Düzeltin')!;
        expect(back.report.stage).toBe('draft');
    });
});

describe('akış işlemleri (yetki işlem anında)', () => {
    const good = [newItem('delivery', '3 Ekim 2026 tarihinde Gebze Belediyesine sürüm 2 teslim edildi.')];
    const plan = [newItem('plan', '13 Ekim 2026 tarihinde kabul toplantısı yapılacak.')];

    it('kaydet/gönder: sahibi açar, format hatası ve çift rapor engellenir', () => {
        const ws = { ...buildWs(), currentRole: 'py' as const, currentPersonId: 'pm1' };
        const id = { role: 'py' as const, personId: 'pm1' };
        expect(actorOf(ws)).toEqual({ role: 'py', personId: 'pm1', name: 'Ayşe Yılmaz' });
        const draft = { ...createReport({ kind: 'project', projectId: 'a', departmentCode: 'U310', year: 2026, week: 41 }, py, NOW), thisWeek: good, nextWeek: plan };
        expect(saveReport(ws, { role: 'py', personId: 'pm2' }, draft, py)).toBeNull();
        expect(saveReport(ws, id, { ...draft, thisWeek: [] }, py, { advance: true })).toBeNull();
        const saved = saveReport(ws, id, draft, py, { advance: true, now: NOW })!;
        expect(saved.report.stage).toBe('bs_review');
        expect(saved.from).toBe('draft');
        const ws2 = { ...ws, weeklyReports: saved.reports };
        expect(saveReport(ws2, id, { ...draft, id: 'baska' }, py)).toBeNull(); // aynı proje/hafta
        expect(saveReport(ws2, id, saved.report, py)).toBeNull(); // artık BS'de
        const bsSave = saveReport(ws2, { role: 'bolum_sorumlu', personId: 'bs1' }, saved.report, bs, { advance: true })!;
        expect(bsSave.report.stage).toBe('pyds_review');
        const ret = returnReportIn({ ...ws2, weeklyReports: bsSave.reports }, { role: 'pyb_destek' }, saved.report.id, pyds, 'Kısaltma açılmamış')!;
        expect(ret.report).toMatchObject({ stage: 'bs_review', returnNote: 'Kısaltma açılmamış' });
        expect(returnReportIn({ ...ws2, weeklyReports: bsSave.reports }, id, saved.report.id, py, 'x')).toBeNull();
    });

    it('PY puanı: sahip PY taslakta verir; geçersiz puan düşer; sonraki aşamada değiştirilemez', () => {
        const ws = { ...buildWs(), currentRole: 'py' as const, currentPersonId: 'pm1' };
        const id = { role: 'py' as const, personId: 'pm1' };
        const draft = { ...createReport({ kind: 'project', projectId: 'a', departmentCode: 'U310', year: 2026, week: 41 }, py, NOW), thisWeek: good, nextWeek: plan };
        const bad = saveReport(ws, id, { ...draft, pmScore: 11, pmScoreNote: 'x' }, py, { now: NOW })!;
        expect(bad.report.pmScore).toBeUndefined();
        expect(bad.report.pmScoreNote).toBeUndefined(); // puansız gerekçe tutulmaz
        const saved = saveReport(ws, id, { ...draft, pmScore: 7, pmScoreNote: '  Test ortamı gecikti.  ' }, py, { advance: true, now: NOW })!;
        expect(saved.report).toMatchObject({ pmScore: 7, pmScoreNote: 'Test ortamı gecikti.', stage: 'bs_review' });
        const ws2 = { ...ws, weeklyReports: saved.reports };
        const bsSave = saveReport(ws2, { role: 'bolum_sorumlu', personId: 'bs1' }, { ...saved.report, pmScore: 10, pmScoreNote: undefined }, bs)!;
        expect(bsSave.report).toMatchObject({ pmScore: 7, pmScoreNote: 'Test ortamı gecikti.' });
    });

    it('geçen haftanın planı içeriktir; AI değerlendirmesi kayıtla yazılamaz, yalnız PYB destek yazar', () => {
        const ws = { ...buildWs(), currentRole: 'py' as const, currentPersonId: 'pm1' };
        const id = { role: 'py' as const, personId: 'pm1' };
        const prevPlan = newItem('plan', '13 Ekim 2026 tarihinde kabul toplantısı yapılacak.');
        let review = setPlanReview(undefined, prevPlan, 'done');
        expect(review).toEqual([{ itemId: prevPlan.id, text: '13 Ekim 2026 tarihinde kabul toplantısı yapılacak.', status: 'done' }]);
        review = setPlanReview(review, prevPlan, 'partial');
        expect(review).toHaveLength(1);
        expect(setPlanReview(review, prevPlan, null)).toBeUndefined();

        const fake = { score: 10, rationale: 'x', evidence: [], signals: [], at: '', inputHash: '' };
        const draft = {
            ...createReport({ kind: 'project', projectId: 'a', departmentCode: 'U310', year: 2026, week: 41 }, py, NOW), thisWeek: good, nextWeek: plan,
            planReview: [...review!, { itemId: prevPlan.id, text: 'tekrar', status: 'done' as const }, { itemId: 'y', text: 'geçersiz', status: 'bilinmiyor' as never }],
            aiAssessment: fake,
        };
        const saved = saveReport(ws, id, draft, py, { now: NOW })!;
        expect(saved.report.planReview).toEqual([{ itemId: prevPlan.id, text: '13 Ekim 2026 tarihinde kabul toplantısı yapılacak.', status: 'partial' }]); // tekrar ve geçersiz atıldı
        expect(saved.report.aiAssessment).toBeUndefined();

        const ws2 = { ...ws, weeklyReports: saved.reports };
        expect(setReportAiAssessment(ws2, id, saved.report.id, fake)).toBeNull();
        expect(setReportAiAssessment(ws2, { role: 'pyb_sorumlu' }, saved.report.id, fake)).toBeNull();
        expect(setReportAiAssessment(ws2, { role: 'pyb_destek' }, 'yok', fake)).toBeNull();
        const withAi = setReportAiAssessment(ws2, { role: 'pyb_destek' }, saved.report.id, fake)!;
        expect(withAi[0].aiAssessment).toEqual(fake);
        // Sonraki kayıt değerlendirmeyi silmez
        const again = saveReport({ ...ws, weeklyReports: withAi }, id, { ...withAi[0], aiAssessment: undefined }, py, { now: NOW })!;
        expect(again.report.aiAssessment).toEqual(fake);
    });

    it('yayınla / kaldır yalnız PYB destek ve onaylı rapor varken', () => {
        const ws = buildWs();
        const r = { ...createReport({ kind: 'project', projectId: 'a', departmentCode: 'U310', year: 2026, week: 41 }, py, NOW), stage: 'approved' as const };
        expect(publishWeek(ws, { role: 'pyb_destek' }, 2026, 41, 'Destek')).toBeNull();
        const w = { ...ws, weeklyReports: [r] };
        expect(publishWeek(w, { role: 'mudur' }, 2026, 41, 'M')).toBeNull();
        const pubs = publishWeek(w, { role: 'pyb_destek' }, 2026, 41, 'Destek', NOW)!;
        expect(pubs).toEqual([{ year: 2026, week: 41, publishedAt: NOW.toISOString(), publishedByName: 'Destek' }]);
        expect(latestPublication({ weeklyPublications: pubs })?.week).toBe(41);
        expect(markWeekEmailed(pubs, 2026, 41, NOW)[0].emailedAt).toBe(NOW.toISOString());
        expect(unpublishWeek({ ...w, weeklyPublications: pubs }, { role: 'pyb_destek' }, 2026, 41)).toEqual([]);
    });

    it('sözlük, son gün ve hatırlatma metni', () => {
        const dict = reportDictionary({ ...DEFAULT_REPORT_SETTINGS, abbreviations: [{ abbr: 'KYS', expansion: 'Kurumsal Yazışma Sistemi' }, { abbr: 'İG', expansion: 'İş Geliştirme Birimi' }] });
        expect(dict.find(a => a.abbr === 'KYS')).toBeTruthy();
        expect(dict.find(a => a.abbr === 'İG')?.expansion).toBe('İş Geliştirme Birimi');
        expect(dueDate(2026, 41, 4).getDate()).toBe(8);
        const m = reminderText(2026, 41, 4, ['Safir Posta'], 'https://app');
        expect(m.text).toContain('(Safir Posta)');
        expect(m.text).toContain('8 Ekim Perşembe');
        expect(m.text).toContain('Rapor sayfası: https://app');
    });
});
