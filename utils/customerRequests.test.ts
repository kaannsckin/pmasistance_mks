import { describe, expect, it } from 'vitest';
import { CustomerRequest, TaskStatus } from '../types';
import { createRequest, filterRequests, markConverted, requestCounts, rowsToRequests, taskDraftFromRequest } from './customerRequests';

const NOW = new Date('2026-10-06T10:00:00Z');

describe('rowsToRequests', () => {
    it('başlık, açıklama ve müşteri sütunlarını Türkçe/İngilizce başlıklardan bulur; boş başlıklı satırı atlar', () => {
        const { requests, error } = rowsToRequests([
            ['Talep Başlığı', 'Müşteri', 'Açıklama'],
            ['Yeni rapor', 'Bilgi İşlem', 'Aylık özet'],
            ['', 'X', 'boş başlık'],
            ['Giriş ekranı', '', ''],
        ], NOW);
        expect(error).toBeUndefined();
        expect(requests).toHaveLength(2);
        expect(requests[0]).toMatchObject({ title: 'Yeni rapor', customerName: 'Bilgi İşlem', description: 'Aylık özet', status: 'New', createdAt: NOW.toISOString() });
        expect(requests[1].customerName).toBe('Bilinmiyor');
        expect(new Set(requests.map(r => r.id)).size).toBe(2);
    });

    it('başlık sütunu yoksa ya da veri yoksa hata', () => {
        expect(rowsToRequests([['Müşteri'], ['A']]).error).toBe('"Başlık" sütunu bulunamadı.');
        expect(rowsToRequests([['Title']]).error).toMatch(/en az bir istek/);
    });
});

describe('süzme, sayım, dönüştürme', () => {
    const list: CustomerRequest[] = [
        { ...createRequest('Eski istek', 'Ali', 'lisans', new Date('2026-09-01')), id: 'r1' },
        { ...createRequest('Yeni istek', '', 'rapor', new Date('2026-10-01')), id: 'r2' },
        { ...createRequest('Red', 'Veli', '', new Date('2026-09-15')), id: 'r3', status: 'Rejected' },
    ];

    it('sayım ve süzgeç (en yeni başta)', () => {
        expect(requestCounts(list)).toEqual({ New: 2, Converted: 0, Rejected: 1, total: 3 });
        expect(filterRequests(list, 'New', '').map(r => r.id)).toEqual(['r2', 'r1']);
        expect(filterRequests(list, 'all', 'LİSANS').map(r => r.id)).toEqual(['r1']);
        expect(filterRequests(list, 'all', 'veli').map(r => r.id)).toEqual(['r3']);
    });

    it('istekten görev taslağı ve dönüşüm işareti', () => {
        const draft = taskDraftFromRequest({ ...list[0] }, 'Ayşe Yılmaz');
        expect(draft).toMatchObject({ name: 'Eski istek', status: TaskStatus.Backlog, version: 0, resourceName: 'Ayşe Yılmaz', notes: 'lisans\n\nTalep eden: Ali' });
        const next = markConverted(list, 'r1', draft.id);
        expect(next[0]).toMatchObject({ status: 'Converted', convertedTaskId: draft.id });
        expect(next[1].status).toBe('New');
    });
});
