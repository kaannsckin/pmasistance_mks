import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { TaskStatus, WorkspaceData } from '../../types.js';
import type { JsonSchema } from '../../utils/ai/protocol.js';
import { ROLE_LABELS } from '../../utils/allocations.js';
import { parseImportedJson, serializeWorkspace } from '../../utils/workspace.js';
import { createPlanAsistanMcp, APPLY_TOOL, STATUS_TOOL } from '../mcp/planasistan.js';
import { createMcpHandler } from '../mcp/protocol.js';
import { fileSource, WorkspaceSource } from '../mcp/source.js';
import { fetchJiraIssuesPage, fetchJiraWorklogs } from '../integrations/handler.js';
import { mockJiraFromDir, PILOT_JIRA_ENV, SearchResponse } from './mockJira.js';
import { fileProposalStore, proposalPath } from './proposals.js';
import { fullName, Persona, PERSONAS, personById } from './world.js';

/**
 * Pilot kontrolleri (2. rutinin ilk adımı): beş pilot kullanıcısının
 * kimliğiyle MCP araçları çağrılır ve sonuçlar uygulama verisinden bağımsız
 * hesaplanan değerlerle karşılaştırılır — kapsam, gizlilik, sayı tutarlılığı,
 * değişiklik akışı. Yapay zekâ gerektirmez; her gün aynı şekilde çalışır.
 */

export type CheckStatus = 'GEÇTİ' | 'KALDI' | 'UYARI';
export interface CheckResult { ad: string; durum: CheckStatus; ayrinti: string }

export interface CallResult { isError: boolean; text: string; json: Record<string, unknown> }

// Aynı Jira klasörü için tek sahte Jira (dosya önbelleği paylaşılır)
const jiras = new Map<string, typeof fetch>();
export const pilotJira = (jiraDir: string) => {
    let f = jiras.get(jiraDir);
    if (!f) { f = mockJiraFromDir(jiraDir); jiras.set(jiraDir, f); }
    return { env: PILOT_JIRA_ENV, fetchImpl: f };
};

export type AddCheck = (ad: string, ok: boolean | 'uyari', ayrinti: string) => void;

/**
 * Pilot verisinin durduğu yer: JSON dosyası ya da Supabase (cloud.ts). Araç
 * çağrıları, kontroller ve CLI aynı arayüzle iki kaynağı da kullanır.
 */
export interface PilotTarget {
    /** Sunucu önbelleği ve öneri dosyası anahtarı */
    key: string;
    kind: 'file' | 'supabase';
    /** Sahte Jira dışa aktarımlarının klasörü */
    jiraDir: string;
    /** Personanın MCP veri kaynağı */
    source: (persona: Persona, writable: boolean) => WorkspaceSource;
    /** Rol MCP ayarında açıkça verilir (dosya) ya da bulut üyeliğinden gelir */
    explicitRole: boolean;
    /** Bağımsız hesap için verinin tamamı (notlar dahil) */
    readAll: () => Promise<WorkspaceData>;
    /** dist-mcp paketini stdio üzerinden denerken MCP ortam değişkenleri */
    stdioEnv: (persona: Persona) => Record<string, string>;
    /** Kaynağa özgü ek kontroller (bulutta RLS ve üyelikler) */
    extraChecks?: (add: AddCheck, ws: WorkspaceData) => Promise<void>;
}

export const fileTarget = (path: string, jiraDir = join(dirname(path), 'jira')): PilotTarget => ({
    key: resolve(path),
    kind: 'file',
    jiraDir,
    source: (_persona, writable) => fileSource(path, undefined, { writable }),
    explicitRole: true,
    readAll: async () => {
        const parsed = parseImportedJson(await readFile(path, 'utf8'));
        if (parsed.kind !== 'workspace') throw new Error(`${path} okunamadı`);
        return parsed.workspace;
    },
    stdioEnv: p => ({ PLANASISTAN_WORKSPACE_FILE: path, PLANASISTAN_ROLE: p.role, PLANASISTAN_PERSON: fullName(personById(p.personId)) }),
});

const asTarget = (t: PilotTarget | string): PilotTarget => (typeof t === 'string' ? fileTarget(t) : t);

/** Persona için MCP sunucusu ayarları: veri kaynağı, kimlik, (pilot için) yazma ve sahte Jira */
export const personaOptions = (persona: Persona, target: PilotTarget | string, writable: boolean, now?: Date) => {
    const t = asTarget(target);
    return {
        source: t.source(persona, writable),
        ...(t.explicitRole ? { role: persona.role } : {}),
        person: fullName(personById(persona.personId)),
        project: persona.project,
        allowWrite: writable,
        jira: pilotJira(t.jiraDir),
        // Öneri bir çağrıda, onay başka bir çağrıda (ayrı süreç) yapılabilsin
        proposals: fileProposalStore(proposalPath(t.key, persona.id)),
        ...(now ? { now: () => now } : {}),
    };
};

/** Kontrollerin "bugün"ü (testlerde sabitlenir); araçlar ve bağımsız hesap aynı günü kullanır */
let clock: Date | undefined;

// Aynı persona + kaynak için tek sunucu örneği (veri değişince kaynak yeniden okur)
const handlers = new Map<string, ReturnType<typeof createMcpHandler>>();
const handlerFor = (persona: Persona, target: PilotTarget, writable: boolean) => {
    const key = `${persona.id}|${target.kind}|${target.key}|${target.jiraDir}|${writable}|${clock?.getTime() ?? ''}`;
    let h = handlers.get(key);
    if (!h) {
        h = createMcpHandler(createPlanAsistanMcp(personaOptions(persona, target, writable, clock)));
        handlers.set(key, h);
    }
    return h;
};

let nextId = 1;

/** Bir MCP aracını persona kimliğiyle, JSON-RPC katmanı üzerinden çağırır; confirm: öneriyse hemen uygular */
export const callAs = async (persona: Persona, target: PilotTarget | string, name: string, args: Record<string, unknown> = {}, o: { writable?: boolean; confirm?: boolean } = {}): Promise<CallResult[]> => {
    const handle = handlerFor(persona, asTarget(target), !!o.writable);
    const call = async (tool: string, a: Record<string, unknown>): Promise<CallResult> => {
        const res = await handle({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: tool, arguments: a } }) as { result?: { content: { text: string }[]; isError?: boolean }; error?: { message: string } };
        if (res.error) return { isError: true, text: JSON.stringify({ protokol_hatasi: res.error.message }), json: { protokol_hatasi: res.error.message } };
        const text = res.result!.content[0]?.text || '';
        let json: Record<string, unknown> = {};
        try { json = JSON.parse(text); } catch { json = { metin: text }; }
        return { isError: !!res.result!.isError, text, json };
    };
    const first = await call(name, args);
    if (!o.confirm || first.isError || typeof first.json.oneri_id !== 'string') return [first];
    return [first, await call(APPLY_TOOL, { oneri_id: first.json.oneri_id })];
};

export const listToolsAs = async (persona: Persona, target: PilotTarget | string, writable = true): Promise<{ name: string; title?: string; description: string; readOnly: boolean; inputSchema: JsonSchema }[]> => {
    const res = await handlerFor(persona, asTarget(target), writable)({ jsonrpc: '2.0', id: nextId++, method: 'tools/list' }) as { result: { tools: { name: string; title?: string; description: string; inputSchema: JsonSchema; annotations?: { readOnlyHint?: boolean } }[] } };
    return res.result.tools.map(t => ({ name: t.name, title: t.title, description: t.description, readOnly: t.annotations?.readOnlyHint !== false, inputSchema: t.inputSchema }));
};

const persona = (id: string): Persona => PERSONAS.find(p => p.id === id)!;
const r2 = (v: number) => Math.round(v * 100) / 100;
const todayIso = (d: Date) => d.toISOString().slice(0, 10);

// Ağ erişimi için alt sürece geçen ortam (vekil sunucu ve sertifikalar); kimlik bilgisi geçmez
const NETWORK_ENV = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'NODE_USE_ENV_PROXY', 'SSL_CERT_FILE'];

/** dist-mcp paketini gerçek stdio üzerinden dener (Claude Desktop'ın yaptığı gibi) */
const stdioSmoke = (bundle: string, mcpEnv: Record<string, string>): Promise<CheckResult> => new Promise(resolve => {
    const net = Object.fromEntries(NETWORK_ENV.filter(k => process.env[k]).map(k => [k, process.env[k]!]));
    const child = spawn(process.execPath, [bundle], { env: { PATH: process.env.PATH, ...net, ...mcpEnv }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const ad = 'stdio bağlantısı (dist-mcp)';
    const done = (r: CheckResult) => { clearTimeout(timer); child.kill(); resolve(r); };
    const timer = setTimeout(() => done({ ad, durum: 'KALDI', ayrinti: '30 sn içinde yanıt yok' }), 30_000);
    child.on('error', e => done({ ad, durum: 'KALDI', ayrinti: e.message }));
    child.stdout.on('data', d => {
        out += d;
        const lines = out.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } });
        const list = lines.find(m => m?.id === 2);
        const status = lines.find(m => m?.id === 3);
        if (!list || !status) return;
        const n = list.result?.tools?.length || 0;
        let s: Record<string, unknown> = {};
        try { s = JSON.parse(status.result?.content?.[0]?.text || '{}'); } catch { /* aşağıda KALDI */ }
        if (n <= 10) done({ ad, durum: 'KALDI', ayrinti: `araç listesi beklenenden kısa: ${n}` });
        else if (s.durum !== 'bağlı') done({ ad, durum: 'KALDI', ayrinti: `${n} araç; veri bağlantısı yok: ${String(s.hata || status.error?.message || 'yanıt okunamadı').slice(0, 200)}` });
        else done({ ad, durum: 'GEÇTİ', ayrinti: `${n} araç · ${(s.kimlik as { rol?: string } | undefined)?.rol} · ${s.kaynak}` });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: STATUS_TOOL, arguments: {} } })}\n`);
});

export const runChecks = async (target: PilotTarget | string, o: { bundle?: string; now?: Date } = {}): Promise<CheckResult[]> => {
    const results: CheckResult[] = [];
    const add: AddCheck = (ad, ok, ayrinti) => results.push({ ad, durum: ok === 'uyari' ? 'UYARI' : ok ? 'GEÇTİ' : 'KALDI', ayrinti });
    const t = asTarget(target);
    let ws: WorkspaceData;
    try {
        ws = await t.readAll();
    } catch (e) {
        return [{ ad: 'pilot verisi', durum: 'KALDI', ayrinti: (e as Error).message }];
    }
    const now = o.now || new Date();
    clock = o.now;
    const sicils = ws.people.map(p => p.sicil).filter((s): s is string => !!s && s.length >= 3);
    const leaks = new Set<string>();
    const scan = (persona: string, tool: string, text: string) => { if (sicils.some(s => text.includes(s))) leaks.add(`${persona}/${tool}`); };

    if (o.bundle) results.push(await stdioSmoke(o.bundle, t.stdioEnv(persona('ahmet'))));
    else add('stdio bağlantısı (dist-mcp)', 'uyari', 'dist-mcp/planasistan-mcp.mjs yok; npm run build:mcp çalıştırılmadı');

    // 1. Her persona: bağlantı ve tüm okuma araçları beklenmeyen hata vermeden çalışıyor mu
    for (const p of PERSONAS) {
        const status = (await callAs(p, t, STATUS_TOOL, {}, { writable: true }))[0];
        const kimlik = status.json.kimlik as { rol: string; kisi?: string; kaynak?: string } | undefined;
        const connected = status.json.durum === 'bağlı';
        add(`${p.id}: bağlantı ve kimlik`, connected && kimlik?.rol === ROLE_LABELS[p.role], connected
            ? `${kimlik?.rol}${kimlik?.rol === ROLE_LABELS[p.role] ? '' : ` (beklenen ${ROLE_LABELS[p.role]})`} · ${kimlik?.kisi || '-'} · ${status.json.gorunur_proje} proje · değişiklik ${String(status.json.degisiklik).startsWith('açık') ? 'açık' : 'kapalı'} · ${status.json.kaynak}`
            : String(status.json.hata));
        if (!connected) continue;
        const tools = await listToolsAs(p, t, false);
        const read = tools.filter(t => t.readOnly && !t.name.startsWith('oner_') && t.name !== STATUS_TOOL);
        const crashed: string[] = [];
        const refused: string[] = [];
        for (const tool of read) {
            const args = tool.name === 'bilgi_ara' ? { sorgu: 'test planı' } : tool.name === 'gorev_ara' ? { metin: 'hata' } : {};
            if (tool.name === 'jira_aktar') continue; // yazma akışı aşağıda ayrıca denenir
            const r = (await callAs(p, t, tool.name, args))[0];
            scan(p.id, tool.name, r.text);
            if (r.text.includes('beklenmeyen bir hata') || r.json.protokol_hatasi) crashed.push(tool.name);
            else if (r.isError) refused.push(tool.name);
        }
        add(`${p.id}: ${read.length} okuma aracı`, crashed.length === 0, crashed.length
            ? `beklenmeyen hata: ${crashed.join(', ')}`
            : `hepsi çalıştı${refused.length ? `; parametre/kapsam nedeniyle yanıt vermeyen: ${refused.join(', ')}` : ''}`);
    }

    // 2. Kapsam: PY yalnız kendi projelerini görür
    for (const p of PERSONAS.filter(x => x.role === 'py')) {
        const r = (await callAs(p, t, 'proje_listesi'))[0];
        const seen = ((r.json.projeler || []) as { ad: string }[]).map(x => x.ad).sort();
        const own = ws.projects.filter(x => x.pmPersonId === p.personId).map(x => x.name).sort();
        add(`${p.id}: yalnız kendi projeleri`, JSON.stringify(seen) === JSON.stringify(own), `görülen: ${seen.join(', ') || '-'}`);
        const other = ws.projects.find(x => x.pmPersonId && x.pmPersonId !== p.personId);
        if (other) {
            const d = (await callAs(p, t, 'proje_detayi', { proje: other.code || other.name }))[0];
            add(`${p.id}: başkasının projesi engellenir`, d.isError, d.isError ? String(d.json.hata) : `${other.name} içeriği döndü!`);
        }
    }

    // 3. Gizlilik: müdüre not/istek araçları sunulmaz, bilgi aramasında notlar çıkmaz
    const ahmet = persona('ahmet');
    const mTools = (await listToolsAs(ahmet, t)).map(t => t.name);
    add('ahmet: not ve istek araçları yok', !mTools.includes('notlari_ara') && !mTools.includes('musteri_istekleri'), mTools.filter(n => ['notlari_ara', 'musteri_istekleri'].includes(n)).join(', ') || 'sunulmadı');
    const mNote = (await callAs(ahmet, t, 'bilgi_ara', { sorgu: 'toplantı karar', kaynak: 'not' }))[0];
    add('ahmet: notlarda arama engellenir', mNote.isError, mNote.isError ? String(mNote.json.hata) : 'not içeriği döndü!');
    add('ahmet: değişiklik araçları yok', !mTools.some(n => n.startsWith('oner_') || n === APPLY_TOOL || n === 'jira_aktar'), 'müdür veri girmez');

    // 4. Sayı tutarlılığı: araç sonuçları ↔ veriden doğrudan hesap
    const mert = persona('mert');
    const list = (await callAs(mert, t, 'proje_listesi'))[0];
    const today = todayIso(now);
    const mismatches: string[] = [];
    ((list.json.projeler || []) as { ad: string; gorev: { toplam: number; tamamlanan: number; geciken: number } }[]).forEach(row => {
        const prj = ws.projects.find(x => x.name === row.ad);
        if (!prj) { mismatches.push(`${row.ad}: veride yok`); return; }
        const done = prj.tasks.filter(t => t.status === TaskStatus.Done).length;
        const late = prj.tasks.filter(t => t.dueDate && t.status !== TaskStatus.Done && t.dueDate.slice(0, 10) < today).length;
        if (row.gorev.toplam !== prj.tasks.length || row.gorev.tamamlanan !== done || row.gorev.geciken !== late) {
            mismatches.push(`${row.ad}: araç ${row.gorev.toplam}/${row.gorev.tamamlanan}/${row.gorev.geciken}, veri ${prj.tasks.length}/${done}/${late}`);
        }
    });
    add('görev sayıları (toplam/tamamlanan/geciken)', mismatches.length === 0, mismatches.join('; ') || `${ws.projects.length} proje tutarlı`);
    const year = now.getFullYear();
    const planGaps: string[] = [];
    for (const prj of ws.projects) {
        const d = (await callAs(mert, t, 'proje_detayi', { proje: prj.code || prj.name }))[0];
        const toolPlan = Number((d.json.tahsis as { plan_aa?: number } | undefined)?.plan_aa);
        const direct = r2(ws.allocations.filter(a => a.projectId === prj.id && a.year === year).reduce((s, a) => s + Object.values(a.plan).reduce((x, y) => x + (y || 0), 0), 0));
        if (!Number.isFinite(toolPlan) || Math.abs(toolPlan - direct) > 0.011) planGaps.push(`${prj.name}: araç ${toolPlan}, veri ${direct}`);
    }
    add(`tahsis plan toplamları (${year})`, planGaps.length === 0, planGaps.join('; ') || 'tüm projelerde tutarlı');
    const capacity = (await callAs(mert, t, 'kapasite_talep', { yil: year, sadece_acik: false }))[0];
    add('kapasite_talep: talep rollerle eşleşiyor (rolsüz tahsis yok)', !capacity.isError && !capacity.json.uyari, String(capacity.json.uyari || capacity.json.hata || `${(capacity.json.satirlar as unknown[] | undefined)?.length ?? 0} rol satırı`).slice(0, 180));
    const unknownArg = (await callAs(mert, t, 'gorev_ara', { gecikme: true }))[0];
    add('bilinmeyen parametre sessizce yok sayılmaz', unknownArg.isError && /geciken/.test(unknownArg.text), String(unknownArg.json.hata || unknownArg.text).slice(0, 160));

    // 5. Sahte Jira ↔ uygulamanın Jira istemcisi (gerçek Jira'yla aynı uçlar ve biçim)
    const jiraDir = t.jiraDir;
    const jira = pilotJira(jiraDir);
    const exportsByKey: Record<string, SearchResponse> = {};
    for (const prj of ws.projects.filter(x => x.jiraProjectKey)) {
        try { exportsByKey[prj.jiraProjectKey!] = JSON.parse(await readFile(join(jiraDir, `${prj.jiraProjectKey}.json`), 'utf8')); } catch { /* dışa aktarım yok */ }
    }
    const keys = Object.keys(exportsByKey);
    if (!keys.length) add('Jira dışa aktarımları', false, `${jiraDir} içinde proje dışa aktarımı yok (1. rutin çalışmamış)`);
    else {
        const gaps: string[] = [];
        for (const key of keys) {
            const got: unknown[] = [];
            let cursor: string | undefined;
            for (let page = 0; page < 60; page++) {
                const r = await fetchJiraIssuesPage(jira.env, { projectKey: key, scope: 'all', cursor, pageSize: 50 }, jira.fetchImpl);
                got.push(...r.issues);
                if (!r.next) break;
                cursor = r.next;
            }
            if (got.length !== exportsByKey[key].total) gaps.push(`${key}: istemci ${got.length}, dışa aktarım ${exportsByKey[key].total}`);
        }
        add('Jira: uygulamanın istemcisi sahte Jira\'yı sayfa sayfa eksiksiz okur', gaps.length === 0, gaps.join('; ') || keys.map(k => `${k} ${exportsByKey[k].total}`).join(', '));
        const key = keys[0];
        const to = todayIso(now);
        const fromD = new Date(now); fromD.setDate(fromD.getDate() - 13);
        const from = todayIso(fromD);
        const logs = await fetchJiraWorklogs(jira.env, key, from, to, jira.fetchImpl);
        const direct = Math.round(exportsByKey[key].issues.flatMap(i => i.fields.worklog?.worklogs || []).filter(w => w.started.slice(0, 10) >= from && w.started.slice(0, 10) <= to).reduce((a, w) => a + w.timeSpentSeconds / 3600, 0) * 10) / 10;
        const viaClient = Math.round(logs.reduce((a, w) => a + w.hours, 0) * 10) / 10;
        add(`Jira: ${key} worklog toplamı (${from} – ${to})`, Math.abs(direct - viaClient) < 0.11, `istemci ${viaClient} sa, dışa aktarım ${direct} sa, ${logs.length} kayıt`);
    }

    // 6. Değişiklik akışı (verinin geçici dosya kopyası üzerinde — pilot verisi değişmez)
    const dir = await mkdtemp(join(tmpdir(), 'pilot-kontrol-'));
    const copyPath = join(dir, 'workspace.json');
    const copy = fileTarget(copyPath, jiraDir);
    try {
        await writeFile(copyPath, serializeWorkspace(ws, false));
        const elif = persona('elif');
        const atlas = ws.projects.find(x => x.pmPersonId === elif.personId)!;
        const atlasKey = atlas.jiraProjectKey!;
        if (exportsByKey[atlasKey]) {
            const [jp, ja] = await callAs(elif, copy, 'jira_aktar', { proje: atlas.code, donem_ay: 0 }, { writable: true, confirm: true });
            const after = parseImportedJson(await readFile(copyPath, 'utf8'));
            const tasks = after.kind === 'workspace' ? after.workspace.projects.find(x => x.id === atlas.id)!.tasks.filter(t => t.jiraId).length : -1;
            const upToDate = !jp.isError && !jp.json.oneri_id && /güncel/.test(String(jp.json.durum));
            const ok = upToDate ? tasks >= exportsByKey[atlasKey].total : !jp.isError && !!ja && !ja.isError && tasks === exportsByKey[atlasKey].total;
            add('elif: jira_aktar → onay → görevler Jira ile aynı', ok, upToDate
                ? `zaten güncel (${tasks} görev)`
                : `${(jp.json.ayrintilar as { yeni?: number; guncellenecek?: number } | undefined)?.yeni ?? '?'} yeni, ${(jp.json.ayrintilar as { guncellenecek?: number } | undefined)?.guncellenecek ?? '?'} güncellenen; projede ${tasks} Jira görevi / dışa aktarımda ${exportsByKey[atlasKey].total}${ja?.isError ? ` · ${ja.text.slice(0, 120)}` : ''}`);
            const foreignJira = (await callAs(persona('burak'), copy, 'jira_aktar', { proje: atlas.code }, { writable: true }))[0];
            add('burak: başkasının projesine Jira aktarımı reddedilir', foreignJira.isError, String(foreignJira.json.hata || foreignJira.text).slice(0, 160));
        }
        const [prop, applied] = await callAs(elif, copy, 'oner_risk_ekle', { proje: atlas.code, baslik: 'Pilot kontrol riski', olasilik: 2, etki: 2 }, { writable: true, confirm: true });
        const after = parseImportedJson(await readFile(copyPath, 'utf8'));
        const ok = !prop.isError && applied && !applied.isError && after.kind === 'workspace'
            && !!after.workspace.projects.find(x => x.id === atlas.id)?.risks?.some(r => r.title === 'Pilot kontrol riski');
        add('elif: öneri → onay → dosyaya yazıldı', ok, ok ? 'risk eklendi ve yeniden okununca görüldü' : `öneri: ${prop.text.slice(0, 160)} · uygula: ${applied?.text.slice(0, 160) || '-'}`);
        const burak = persona('burak');
        const foreign = (await callAs(burak, copy, 'oner_gorev_ekle', { proje: atlas.code, ad: 'Yetkisiz görev' }, { writable: true }))[0];
        add('burak: başkasının projesine öneri reddedilir', foreign.isError, String(foreign.json.hata || foreign.text).slice(0, 160));
        const lock = ws.planLocks.find(l => l.projectId === atlas.id && l.year === year && l.status === 'locked');
        if (lock) {
            const member = ws.allocations.find(a => a.projectId === atlas.id && a.year === year && a.personId !== elif.personId)!;
            const pName = fullName(personById(member.personId));
            const locked = (await callAs(elif, copy, 'oner_tahsis_ayarla', { kisi: pName, proje: atlas.code, yil: year, ay: 12, alan: 'plan', aa: 0.5 }, { writable: true }))[0];
            add('elif: kilitli plana plan girilemez', locked.isError && /kilit/i.test(locked.text), String(locked.json.hata || locked.text).slice(0, 160));
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }

    if (t.extraChecks) {
        try {
            await t.extraChecks(add, ws);
        } catch (e) {
            add(`${t.kind}: ek kontroller`, false, (e as Error).message.slice(0, 200));
        }
    }

    add('sicil sızıntısı', leaks.size === 0, leaks.size ? `sicil görülen çıktılar: ${[...leaks].join(', ')}` : 'hiçbir araç çıktısında sicil yok');
    return results;
};

export const checksMarkdown = (results: CheckResult[], day: string): string => {
    const passed = results.filter(r => r.durum === 'GEÇTİ').length;
    const failed = results.filter(r => r.durum === 'KALDI').length;
    const icon = (s: CheckStatus) => (s === 'GEÇTİ' ? '✅' : s === 'KALDI' ? '❌' : '⚠️');
    return [
        `## Otomatik kontroller — ${day}`,
        '',
        `**${passed}/${results.length} geçti**${failed ? ` · ${failed} kaldı` : ''}`,
        '',
        '| # | Kontrol | Sonuç | Ayrıntı |',
        '|---|---|---|---|',
        ...results.map((r, i) => `| ${i + 1} | ${r.ad} | ${icon(r.durum)} ${r.durum} | ${r.ayrinti.replace(/\|/g, '\\|')} |`),
        '',
    ].join('\n');
};
