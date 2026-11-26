import { ProjectSettings } from '../types';
import { TEST_DAYS, WORK_DAYS_PER_WEEK } from '../constants';

/**
 * Projenin sprint takvimi: tek kaynak. Yol haritası, otomatik plan, Plan ekranı,
 * tahsis ve takvim aynı değerleri buradan okur.
 *
 *  - Sprint süresi hafta olarak (1-6); yoksa 3.
 *  - Test günü 0 olabilir: "test sprint içinde" (sürekli geliştirme). Eskiden
 *    `|| 4` 0'ı 4'e çeviriyordu; haftalık sprintte kapasite 1 güne düşüyordu.
 *  - Paralel test: sonraki sprint testin bitmesini beklemez.
 */

export type TestMode = 'inside' | 'parallel' | 'separate';

export interface SprintCalendar {
    weeks: number;
    testDays: number;
    parallelTest: boolean;
    mode: TestMode;
    /** Sprint başına kişi geliştirme kapasitesi (iş günü, %100 katılım) */
    netDays: number;
    /** Sprintin takvimde kapladığı iş günü (geliştirme + sıralı test) */
    cycleDays: number;
}

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN;
    return Number.isNaN(n) ? fallback : Math.max(min, Math.min(max, n));
};

export const sprintCalendar = (s: Pick<ProjectSettings, 'sprintDuration' | 'globalTestDays' | 'parallelTest'> | undefined): SprintCalendar => {
    const weeks = clampInt(s?.sprintDuration, 1, 12, 3);
    const testDays = clampInt(s?.globalTestDays, 0, 20, TEST_DAYS);
    const parallelTest = !!s?.parallelTest && testDays > 0;
    const devDays = weeks * WORK_DAYS_PER_WEEK;
    return {
        weeks,
        testDays,
        parallelTest,
        mode: testDays === 0 ? 'inside' : parallelTest ? 'parallel' : 'separate',
        netDays: Math.max(0, devDays - testDays),
        cycleDays: parallelTest ? devDays : devDays + testDays,
    };
};

/** Kısa açıklama: "1 hafta · test sprint içinde" */
export const calendarLabel = (c: SprintCalendar): string =>
    `${c.weeks} hafta · ${c.mode === 'inside' ? 'test sprint içinde' : `${c.testDays} gün test${c.mode === 'parallel' ? ' (sonraki sprintle paralel)' : ''}`}`;

/** Hazır ritimler (takvim ayarında tek tıkla) */
export const CALENDAR_PRESETS: { id: string; label: string; hint: string; value: Pick<ProjectSettings, 'sprintDuration' | 'globalTestDays' | 'parallelTest'> }[] = [
    { id: 'continuous', label: 'Sürekli geliştirme', hint: '1 hafta, test sprint içinde', value: { sprintDuration: 1, globalTestDays: 0, parallelTest: false } },
    { id: 'two-weeks', label: 'İki haftalık', hint: '2 hafta, 2 gün paralel test', value: { sprintDuration: 2, globalTestDays: 2, parallelTest: true } },
    { id: 'classic', label: 'Klasik', hint: '3 hafta, ardından 4 gün test', value: { sprintDuration: 3, globalTestDays: 4, parallelTest: false } },
];
