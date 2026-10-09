import { AiAuthMode } from './ai/protocol';
import { authHeaders } from './ai/client';
import { WorklogEntry } from '../types';

/**
 * Sunucu entegrasyonları (Jira worklog ve kayıt geçmişi, Teams/e-posta bildirimi) için istemci.
 * Gizli bilgiler (Jira jetonu, SMTP parolası, Teams webhook) yalnız sunucu
 * ortam değişkenlerindedir; tarayıcı yalnızca neyin yapılandırıldığını bilir.
 */

const BASE = '/api/integrations';

export interface IntegrationHealth {
    jira: boolean;
    /** Jira'da kayıt açma sunucuda açık mı (JIRA_ALLOW_CREATE) */
    jiraCreate: boolean;
    teams: boolean;
    email: boolean;
    reminder: boolean;
    authMode: AiAuthMode;
    unreachable?: boolean;
}

const OFFLINE: IntegrationHealth = { jira: false, jiraCreate: false, teams: false, email: false, reminder: false, authMode: 'none', unreachable: true };

export const fetchIntegrationHealth = async (signal?: AbortSignal): Promise<IntegrationHealth> => {
    try {
        const res = await fetch(`${BASE}/health`, { signal, cache: 'no-store' });
        if (!res.ok) return OFFLINE;
        const j = await res.json() as Partial<IntegrationHealth>;
        return { jira: !!j.jira, jiraCreate: !!j.jiraCreate, teams: !!j.teams, email: !!j.email, reminder: !!j.reminder, authMode: j.authMode || 'none' };
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

/** Sunucunun döndürdüğü sadeleştirilmiş Jira kaydı (bkz. server/integrations/handler.ts) */
export interface JiraIssueRecord {
    key: string;
    summary: string;
    description: string;
    issueType: string;
    status: string;
    statusCategory: 'new' | 'indeterminate' | 'done' | null;
    priority: string;
    created: string | null;
    resolved: string | null;
    components: string[];
    labels: string[];
    fixVersions: string[];
    originalEstimateSeconds: number | null;
    timeSpentSeconds: number | null;
    storyPoints: number | null;
    assignee: string;
    blockedBy: string[];
    transitions: { at: string; from: string; to: string; fromCategory: JiraIssueRecord['statusCategory']; toCategory: JiraIssueRecord['statusCategory'] }[];
}

export interface JiraIssuePage {
    issues: JiraIssueRecord[];
    total: number | null;
    next: string | null;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Durduruldu', 'AbortError')); }, { once: true });
});

/** Jira kayıt geçmişinden bir sayfa; hız sınırına takılırsa bekleyip yeniden dener */
export const fetchJiraIssuesPage = async (
    o: { projectKey: string; scope: 'done' | 'all'; since?: string; cursor?: string | null },
    authMode: AiAuthMode,
    signal?: AbortSignal,
): Promise<JiraIssuePage> => {
    for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
            res = await fetch(`${BASE}/jira-issues`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...(await authHeaders(authMode)) },
                body: JSON.stringify({ projectKey: o.projectKey, scope: o.scope, since: o.since, cursor: o.cursor ?? undefined }),
                signal,
            });
        } catch (e) {
            if ((e as Error)?.name === 'AbortError') throw e;
            throw new Error('Sunucuya ulaşılamadı.');
        }
        if (res.status === 429 && attempt < 3) {
            await sleep(Math.min(60, Number(res.headers.get('retry-after')) || 5) * 1000, signal);
            continue;
        }
        const j = await res.json().catch(() => ({})) as Partial<JiraIssuePage> & { error?: string };
        if (!res.ok) {
            if (res.status === 401) throw new Error(authMode === 'token' ? 'Erişim kodu gerekli: AI asistan panelinden erişim kodunu girin.' : 'Oturum açmanız gerekiyor.');
            throw new Error(j.error || `İstek başarısız (${res.status}).`);
        }
        return { issues: j.issues || [], total: typeof j.total === 'number' ? j.total : null, next: j.next || null };
    }
};

/** Jira'da açılacak kayıt (uygulama alanları; Jira adlarıyla sunucuda eşlenir) */
export interface JiraCreateInput {
    ref: string;
    summary: string;
    description?: string;
    issueType?: string;
    priority?: string;
    component?: string;
    estimateHours?: number;
}
export interface JiraCreateResult {
    ref: string;
    key?: string;
    error?: string;
    dropped?: string[];
}

/** Kayıtları Jira'da açar (en çok 50); her kayıt için anahtar ya da hata döner. Hız sınırında bekleyip yeniden dener. */
export const createJiraIssues = async (projectKey: string, issues: JiraCreateInput[], authMode: AiAuthMode, signal?: AbortSignal): Promise<JiraCreateResult[]> => {
    for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
            res = await fetch(`${BASE}/jira-create`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...(await authHeaders(authMode)) },
                body: JSON.stringify({ projectKey, issues }),
                signal,
            });
        } catch (e) {
            if ((e as Error)?.name === 'AbortError') throw e;
            throw new Error('Sunucuya ulaşılamadı.');
        }
        // 429 kayıt açılmadan döner: beklemek güvenli
        if (res.status === 429 && attempt < 3) {
            await sleep(Math.min(60, Number(res.headers.get('retry-after')) || 5) * 1000, signal);
            continue;
        }
        const j = await res.json().catch(() => ({})) as { results?: JiraCreateResult[]; error?: string };
        if (!res.ok) {
            if (res.status === 401) throw new Error(authMode === 'token' ? 'Erişim kodu gerekli: AI asistan panelinden erişim kodunu girin.' : 'Oturum açmanız gerekiyor.');
            throw new Error(j.error || `İstek başarısız (${res.status}).`);
        }
        return j.results || [];
    }
};

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
