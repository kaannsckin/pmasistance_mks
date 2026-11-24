export interface CloudConnection {
    url: string;
    anonKey: string;
}

export const CLOUD_CONFIG_PATH = '/api/cloud/config';

/** Only keys intended for Supabase browser clients can be published or saved here. */
export const normalizeCloudConnection = (url: string, key: string): CloudConnection | null => {
    try {
        const parsed = new URL(url.trim());
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
        if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) return null;
        if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
        const anonKey = key.trim();
        if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(anonKey)) {
            const parts = anonKey.split('.');
            if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
            const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (claims?.role !== 'anon') return null;
        }
        return { url: parsed.href.replace(/\/+$/, ''), anonKey };
    } catch {
        return null;
    }
};
