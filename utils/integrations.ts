import { AiAuthMode } from './ai/protocol';
import { authHeaders } from './ai/client';
import { WorklogEntry } from '../types';

/**
 * Sunucu entegrasyonları (Jira worklog, Teams/e-posta bildirimi) için istemci.
 * Gizli bilgiler (Jira jetonu, SMTP parolası, Teams webhook) yalnız sunucu
 * ortam değişkenlerindedir; tarayıcı yalnızca neyin yapılandırıldığını bilir.
 */

const BASE = '/api/integrations';

export interface IntegrationHealth {
    jira: boolean;
    teams: boolean;
    email: boolean;
    reminder: boolean;
    authMode: AiAuthMode;
    unreachable?: boolean;
}

const OFFLINE: IntegrationHealth = { jira: false, teams: false, email: false, reminder: false, authMode: 'none', unreachable: true };

export const fetchIntegrationHealth = async (signal?: AbortSignal): Promise<IntegrationHealth> => {
    try {
        const res = await fetch(`${BASE}/health`, { signal, cache: 'no-store' });
        if (!res.ok) return OFFLINE;
        const j = await res.json() as Partial<IntegrationHealth>;
        return { jira: !!j.jira, teams: !!j.teams, email: !!j.email, reminder: !!j.reminder, authMode: j.authMode || 'none' };
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e;
        return OFFLINE;
    }
};

const post = async <T>(route: string, body: unknown, authMode: AiAuthMode): Promise<T> => {
    let res: Response;
    try {
        res = await fetch(`${BASE}/${route}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(await authHeaders(authMode)) },
            body: JSON.stringify(body),
        });
    } catch {
        throw new Error('Sunucuya ulaşılamadı.');
    }
    const j = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) {
        if (res.status === 401) throw new Error(authMode === 'token' ? 'Erişim kodu gerekli: AI asistan panelinden erişim kodunu girin.' : 'Oturum açmanız gerekiyor.');
        throw new Error(j.error || `İstek başarısız (${res.status}).`);
    }
    return j as T;
};

export const fetchJiraWorklogs = (o: { projectKey: string; from: string; to: string }, authMode: AiAuthMode): Promise<WorklogEntry[]> =>
    post<{ entries: WorklogEntry[] }>('jira-worklogs', o, authMode).then(r => r.entries || []);

export interface NotifyResult {
    teams?: string; // 'sent' | 'not_configured' | hata metni
    email?: string;
    rejected?: string[];
}

export const sendNotification = (
    o: { subject: string; text: string; html?: string; teams?: boolean; email?: { to?: string[]; bcc?: string[] } },
    authMode: AiAuthMode,
): Promise<NotifyResult> => post<NotifyResult>('notify', o, authMode);

/** Bildirim sonucunu kullanıcıya tek cümleyle anlatır */
export const describeNotify = (r: NotifyResult): { ok: boolean; text: string } => {
    const parts: string[] = [];
    let ok = true;
    const one = (label: string, v?: string) => {
        if (!v) return;
        if (v === 'sent') parts.push(`${label} gönderildi`);
        else if (v === 'not_configured') { ok = false; parts.push(`${label} sunucuda yapılandırılmadı`); }
        else { ok = false; parts.push(`${label} gönderilemedi: ${v}`); }
    };
    one('Teams', r.teams);
    one('E-posta', r.email);
    if (r.rejected?.length) parts.push(`kurum dışı adresler atlandı: ${r.rejected.join(', ')}`);
    return { ok, text: parts.length ? `${parts.join('; ')}.` : 'Gönderilecek kanal seçilmedi.' };
};
