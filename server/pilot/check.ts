import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { TaskStatus, WorkspaceData } from '../../types.js';
import { parseImportedJson } from '../../utils/workspace.js';
import { createPlanAsistanMcp, APPLY_TOOL, STATUS_TOOL } from '../mcp/planasistan.js';
import { createMcpHandler } from '../mcp/protocol.js';
import { fileSource } from '../mcp/source.js';
import { fetchJiraIssuesPage, fetchJiraWorklogs } from '../integrations/handler.js';
import { mockJiraFromDir, PILOT_JIRA_ENV, SearchResponse } from './mockJira.js';
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

/** Persona için MCP sunucusu ayarları: veri dosyası, kimlik, (pilot için) yazma ve sahte Jira */
export const personaOptions = (persona: Persona, path: string, writable: boolean, now?: Date, jiraDir = join(dirname(path), 'jira')) => ({
    source: fileSource(path, undefined, { writable }),
    role: persona.role,
    person: fullName(personById(persona.personId)),
    project: persona.project,
    allowWrite: writable,
    jira: pilotJira(jiraDir),
    ...(now ? { now: () => now } : {}),
});

/** Kontrollerin "bugün"ü (testlerde sabitlenir); araçlar ve bağımsız hesap aynı günü kullanır */
let clock: Date | undefined;

// Aynı persona + dosya için tek sunucu örneği (dosya değişince kaynak yeniden okur)
const handlers = new Map<string, ReturnType<typeof createMcpHandler>>();
const handlerFor = (persona: Persona, path: string, writable: boolean, jiraDir?: string) => {
    const key = `${persona.id}|${path}|${writable}|${clock?.getTime() ?? ''}|${jiraDir || ''}`;
    let h = handlers.get(key);
    if (!h) {
        h = createMcpHandler(createPlanAsistanMcp(personaOptions(persona, path, writable, clock, jiraDir)));
        handlers.set(key, h);
    }
    return h;
};

let nextId = 1;

/** Bir MCP aracını persona kimliğiyle, JSON-RPC katmanı üzerinden çağırır; confirm: öneriyse hemen uygular */
export const callAs = async (persona: Persona, path: string, name: string, args: Record<string, unknown> = {}, o: { writable?: boolean; confirm?: boolean; jiraDir?: string } = {}): Promise<CallResult[]> => {
    const handle = handlerFor(persona, path, !!o.writable, o.jiraDir);
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

export const listToolsAs = async (persona: Persona, path: string, writable = true): Promise<{ name: string; title?: string; description: string; readOnly: boolean }[]> => {
    const res = await handlerFor(persona, path, writable)({ jsonrpc: '2.0', id: nextId++, method: 'tools/list' }) as { result: { tools: { name: string; title?: string; description: string; annotations?: { readOnlyHint?: boolean } }[] } };
    return res.result.tools.map(t => ({ name: t.name, title: t.title, description: t.description, readOnly: t.annotations?.readOnlyHint !== false }));
};

const persona = (id: string): Persona => PERSONAS.find(p => p.id === id)!;
const r2 = (v: number) => Math.round(v * 100) / 100;
const todayIso = (d: Date) => d.toISOString().slice(0, 10);

/** dist-mcp paketini gerçek stdio üzerinden dener */
const stdioSmoke = (bundle: string, path: string): Promise<CheckResult> => new Promise(resolve => {
    const child = spawn(process.execPath, [bundle], { env: { PATH: process.env.PATH, PLANASISTAN_WORKSPACE_FILE: path, PLANASISTAN_ROLE: 'mudur' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const done = (r: CheckResult) => { clearTimeout(timer); child.kill(); resolve(r); };
    const timer = setTimeout(() => done({ ad: 'stdio bağlantısı (dist-mcp)', durum: 'KALDI', ayrinti: '20 sn içinde yanıt yok' }), 20_000);
    child.on('error', e => done({ ad: 'stdio bağlantısı (dist-mcp)', durum: 'KALDI', ayrinti: e.message }));
    child.stdout.on('data', d => {
        out += d;
        const lines = out.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } });
        const list = lines.find(m => m?.id === 2);
        if (!list) return;
        const n = list.result?.tools?.length || 0;
        done(n > 10 ? { ad: 'stdio bağlantısı (dist-mcp)', durum: 'GEÇTİ', ayrinti: `${n} araç listelendi` } : { ad: 'stdio bağlantısı (dist-mcp)', durum: 'KALDI', ayrinti: `araç listesi beklenenden kısa: ${n}` });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
});

export const runChecks = async (path: string, o: { bundle?: string; now?: Date } = {}): Promise<CheckResult[]> => {
    const results: CheckResult[] = [];
    const add = (ad: string, ok: boolean | 'uyari', ayrinti: string) => results.push({ ad, durum: ok === 'uyari' ? 'UYARI' : ok ? 'GEÇTİ' : 'KALDI', ayrinti });
    const parsed = parseImportedJson(await readFile(path, 'utf8'));
    if (parsed.kind !== 'workspace') return [{ ad: 'veri dosyası', durum: 'KALDI', ayrinti: 'workspace.json okunamadı' }];
    const ws: WorkspaceData = parsed.workspace;
    const now = o.now || new Date();
    clock = o.now;
    const sicils = ws.people.map(p => p.sicil).filter((s): s is string => !!s && s.length >= 3);
    const leaks = new Set<string>();
    const scan = (persona: string, tool: string, text: string) => { if (sicils.some(s => text.includes(s))) leaks.add(`${persona}/${tool}`); };

    if (o.bundle) results.push(await stdioSmoke(o.bundle, path));
    else add('stdio bağlantısı (dist-mcp)', 'uyari', 'dist-mcp/planasistan-mcp.mjs yok; npm run build:mcp çalıştırılmadı');

    // 1. Her persona: bağlantı ve tüm okuma araçları beklenmeyen hata vermeden çalışıyor mu
    for (const p of PERSONAS) {
        const status = (await callAs(p, path, STATUS_TOOL, {}, { writable: true }))[0];
        add(`${p.id}: bağlantı ve kimlik`, status.json.durum === 'bağlı', status.json.durum === 'bağlı'
            ? `${(status.json.kimlik as { rol: string; kisi?: string }).rol} · ${(status.json.kimlik as { kisi?: string }).kisi || '-'} · ${status.json.gorunur_proje} proje · değişiklik ${String(status.json.degisiklik).startsWith('açık') ? 'açık' : 'kapalı'}`
            : String(status.json.hata));
        const tools = await listToolsAs(p, path, false);
        const read = tools.filter(t => t.readOnly && !t.name.startsWith('oner_') && t.name !== STATUS_TOOL);
        const crashed: string[] = [];
        const refused: string[] = [];
        for (const t of read) {
            const args = t.name === 'bilgi_ara' ? { sorgu: 'test planı' } : t.name === 'gorev_ara' ? { metin: 'hata' } : {};
            if (t.name === 'jira_aktar') continue; // yazma akışı aşağıda ayrıca denenir
            const r = (await callAs(p, path, t.name, args))[0];
            scan(p.id, t.name, r.text);
            if (r.text.includes('beklenmeyen bir hata') || r.json.protokol_hatasi) crashed.push(t.name);
            else if (r.isError) refused.push(t.name);
        }
        add(`${p.id}: ${read.length} okuma aracı`, crashed.length === 0, crashed.length
            ? `beklenmeyen hata: ${crashed.join(', ')}`
            : `hepsi çalıştı${refused.length ? `; parametre/kapsam nedeniyle yanıt vermeyen: ${refused.join(', ')}` : ''}`);
    }

    // 2. Kapsam: PY yalnız kendi projelerini görür
    for (const p of PERSONAS.filter(x => x.role === 'py')) {
        const r = (await callAs(p, path, 'proje_listesi'))[0];
        const seen = ((r.json.projeler || []) as { ad: string }[]).map(x => x.ad).sort();
        const own = ws.projects.filter(x => x.pmPersonId === p.personId).map(x => x.name).sort();
        add(`${p.id}: yalnız kendi projeleri`, JSON.stringify(seen) === JSON.stringify(own), `görülen: ${seen.join(', ') || '-'}`);
        const other = ws.projects.find(x => x.pmPersonId && x.pmPersonId !== p.personId);
        if (other) {
            const d = (await callAs(p, path, 'proje_detayi', { proje: other.code || other.name }))[0];
            add(`${p.id}: başkasının projesi engellenir`, d.isError, d.isError ? String(d.json.hata) : `${other.name} içeriği döndü!`);
        }
    }

    // 3. Gizlilik: müdüre not/istek araçları sunulmaz, bilgi aramasında notlar çıkmaz
    const ahmet = persona('ahmet');
    const mTools = (await listToolsAs(ahmet, path)).map(t => t.name);
    add('ahmet: not ve istek araçları yok', !mTools.includes('notlari_ara') && !mTools.includes('musteri_istekleri'), mTools.filter(n => ['notlari_ara', 'musteri_istekleri'].includes(n)).join(', ') || 'sunulmadı');
    const mNote = (await callAs(ahmet, path, 'bilgi_ara', { sorgu: 'toplantı karar', kaynak: 'not' }))[0];
    add('ahmet: notlarda arama engellenir', mNote.isError, mNote.isError ? String(mNote.json.hata) : 'not içeriği döndü!');
    add('ahmet: değişiklik araçları yok', !mTools.some(n => n.startsWith('oner_') || n === APPLY_TOOL || n === 'jira_aktar'), 'müdür veri girmez');

    // 4. Sayı tutarlılığı: araç sonuçları ↔ veriden doğrudan hesap
    const mert = persona('mert');
    const list = (await callAs(mert, path, 'proje_listesi'))[0];
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
        const d = (await callAs(mert, path, 'proje_detayi', { proje: prj.code || prj.name }))[0];
        const toolPlan = Number((d.json.tahsis as { plan_aa?: number } | undefined)?.plan_aa);
        const direct = r2(ws.allocations.filter(a => a.projectId === prj.id && a.year === year).reduce((s, a) => s + Object.values(a.plan).reduce((x, y) => x + (y || 0), 0), 0));
        if (!Number.isFinite(toolPlan) || Math.abs(toolPlan - direct) > 0.011) planGaps.push(`${prj.name}: araç ${toolPlan}, veri ${direct}`);
    }
    add(`tahsis plan toplamları (${year})`, planGaps.length === 0, planGaps.join('; ') || 'tüm projelerde tutarlı');

    // 5. Sahte Jira ↔ uygulamanın Jira istemcisi (gerçek Jira'yla aynı uçlar ve biçim)
    const jiraDir = join(dirname(path), 'jira');
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

    // 6. Değişiklik akışı (geçici kopya üzerinde — pilot verisi değişmez)
    const dir = await mkdtemp(join(tmpdir(), 'pilot-kontrol-'));
    const copy = join(dir, 'workspace.json');
    try {
        await copyFile(path, copy);
        const elif = persona('elif');
        const atlas = ws.projects.find(x => x.pmPersonId === elif.personId)!;
        const atlasKey = atlas.jiraProjectKey!;
        if (exportsByKey[atlasKey]) {
            const [jp, ja] = await callAs(elif, copy, 'jira_aktar', { proje: atlas.code, donem_ay: 0 }, { writable: true, confirm: true, jiraDir });
            const after = parseImportedJson(await readFile(copy, 'utf8'));
            const tasks = after.kind === 'workspace' ? after.workspace.projects.find(x => x.id === atlas.id)!.tasks.filter(t => t.jiraId).length : -1;
            const upToDate = !jp.isError && !jp.json.oneri_id && /güncel/.test(String(jp.json.durum));
            const ok = upToDate ? tasks >= exportsByKey[atlasKey].total : !jp.isError && !!ja && !ja.isError && tasks === exportsByKey[atlasKey].total;
            add('elif: jira_aktar → onay → görevler Jira ile aynı', ok, upToDate
                ? `zaten güncel (${tasks} görev)`
                : `${(jp.json.ayrintilar as { yeni?: number; guncellenecek?: number } | undefined)?.yeni ?? '?'} yeni, ${(jp.json.ayrintilar as { guncellenecek?: number } | undefined)?.guncellenecek ?? '?'} güncellenen; projede ${tasks} Jira görevi / dışa aktarımda ${exportsByKey[atlasKey].total}${ja?.isError ? ` · ${ja.text.slice(0, 120)}` : ''}`);
            const foreignJira = (await callAs(persona('burak'), copy, 'jira_aktar', { proje: atlas.code }, { writable: true, jiraDir }))[0];
            add('burak: başkasının projesine Jira aktarımı reddedilir', foreignJira.isError, String(foreignJira.json.hata || foreignJira.text).slice(0, 160));
        }
        const [prop, applied] = await callAs(elif, copy, 'oner_risk_ekle', { proje: atlas.code, baslik: 'Pilot kontrol riski', olasilik: 2, etki: 2 }, { writable: true, confirm: true });
        const after = parseImportedJson(await readFile(copy, 'utf8'));
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
