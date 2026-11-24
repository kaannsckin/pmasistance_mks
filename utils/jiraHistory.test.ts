import { describe, expect, it } from 'vitest';
import { jiraBusinessHours, jiraLocalDay, summarizeJiraHistory, type JiraHistoryEntry } from './jiraHistory';

describe('Jira zaman damgaları ve durum geçmişi', () => {
    it('aynı çalışma kaydını seçilen saat diliminde doğru güne gruplar', () => {
        const at = '2026-11-23T23:15:00.000+0000';
        expect(jiraLocalDay(at)).toBe('2026-11-24');
        expect(jiraLocalDay(at, 'UTC')).toBe('2026-11-23');
        expect(jiraLocalDay('hatalı')).toBeUndefined();
    });

    it('yalnız iş saatlerini, arife yarım gününü ve resmî tatilleri sayar', () => {
        expect(jiraBusinessHours('2026-11-20T15:30:00+03:00', '2026-11-23T10:00:00+03:00')).toBe(2.5);
        expect(jiraBusinessHours('2026-10-28T10:00:00+03:00', '2026-10-30T10:00:00+03:00')).toBe(4);
        expect(jiraBusinessHours('2026-11-21T09:00:00+03:00', '2026-11-22T17:00:00+03:00')).toBe(0);
    });

    it('yeniden açılmayı sıralar, kapanan durum dahil ayrı çalışma aralıklarını birleştirir', () => {
        const status = (id: string, hour: string, from: string, to: string): JiraHistoryEntry => ({
            id, at: `2026-11-23T${hour}+03:00`, author: 'Ayşe',
            items: [{ field: 'status', from, fromString: from, to, toString: to }],
        });
        const records = [status('3', '15:00:00', 'Sürüyor', 'Kapandı'), status('2', '13:00:00', 'Kapandı', 'Sürüyor'), status('1', '11:00:00', 'Sürüyor', 'Kapandı')];
        records[1].items.push({ field: 'duedate', from: null, fromString: null, to: '2026-11-30', toString: null });
        const summary = summarizeJiraHistory(records, {
            created: '2026-11-23T09:00:00+03:00', resolved: '2026-11-23T15:00:00+03:00',
            current: 'Kapandı', at: '2026-11-24T09:00:00+03:00', isClosed: (_, label) => label === 'Kapandı',
        });
        expect(summary).toMatchObject({ reopenCount: 1, dueDateShifts: 1, timeInStatus: { 'Sürüyor': 4, 'Kapandı': 2 } });
    });
});
