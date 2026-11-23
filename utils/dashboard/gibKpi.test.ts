import { describe, expect, it } from 'vitest';
import { createProject } from '../workspace';
import { GIB_KPI_IDS, readMilestones, withGibKpis, withMilestoneVersions } from '../gibFindings';

describe('GİB aktarımı → dashboard göstergeleri', () => {
    it('ilk aktarım PoC skoru (başlangıç = GİB ilk skoru) ve zorunlu açık göstergelerini açar; sonraki aktarım ölçüm ekler', () => {
        let p = withGibKpis(createProject('Safir'), { pocScore: 0.4576, pocInitialScore: 0.4051, mandatoryOpen: 56, findings: 172 }, '2026-11-20');
        const score = p.kpis!.find(k => k.id === GIB_KPI_IDS.score)!;
        expect(score).toMatchObject({ name: 'PoC skoru', unit: 'percent', baseline: 40.5, source: 'import', points: [{ date: '2026-11-20', value: 45.8 }] });
        expect(p.kpis!.find(k => k.id === GIB_KPI_IDS.mandatory)).toMatchObject({ unit: 'number', higherIsBetter: false, target: 0, points: [{ value: 56 }] });
        // PY hedefi elle girer; sonraki aktarım hedefi ve geçmişi korur
        p = { ...p, kpis: p.kpis!.map(k => (k.id === GIB_KPI_IDS.score ? { ...k, target: 87.2 } : k)) };
        p = withGibKpis(p, { pocScore: 0.52, pocInitialScore: 0.4051, mandatoryOpen: 40, findings: 172 }, '2026-12-01');
        const after = p.kpis!.find(k => k.id === GIB_KPI_IDS.score)!;
        expect(after.target).toBe(87.2);
        expect(after.points.map(x => x.value)).toEqual([45.8, 52]);
        expect(p.kpis).toHaveLength(2);
    });

    it('skor yoksa gösterge açılmaz', () => {
        expect(withGibKpis(createProject('X'), { findings: 3 }, '2026-11-20').kpis).toBeUndefined();
    });

    it('Milestone sayfasındaki MS tarihleri sürüm olur; yeniden aktarımda tarih güncellenir', () => {
        const rows = [
            ['Milestone Planı'], [], ['Başlangıç tarihi', 46327],
            ['MS', 'Madde', 'EMS', 'İstemci', 'Toplam', 'MS süresi', 'Başlangıç', 'Bitiş', 'Kapsam'],
            [0, 85, 76.5, 40.5, 135.5, 17, 46328, 46350, 'Kimlik ve Oturum (11)'],
            [1, 33, 100, 25, 125, 20, 46351, 46378, ''],
            [5, 0, 0, 0, 0, 0, '', '', ''],
            ['Atanmamış', 0], ['Toplam', 172, 330.5, 96, 445, 70, 46328, 46426],
        ];
        const ms = readMilestones(rows);
        expect(ms).toEqual([
            { id: 'gib-ms0', name: 'MS0', startDate: '2026-11-02', releaseDate: '2026-11-24', status: 'unreleased', description: 'PoC Bulgu Takip › Milestone planı' },
            { id: 'gib-ms1', name: 'MS1', startDate: '2026-11-25', releaseDate: '2026-12-22', status: 'unreleased', description: 'PoC Bulgu Takip › Milestone planı' },
        ]);
        const p = withMilestoneVersions({ ...createProject('S'), versions: [{ id: 'v1', name: 'ms0', status: 'released' }] }, ms);
        expect(p.versions).toEqual([{ id: 'v1', name: 'ms0', status: 'released', startDate: '2026-11-02', releaseDate: '2026-11-24' }, ms[1]]);
    });
});
