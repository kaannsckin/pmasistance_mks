import type { SupabaseClient } from '@supabase/supabase-js';
import { getClient, loadCloudConfig } from '../cloudSync';
import { compactOps, opToRow, rowToOp, WbOp, WbRow } from './collab';

/**
 * Whiteboard öğelerinin bulut deposu: `workspace_whiteboard_items` tablosu.
 * Her öğe (pano bilgisi, nesne, bağlantı, oy) ayrı satır; sunucudaki tetikleyici
 * yalnız daha yeni sürümü yazar (son yazan kazanır). Panolar proje satırına
 * yazılmaz: aynı panoda çalışan kişiler proje sürüm çakışması yaşamaz.
 */

export const WB_TABLE = 'workspace_whiteboard_items';

export interface WbCloud { client: SupabaseClient; workspaceId: string }

/** Bulut yapılandırılmış ve oturum açıksa istemci + çalışma alanı */
export const resolveWbCloud = async (): Promise<WbCloud | null> => {
    const config = loadCloudConfig();
    const client = getClient();
    if (!config?.workspaceId || !client) return null;
    try {
        const { data } = await client.auth.getSession();
        if (!data.session) return null;
    } catch { return null; }
    return { client, workspaceId: config.workspaceId };
};

const missingTable = (e: { code?: string; message?: string } | null): boolean =>
    !!e && (e.code === '42P01' || e.code === 'PGRST205' || /workspace_whiteboard_items/.test(e.message || ''));

export type WbLoad = { ok: true; ops: WbOp[] } | { ok: false; missingTable: boolean; message: string };

/**
 * Projenin pano öğeleri (RLS: yalnız görülebilen panolar). `items`: bir panonun
 * belirli öğeleri; `board`: bir panonun tümü; `metaOnly`: yalnız pano bilgileri.
 */
export const loadProjectItems = async (c: WbCloud, projectId: string, items?: { board: string; ids?: string[]; metaOnly?: boolean } | { metaOnly: true }): Promise<WbLoad> => {
    const all: WbRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
        let q = c.client.from(WB_TABLE).select('board_id,item_id,kind,data,deleted,rev_t,rev_by')
            .eq('workspace_id', c.workspaceId).eq('project_id', projectId);
        if (items && 'board' in items) q = q.eq('board_id', items.board);
        if (items && 'ids' in items && items.ids) q = q.in('item_id', items.ids);
        if (items?.metaOnly) q = q.eq('item_id', 'meta');
        const { data, error } = await q.order('rev_t', { ascending: true }).range(from, from + PAGE - 1);
        if (error) return { ok: false, missingTable: missingTable(error), message: error.message };
        all.push(...((data || []) as WbRow[]));
        if (!data || data.length < PAGE) break;
    }
    return { ok: true, ops: all.map(rowToOp).filter((o): o is WbOp => !!o) };
};

/**
 * Op'ları satır olarak yazar (aynı öğenin yalnız son hâli; 200'lük parçalar).
 * Pano bilgisi satırları önce yazılır: sunucu sahipliği ve erişimi bu satırdan
 * okur (yeni panonun nesneleri, pano açıldıktan sonra yazılabilir).
 */
export const saveOps = async (c: WbCloud, projectId: string, ops: WbOp[]): Promise<string | null> => {
    const all = compactOps(ops).map(op => opToRow(op, c.workspaceId, projectId));
    const groups = [all.filter(r => r.kind === 'meta'), all.filter(r => r.kind !== 'meta')];
    for (const rows of groups) {
        for (let i = 0; i < rows.length; i += 200) {
            const { error } = await c.client.from(WB_TABLE).upsert(rows.slice(i, i + 200), { onConflict: 'workspace_id,board_id,item_id' });
            if (error) {
                if (missingTable(error)) return 'Bulutta whiteboard tablosu yok: supabase/schema.sql dosyasını yeniden çalıştırın.';
                if (error.code === '42501' || /row-level security/i.test(error.message)) return `Bu panoya yazma yetkiniz yok (${error.message}).`;
                return error.message;
            }
        }
    }
    return null;
};
