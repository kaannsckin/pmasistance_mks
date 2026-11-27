import { TestBoardItem } from '../types';
import { AiAuthMode } from './ai/protocol';
import { fetchJiraSyncPage } from './integrations';
import { itemFromIssue } from './testBoard';

/** Kayıtlı filtreden en çok bu kadar sayfa (×100 kayıt) okunur */
export const TEST_MAX_PAGES = 20;

/** Kayıtlı filtredeki tüm kayıtlar (açık ve kapalı) */
export const fetchTestItems = async (filterId: string, authMode: AiAuthMode, signal?: AbortSignal, onProgress?: (n: number) => void): Promise<{ items: TestBoardItem[]; truncated: boolean }> => {
    const items: TestBoardItem[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < TEST_MAX_PAGES; page++) {
        const r = await fetchJiraSyncPage({ source: { filterId }, openOnly: false, cursor }, authMode, signal);
        items.push(...r.issues.map(itemFromIssue));
        onProgress?.(items.length);
        if (!r.next) return { items, truncated: false };
        cursor = r.next;
    }
    return { items, truncated: true };
};
