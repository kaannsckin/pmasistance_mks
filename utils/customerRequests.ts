import { CustomerRequest, Task, TaskStatus } from '../types';

/** Müşteri istekleri: oluşturma, Excel/CSV içe aktarma, süzme ve göreve dönüştürme */

export type RequestStatus = CustomerRequest['status'];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
    New: 'Yeni',
    Converted: 'Göreve dönüştü',
    Rejected: 'Reddedildi',
};

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createRequest = (title: string, customerName: string, description: string, now: Date = new Date()): CustomerRequest => ({
    id: newId('req'),
    title: title.trim(),
    customerName: customerName.trim() || 'Bilinmiyor',
    description: description.trim(),
    createdAt: now.toISOString(),
    status: 'New',
});

const lower = (s: unknown) => String(s ?? '').toLocaleLowerCase('tr-TR');

/**
 * Tablo satırlarından (ilk satır başlık) istek listesi. Başlık sütunu zorunlu
 * ("başlık", "title" ya da "talep"); açıklama ve müşteri sütunları isteğe bağlı.
 */
export const rowsToRequests = (rows: unknown[][], now: Date = new Date()): { requests: CustomerRequest[]; error?: string } => {
    if (!rows || rows.length < 2) return { requests: [], error: 'Dosyada başlık satırı ve en az bir istek olmalı.' };
    const headers = rows[0].map(lower);
    const find = (...keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));
    const titleIdx = find('başlık', 'title', 'talep');
    const descIdx = find('açıklama', 'description', 'not');
    const customerIdx = find('müşteri', 'customer', 'kaynak');
    if (titleIdx === -1) return { requests: [], error: '"Başlık" sütunu bulunamadı.' };
    const requests = rows.slice(1)
        .filter(row => String(row[titleIdx] ?? '').trim())
        .map((row, i) => ({
            id: `${newId('req')}-${i}`,
            title: String(row[titleIdx]).trim(),
            description: descIdx !== -1 ? String(row[descIdx] ?? '').trim() : '',
            customerName: customerIdx !== -1 ? String(row[customerIdx] ?? '').trim() || 'Bilinmiyor' : 'Bilinmiyor',
            createdAt: now.toISOString(),
            status: 'New' as const,
        }));
    return { requests };
};

export const requestCounts = (list: CustomerRequest[]): Record<RequestStatus, number> & { total: number } => ({
    New: list.filter(r => r.status === 'New').length,
    Converted: list.filter(r => r.status === 'Converted').length,
    Rejected: list.filter(r => r.status === 'Rejected').length,
    total: list.length,
});

/** Durum ve arama süzgeci; en yeni başta */
export const filterRequests = (list: CustomerRequest[], status: RequestStatus | 'all', query: string): CustomerRequest[] => {
    const q = lower(query.trim());
    return list
        .filter(r => (status === 'all' || r.status === status) && (!q || [r.title, r.customerName, r.description].some(v => lower(v).includes(q))))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** İstekten görev taslağı (görev formu bununla açılır) */
export const taskDraftFromRequest = (r: CustomerRequest, resourceName: string): Task => ({
    id: newId('task'),
    name: r.title,
    status: TaskStatus.Backlog,
    version: 0,
    priority: 'Medium',
    unit: 'Müşteri',
    resourceName,
    time: { best: 0, avg: 0, worst: 0 },
    notes: [r.description, r.customerName && r.customerName !== 'Bilinmiyor' ? `Talep eden: ${r.customerName}` : ''].filter(Boolean).join('\n\n'),
    jiraId: '',
    availability: false,
    predecessor: null,
    includeInSprints: true,
});

/** Görev kaydedilince isteği "göreve dönüştü" olarak işaretler */
export const markConverted = (list: CustomerRequest[], requestId: string, taskId: string): CustomerRequest[] =>
    list.map(r => (r.id === requestId ? { ...r, status: 'Converted', convertedTaskId: taskId } : r));
