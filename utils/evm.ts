import { Project, TaskStatus, WorkspaceData } from '../types';
import { MONTH_INDEXES } from './allocations';

/**
 * Kazanılmış Değer Yönetimi (EVM) + bütçe-gerçekleşen.
 * Maliyet = tahsis AA × ünvan aylık maliyeti (costing ile aynı temel).
 *
 *  BAC (Bütçe)         : yılın toplam planlı maliyeti
 *  PV  (Planlı Değer)  : durum ayına kadar planlanan maliyet (kümülatif)
 *  AC  (Gerçek Maliyet): durum ayına kadar gerçekleşen maliyet (kümülatif)
 *  EV  (Kazanılmış D.) : BAC × ilerleme% (görev tamamlanma ağırlığı)
 *  SV=EV−PV, CV=EV−AC ; SPI=EV/PV, CPI=EV/AC
 *  EAC=BAC/CPI, VAC=BAC−EAC, ETC=EAC−AC
 *
 * İlerleme% görevlerden gelir (efor-ağırlıklı; efor yoksa adet), böylece EV
 * gerçek AA'dan bağımsızdır ve CPI/SPI anlamlı olur.
 */

export interface ProjectEVM {
    projectId: string;
    projectName: string;
    costed: boolean; // maliyetlenebiliyor mu (bütçe ya da gerçek > 0)
    percentComplete: number; // 0..1
    statusMonth: number; // 1-12 (0 = henüz başlamadı)
    bac: number;
    pv: number;
    ev: number;
    ac: number;
    sv: number; // EV - PV (>0 önde, <0 geride)
    cv: number; // EV - AC (>0 bütçe altında, <0 aşımı)
    spi: number | null; // EV / PV
    cpi: number | null; // EV / AC
    eac: number; // tahmini toplam maliyet
    etc: number; // kalan tahmini
    vac: number; // BAC - EAC (>0 tasarruf, <0 aşım)
}

export interface PortfolioEVM {
    year: number;
    statusMonth: number;
    projects: ProjectEVM[];
    bac: number;
    pv: number;
    ev: number;
    ac: number;
    spi: number | null;
    cpi: number | null;
    eac: number;
    vac: number;
    costedTitleCount: number;
}

const round0 = (v: number): number => Math.round(v);
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Görev ilerlemesi: efor-ağırlıklı tamamlanma (efor yoksa adet bazlı) */
export const projectPercentComplete = (project: Project): number => {
    const tasks = project.tasks || [];
    if (tasks.length === 0) return 0;
    const w = (t: Project['tasks'][number]): number => Math.max(t.time?.avg ?? 0, 0);
    const totalW = tasks.reduce((s, t) => s + w(t), 0);
    if (totalW > 0) {
        const doneW = tasks.filter(t => t.status === TaskStatus.Done).reduce((s, t) => s + w(t), 0);
        return round2(doneW / totalW);
    }
    const done = tasks.filter(t => t.status === TaskStatus.Done).length;
    return round2(done / tasks.length);
};

/** Geçerli duruma göre varsayılan durum ayı (geçmiş yıl=12, gelecek=0) */
export const defaultStatusMonth = (year: number, now: Date = new Date()): number => {
    const cy = now.getFullYear();
    if (year < cy) return 12;
    if (year > cy) return 0;
    return now.getMonth() + 1;
};

const ratioOrNull = (num: number, den: number): number | null =>
    den > 1e-9 ? round2(num / den) : null;

export const buildProjectEVM = (
    ws: WorkspaceData,
    projectId: string,
    year: number,
    statusMonth: number,
): ProjectEVM => {
    const project = ws.projects.find(p => p.id === projectId);
    const projectName = project?.name || 'Bilinmeyen Proje';
    const rateByTitle = new Map(
        ws.titles.filter(t => (t.monthlyCost || 0) > 0).map(t => [t.code, t.monthlyCost as number])
    );
    const personById = new Map(ws.people.map(p => [p.id, p]));
    const sm = Math.max(0, Math.min(12, statusMonth));

    let bac = 0, pv = 0, ac = 0;
    ws.allocations.filter(a => a.projectId === projectId && a.year === year).forEach(a => {
        const person = personById.get(a.personId);
        if (!person || !person.titleCode) return;
        const rate = rateByTitle.get(person.titleCode);
        if (!rate) return;
        MONTH_INDEXES.forEach(m => {
            const planCost = (a.plan[m] || 0) * rate;
            const actualCost = (a.actual[m] || 0) * rate;
            bac += planCost;
            if (m <= sm) { pv += planCost; ac += actualCost; }
        });
    });

    const percentComplete = project ? projectPercentComplete(project) : 0;
    const ev = bac * percentComplete;
    const cpi = ratioOrNull(ev, ac);
    // EAC = BAC/CPI = BAC × AC / EV (ham değerlerden; yuvarlanmış CPI'dan değil)
    const eac = ac > 1e-9 && ev > 1e-9 ? bac * (ac / ev) : bac;

    return {
        projectId,
        projectName,
        costed: bac > 0 || ac > 0,
        percentComplete,
        statusMonth: sm,
        bac: round0(bac),
        pv: round0(pv),
        ev: round0(ev),
        ac: round0(ac),
        sv: round0(ev - pv),
        cv: round0(ev - ac),
        spi: ratioOrNull(ev, pv),
        cpi,
        eac: round0(eac),
        etc: round0(eac - ac),
        vac: round0(bac - eac),
    };
};

export const buildPortfolioEVM = (
    ws: WorkspaceData,
    year: number,
    projectIds?: string[],
    statusMonth?: number,
): PortfolioEVM => {
    const sm = statusMonth === undefined ? defaultStatusMonth(year) : Math.max(0, Math.min(12, statusMonth));
    const ids = projectIds ?? ws.projects.map(p => p.id);
    const projects = ids
        .map(id => buildProjectEVM(ws, id, year, sm))
        .filter(e => e.costed)
        .sort((a, b) => b.bac - a.bac);

    const bac = projects.reduce((s, p) => s + p.bac, 0);
    const pv = projects.reduce((s, p) => s + p.pv, 0);
    const ev = projects.reduce((s, p) => s + p.ev, 0);
    const ac = projects.reduce((s, p) => s + p.ac, 0);
    const cpi = ratioOrNull(ev, ac);
    const eac = ac > 1e-9 && ev > 1e-9 ? bac * (ac / ev) : bac;

    return {
        year,
        statusMonth: sm,
        projects,
        bac: round0(bac),
        pv: round0(pv),
        ev: round0(ev),
        ac: round0(ac),
        spi: ratioOrNull(ev, pv),
        cpi,
        eac: round0(eac),
        vac: round0(bac - eac),
        costedTitleCount: ws.titles.filter(t => (t.monthlyCost || 0) > 0).length,
    };
};
