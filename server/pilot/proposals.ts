import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PendingProposal, ProposalStore, pruneProposals } from '../mcp/planasistan.js';

/**
 * Dosyada bekleyen öneriler: pilotta her `pilot arac` çağrısı ayrı bir süreçtir;
 * Claude'un uzun ömürlü MCP oturumundaki gibi "öneri → başka bir çağrıda onay"
 * akışı ancak öneriler süreçler arasında saklanırsa denenebilir. Dosyalar geçici
 * klasördedir (veri dalına girmez), veri dosyası ve persona başına ayrıdır.
 */
export const fileProposalStore = (path: string): ProposalStore => {
    const read = (): Record<string, PendingProposal> => {
        try { return JSON.parse(readFileSync(path, 'utf8')) as Record<string, PendingProposal>; } catch { return {}; }
    };
    const write = (m: Record<string, PendingProposal>) => {
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify(m));
        renameSync(tmp, path);
    };
    return {
        get: id => read()[id],
        set: (id, p) => { const m = read(); m[id] = p; write(m); },
        delete: id => { const m = read(); if (id in m) { delete m[id]; write(m); } },
        prune: t => {
            const m = read();
            const kept = Object.fromEntries(pruneProposals(Object.entries(m), t));
            if (Object.keys(kept).length !== Object.keys(m).length) write(kept);
        },
    };
};

/** Veri dosyası + persona için öneri dosyasının yolu */
export const proposalPath = (workspacePath: string, persona: string): string =>
    join(tmpdir(), 'planasistan-pilot-oneriler', createHash('sha1').update(resolve(workspacePath)).digest('hex').slice(0, 12), `${persona}.json`);
