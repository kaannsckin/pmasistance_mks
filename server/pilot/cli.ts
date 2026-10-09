import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Note, Project, WorkspaceData } from '../../types.js';
import { matchByText } from '../../utils/ai/scope.js';
import { isoWeekOf } from '../../utils/weeklyReport.js';
import { parseImportedJson, serializeWorkspace } from '../../utils/workspace.js';
import { describeParams } from '../mcp/args.js';
import { ConflictError, WorkspaceSource } from '../mcp/source.js';
import { callAs, checksMarkdown, fileTarget, listToolsAs, PilotTarget, runChecks } from './check.js';
import {
    CloudClients, cloudConfigFromEnv, cloudTarget, createPilotWorkspace, ensureMemberships, ensurePilotUsers, hostOf, listMembers,
    parseViewers, PilotCloudConfig, readCloudLink, replacePilotWorkspace, serviceSource, supabaseClients, writeCloudLink, CloudLink,
} from './cloud.js';
import { mockJiraFromDir } from './mockJira.js';
import { addDays, at, createState, createWorld, dateOf, DayEvents, eventsMarkdown, jiraExports, runUntil, SIM_VERSION, SimState } from './sim.js';
import { fullName, PERSONAS, personById, PROJECTS } from './world.js';

/**
 * Pilot komut satırı (npm run pilot -- <komut>). 1. rutin veriyi üretir,
 * 2. rutin kullanıcıları bu araçla uygulamayı (MCP üzerinden) kullanır.
 * Ayrıntı: pilot/README.md
 */

const USAGE = `PlanAsistan pilot

Veri (1. rutin — Jira ajanı):
  baslat [--tarih GG] [--gecmis 120] [--tohum 2026] [--zorla] [--dosya]
                                                                Kurgusal birimi kurar, geçmişi dünü dahil doldurur.
                                                                PILOT_SUPABASE_* ortamı varsa Supabase'e (--dosya: JSON'a)
  buluta-tasi                                                   JSON'daki pilot verisini Supabase'e taşır
  uyeler [--izleyici e-posta[:rol],…]                           Pilot hesaplarını ve üyelikleri kurar/listeler
  gun [--tarih GG]                                              Sahte Jira'yı ve birimi bu güne kadar ilerletir (varsayılan: dün)
  jira-sunucu [--port 8787]                                     Sahte Jira'yı HTTP'de açar (tarayıcıdaki uygulama için)
  not --proje ATL --baslik "…" --metin "…" [--etiket a,b] [--tarih GG]   Confluence tarzı toplantı/karar notu ekler
  istek --proje ATL --baslik "…" --aciklama "…" [--musteri "…"] [--tarih GG]  Müşteri isteği ekler
  ozet                                                          Veri özeti

Kullanıcılar (2. rutin):
  personalar                                                    Pilot kullanıcıları (JSON)
  araclar <persona>                                             Personanın kullanabildiği MCP araçları
  arac <persona> <arac> ['{"json":"arg"}'] [--onayla]           MCP aracını persona kimliğiyle çağırır;
                                                                 --onayla: oner_* önerisini hemen uygular
  kontrol [--cikti dosya.md]                                    Otomatik kapsam/gizlilik/tutarlılık kontrolleri

Ortak: --dizin pilot-data (ya da PILOT_DIZIN). GG = YYYY-AA-GG.
Bulut: PILOT_SUPABASE_URL, PILOT_SUPABASE_ANON_KEY, PILOT_SUPABASE_SERVICE_ROLE_KEY, PILOT_PASSWORD;
       izleyiciler (uygulamadan izleyen gerçek hesaplar): --izleyici ya da PILOT_IZLEYICILER.`;

type Flags = Record<string, string | true>;

const parseArgs = (argv: string[]): { pos: string[]; flags: Flags } => {
    const pos: string[] = [];
    const flags: Flags = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const v = argv[i + 1];
            if (v === undefined || v.startsWith('--')) flags[key] = true;
            else { flags[key] = v; i++; }
        } else pos.push(a);
    }
    return { pos, flags };
};

const str = (f: Flags, k: string): string | undefined => (typeof f[k] === 'string' ? (f[k] as string) : undefined);

/** İstanbul'a göre bugün */
const todayTr = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const fail = (msg: string): never => {
    process.stderr.write(`${msg}\n`);
    process.exit(1);
};

const paths = (dir: string) => ({
    dir,
    ws: join(dir, 'workspace.json'),
    state: join(dir, 'durum.json'),
    events: join(dir, 'olaylar'),
    confluence: join(dir, 'confluence'),
    jira: join(dir, 'jira'),
});

const writeAtomic = async (file: string, content: string) => {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, file);
};

const readState = async (p: ReturnType<typeof paths>): Promise<SimState> => {
    if (!existsSync(p.state)) return fail(`Pilot verisi yok: ${p.state}. Önce "baslat" çalıştırın.`);
    const state = JSON.parse(await readFile(p.state, 'utf8')) as SimState;
    if (state.surum !== SIM_VERSION) fail(`durum.json sürümü ${state.surum}, beklenen ${SIM_VERSION}: simülasyon değişti. Pilotu baştan kurun: baslat --zorla`);
    return state;
};

const readWorkspaceFile = async (file: string): Promise<WorkspaceData> => {
    const parsed = parseImportedJson(await readFile(file, 'utf8'));
    if (parsed.kind !== 'workspace') fail(`${file} okunamadı.`);
    return (parsed as { workspace: WorkspaceData }).workspace;
};

/** Verinin durduğu yer: pilot-data/bulut.json varsa Supabase, yoksa workspace.json */
type Store =
    | { kind: 'file' }
    | { kind: 'supabase'; link: CloudLink; config: PilotCloudConfig; clients: CloudClients };

const cloudEnv = (): PilotCloudConfig | null => cloudConfigFromEnv(process.env).config;

const openStore = (p: ReturnType<typeof paths>): Store => {
    const link = readCloudLink(p.dir);
    if (!link) return { kind: 'file' };
    const { config, missing } = cloudConfigFromEnv(process.env);
    if (!config) return fail(`Pilot verisi Supabase'de (çalışma alanı ${link.workspaceId}, ${link.host}) ama ortamda şu değişkenler yok: ${missing.join(', ')}. Bulut ortamının ayarlarına ekleyin (değerleri sohbete yazmayın).`);
    if (hostOf(config.url) !== link.host) return fail(`PILOT_SUPABASE_URL (${hostOf(config.url)}) bulut.json'daki projeyle (${link.host}) aynı değil.`);
    return { kind: 'supabase', link, config, clients: supabaseClients(config) };
};

const targetOf = (p: ReturnType<typeof paths>, store: Store): PilotTarget => {
    if (store.kind === 'supabase') return cloudTarget(store.config, store.clients, store.link.workspaceId, p.jira);
    if (!existsSync(p.ws)) fail(`Pilot verisi yok: ${p.ws}. Önce "baslat" çalıştırın.`);
    return fileTarget(p.ws, p.jira);
};

/** Okuma: çalışma alanı (bulutta sunucu anahtarıyla, notlar dahil) + simülasyon durumu */
const readAll = async (p: ReturnType<typeof paths>, store: Store): Promise<{ ws: WorkspaceData; state: SimState; source?: WorkspaceSource; loaded?: WorkspaceData }> => {
    const state = await readState(p);
    if (store.kind === 'file') {
        if (!existsSync(p.ws)) fail(`Pilot verisi yok: ${p.ws}. Önce "baslat" çalıştırın.`);
        return { ws: await readWorkspaceFile(p.ws), state };
    }
    const source = serviceSource(store.config, store.clients, store.link.workspaceId);
    const loaded = (await source.load({ fresh: true })).ws;
    // Simülasyon kopya üzerinde çalışır; kayıtta okunan sürümle karşılaştırılır
    return { ws: structuredClone(loaded), state, source, loaded };
};

const saveState = (p: ReturnType<typeof paths>, state: SimState) => writeAtomic(p.state, JSON.stringify(state));

/**
 * Oku → değiştir → kaydet. Bulutta okuma ile yazma arasında biri (persona,
 * tarayıcıdaki izleyici) veriyi değiştirdiyse ezilmez: baştan okunup yeniden
 * denenir. Dosya yan etkileri (olaylar, Confluence) ancak kayıttan sonra yazılır.
 */
const mutate = async <T>(p: ReturnType<typeof paths>, store: Store, fn: (ws: WorkspaceData, state: SimState) => { next: WorkspaceData; out: T; after?: () => Promise<void> }): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
        const { ws, state, source, loaded } = await readAll(p, store);
        const r = fn(ws, state);
        try {
            if (source && loaded) await source.save(loaded, r.next);
            else await writeAtomic(p.ws, serializeWorkspace(r.next, false));
        } catch (e) {
            if (e instanceof ConflictError && attempt < 4) {
                process.stderr.write(`Bulutta eşzamanlı değişiklik (${(e as Error).message}); yeniden deneniyor…\n`);
                continue;
            }
            throw e;
        }
        await saveState(p, state);
        await r.after?.();
        return r.out;
    }
};

/** Sahte Jira'nın dışa aktarımları (Jira REST arama yanıtı biçimi) */
const saveJira = async (p: ReturnType<typeof paths>, state: SimState) => {
    for (const [key, resp] of Object.entries(jiraExports(state))) await writeAtomic(join(p.jira, `${key}.json`), JSON.stringify(resp));
};

const writeDay = async (p: ReturnType<typeof paths>, e: DayEvents) => {
    await writeAtomic(join(p.events, `${e.gun}.md`), eventsMarkdown(e));
    for (const c of e.confluence) await writeAtomic(join(p.confluence, c.dosya), c.icerik);
};

/** Notun/isteğin günü: --tarih (simülasyonun son gününü geçemez) ya da son gün */
const noteDay = (flags: Flags, state: SimState): string => {
    const last = state.sonGun || todayTr();
    const wanted = str(flags, 'tarih');
    if (!wanted) return last;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wanted)) return fail(`--tarih YYYY-AA-GG olmalı: ${wanted}`);
    if (wanted > last) return fail(`--tarih (${wanted}) simülasyonun son gününden (${last}) sonra olamaz.`);
    return wanted;
};

const findProject = (ws: WorkspaceData, ref: string | undefined): Project => {
    if (!ref) return fail('--proje gerekli (Jira anahtarı, kod ya da ad).');
    const w = PROJECTS.find(x => x.jiraKey.toLowerCase() === ref.toLowerCase());
    const byKey = w && ws.projects.find(x => x.id === w.id);
    if (byKey) return byKey;
    const hits = matchByText(ws.projects, ref, x => [x.name, x.code]);
    if (hits.length !== 1) fail(`"${ref}" için ${hits.length} proje eşleşti.`);
    return hits[0];
};

const findPersona = (id: string | undefined) => {
    const p = PERSONAS.find(x => x.id === (id || '').toLowerCase());
    if (!p) fail(`Persona bilinmiyor: ${id || '(boş)'}. Seçenekler: ${PERSONAS.map(x => x.id).join(', ')}`);
    return p!;
};

const summary = (ws: WorkspaceData, state: SimState, store?: Store) => ({
    ...(store?.kind === 'supabase' ? { kaynak: `Supabase (${store.link.host})`, calisma_alani: store.link.workspaceId } : store ? { kaynak: 'workspace.json' } : {}),
    son_gun: state.sonGun,
    baslangic: state.baslangic,
    projeler: ws.projects.map(p => ({
        ad: p.name, kod: p.code, durum: p.status, rag: p.rag,
        gorev: p.tasks.length, acik: p.tasks.filter(t => t.status !== 'Done').length, kapanan: p.tasks.filter(t => t.status === 'Done').length,
        risk: (p.risks || []).filter(r => r.status !== 'closed').length, not: p.notes.length,
    })),
    kisi: ws.people.length,
    tahsis_satiri: ws.allocations.length,
    haftalik_rapor: (ws.weeklyReports || []).length,
});

/** Kurulumda bir kez: kurgusal birimin geçmişi (tüm PY'ler Jira geçmişini bir kez aktarmış sayılır) */
const generate = (flags: Flags) => {
    const bugun = str(flags, 'tarih') || todayTr();
    const gecmis = Number(str(flags, 'gecmis') || 120);
    const tohum = Number(str(flags, 'tohum') || 2026);
    const from = dateOf(addDays(bugun, -gecmis));
    const baslangic = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;
    const state = createState(tohum, baslangic);
    const last: DayEvents[] = [];
    const ws = runUntil(state, createWorld(tohum, baslangic), addDays(bugun, -1), e => { last.push(e); if (last.length > 7) last.shift(); }, { importAll: true });
    return { ws, state, last };
};

/** Bulut kurulumu: pilot hesapları, çalışma alanı (varsa yerinde yenilenir), üyelikler */
const setupCloud = async (p: ReturnType<typeof paths>, config: PilotCloudConfig, ws: WorkspaceData, flags: Flags) => {
    const viewers = parseViewers(str(flags, 'izleyici') || process.env.PILOT_IZLEYICILER);
    const clients = supabaseClients(config);
    const admin = clients.service();
    const users = await ensurePilotUsers(admin, config.password);
    const old = readCloudLink(p.dir);
    const reused = !!old && old.host === hostOf(config.url) && await replacePilotWorkspace(admin, old.workspaceId, ws);
    const workspaceId = reused ? old!.workspaceId : await createPilotWorkspace(admin, users.jira, ws);
    const uyelik = await ensureMemberships(admin, workspaceId, users, viewers);
    writeCloudLink(p.dir, { workspaceId, host: hostOf(config.url), kuruldu: new Date().toISOString() });
    // Tek doğru kaynak bulut: eski JSON kalırsa yanlışlıkla okunur
    if (existsSync(p.ws)) await rm(p.ws);
    return {
        kaynak: `Supabase (${hostOf(config.url)})`,
        calisma_alani: workspaceId,
        ...(reused ? { not: 'Var olan çalışma alanı yerinde yenilendi (kimlik ve üyelikler aynı; tarayıcıda "Buluttan Çek").' } : {}),
        uyelikler: uyelik.eklenen,
        ...(uyelik.kayitsiz.length ? { kayitsiz_izleyiciler: uyelik.kayitsiz, uyari: 'Bu izleyiciler uygulamadan kayıt olduktan sonra "pilot uyeler" yeniden çalıştırılmalı.' } : {}),
    };
};

const main = async () => {
    const { pos, flags } = parseArgs(process.argv.slice(2));
    const cmd = pos[0];
    const p = paths(resolve(str(flags, 'dizin') || process.env.PILOT_DIZIN || 'pilot-data'));
    const print = (v: unknown) => process.stdout.write(`${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}\n`);

    switch (cmd) {
        case 'baslat': {
            const config = flags.dosya ? null : cloudEnv();
            const link = readCloudLink(p.dir);
            if (!flags.zorla && (existsSync(p.ws) || link)) fail(`${link ? `Pilot zaten Supabase'de (çalışma alanı ${link.workspaceId})` : `${p.ws} zaten var`}. Baştan kurmak için --zorla${!link && config ? '; veriyi koruyarak buluta taşımak için buluta-tasi' : ''}.`);
            if (!config && link && !flags.dosya) fail(`Pilot Supabase'de kurulu ama ortamda ${cloudConfigFromEnv(process.env).missing.join(', ')} yok. JSON'a kurmak için --dosya.`);
            const { ws, state, last } = generate(flags);
            const cloud = config ? await setupCloud(p, config, ws, flags) : null;
            if (!cloud) {
                await writeAtomic(p.ws, serializeWorkspace(ws, false));
                if (link) await rm(join(p.dir, 'bulut.json'));
            }
            await saveState(p, state);
            await saveJira(p, state);
            for (const e of last) await writeDay(p, e);
            print({ kuruldu: p.dir, ...(cloud || { kaynak: 'workspace.json' }), ...summary(ws, state) });
            return;
        }
        case 'buluta-tasi': {
            const config = cloudEnv();
            if (!config) fail(`Ortamda ${cloudConfigFromEnv(process.env).missing.join(', ')} yok.`);
            if (readCloudLink(p.dir)) fail('Pilot verisi zaten Supabase\'de (bulut.json).');
            if (!existsSync(p.ws)) fail(`Taşınacak veri yok: ${p.ws}`);
            const state = await readState(p);
            const ws = await readWorkspaceFile(p.ws);
            print({ tasindi: true, ...await setupCloud(p, config!, ws, flags), ...summary(ws, state) });
            return;
        }
        case 'uyeler': {
            const store = openStore(p);
            if (store.kind !== 'supabase') return fail('Pilot verisi Supabase\'de değil (pilot-data/bulut.json yok).');
            const admin = store.clients.service();
            const users = await ensurePilotUsers(admin, store.config.password);
            const report = await ensureMemberships(admin, store.link.workspaceId, users, parseViewers(str(flags, 'izleyici') || process.env.PILOT_IZLEYICILER));
            print({ calisma_alani: store.link.workspaceId, uyeler: await listMembers(admin, store.link.workspaceId), ...(report.kayitsiz.length ? { kayitsiz_izleyiciler: report.kayitsiz } : {}) });
            return;
        }
        case 'gun': {
            const store = openStore(p);
            const bitis = str(flags, 'tarih') || addDays(todayTr(), -1);
            const current = await readState(p);
            if (current.sonGun && current.sonGun >= bitis) { print({ guncel: true, son_gun: current.sonGun }); return; }
            const out = await mutate(p, store, (ws, state) => {
                const days: DayEvents[] = [];
                const next = runUntil(state, ws, bitis, e => days.push(e));
                return {
                    next,
                    out: { ilerletildi: days.map(d => d.gun), dosyalar: days.map(d => join('olaylar', `${d.gun}.md`)), ...summary(next, state, store) },
                    after: async () => {
                        await saveJira(p, state);
                        for (const e of days) await writeDay(p, e);
                    },
                };
            });
            print(out);
            return;
        }
        case 'not': {
            const store = openStore(p);
            const baslik = str(flags, 'baslik') || fail('--baslik gerekli');
            const metin = str(flags, 'metin') || fail('--metin gerekli');
            const out = await mutate(p, store, (ws, state) => {
                const project = findProject(ws, str(flags, 'proje'));
                const day = noteDay(flags, state);
                const { year, week } = isoWeekOf(dateOf(day));
                const key = PROJECTS.find(x => x.id === project.id)?.jiraKey || project.code || 'PRJ';
                const content = `**${baslik} — ${project.name}**\n_Kaynak: Confluence › ${key} › ${day}_\n${metin}`;
                state.sayac++;
                const n = state.sayac;
                const note: Note = { id: `not-${key}-ek-${String(n).padStart(5, '0')}`, content, createdAt: at(day, 17, 30), weekNumber: week, year, tags: ['confluence', ...(str(flags, 'etiket') || '').split(',').map(s => s.trim()).filter(Boolean)], mentions: [] };
                return {
                    next: { ...ws, projects: ws.projects.map(x => (x.id === project.id ? { ...x, notes: [...x.notes, note], updatedAt: at(day, 17, 30) } : x)) },
                    out: { eklendi: note.id, proje: project.name },
                    after: async () => {
                        await writeAtomic(join(p.confluence, `${day}-${key}-ek-${n}.md`), content);
                        await mkdir(p.events, { recursive: true });
                        await appendFile(join(p.events, `${day}.md`), `\n- (ek) ${key} Confluence notu: ${baslik}\n`);
                    },
                };
            });
            print(out);
            return;
        }
        case 'istek': {
            const store = openStore(p);
            const baslik = str(flags, 'baslik') || fail('--baslik gerekli');
            const out = await mutate(p, store, (ws, state) => {
                const project = findProject(ws, str(flags, 'proje'));
                const day = noteDay(flags, state);
                state.sayac++;
                const req = {
                    id: `istek-ek-${String(state.sayac).padStart(5, '0')}`, title: baslik, description: str(flags, 'aciklama') || '',
                    customerName: str(flags, 'musteri') || PROJECTS.find(x => x.id === project.id)?.customers[0] || 'Müşteri', createdAt: at(day, 12), status: 'New' as const,
                };
                return {
                    next: { ...ws, projects: ws.projects.map(x => (x.id === project.id ? { ...x, customerRequests: [...x.customerRequests, req] } : x)) },
                    out: { eklendi: req.id, proje: project.name },
                    after: async () => {
                        await mkdir(p.events, { recursive: true });
                        await appendFile(join(p.events, `${day}.md`), `\n- (ek) ${project.name} müşteri isteği: ${req.title}\n`);
                    },
                };
            });
            print(out);
            return;
        }
        case 'jira-sunucu': {
            const port = Number(str(flags, 'port') || 8787);
            const jira = mockJiraFromDir(p.jira);
            const server = createServer(async (req, res) => {
                try {
                    const headers = new Headers();
                    Object.entries(req.headers).forEach(([k, v]) => { if (typeof v === 'string') headers.set(k, v); });
                    const r = await jira(`http://127.0.0.1:${port}${req.url || '/'}`, { method: req.method, headers });
                    res.statusCode = r.status;
                    r.headers.forEach((v, k) => res.setHeader(k, v));
                    res.end(Buffer.from(await r.arrayBuffer()));
                } catch (e) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ errorMessages: [(e as Error).message] }));
                }
            });
            server.listen(port, '127.0.0.1', () => print(`Pilot Jira'sı çalışıyor: http://127.0.0.1:${port} (veri: ${p.jira})\nUygulamayı bu Jira'ya bağlamak için .env.local:\n  JIRA_BASE_URL=http://127.0.0.1:${port}\n  JIRA_TOKEN=pilot\nDurdurmak için Ctrl+C.`));
            return;
        }
        case 'ozet': {
            const store = openStore(p);
            const { ws, state } = await readAll(p, store);
            print(summary(ws, state, store));
            return;
        }
        case 'personalar': {
            print(PERSONAS.map(x => ({ ...x, ad: fullName(personById(x.personId)) })));
            return;
        }
        case 'araclar': {
            const persona = findPersona(pos[1]);
            const tools = await listToolsAs(persona, targetOf(p, openStore(p)), true);
            // Parametreler şemadan: ajan ad tahmin etmesin (bilinmeyen parametre zaten reddedilir)
            print(tools.map(t => `${t.readOnly ? '  ' : '✎ '}${t.name} — ${t.title || ''}: ${t.description.slice(0, 160)}\n      parametreler: ${describeParams(t.inputSchema)}`).join('\n'));
            return;
        }
        case 'arac': {
            const persona = findPersona(pos[1]);
            const tool = pos[2] || fail('Araç adı gerekli (araclar komutuyla görün).');
            let args: Record<string, unknown> = {};
            if (pos[3]) {
                try { args = JSON.parse(pos[3]); } catch { fail(`Argüman geçerli JSON değil: ${pos[3]}`); }
            }
            const out = await callAs(persona, targetOf(p, openStore(p)), tool, args, { writable: true, confirm: !!flags.onayla });
            print(out.length === 1 ? out[0].json : { oneri: out[0].json, uygulama: out[1].json });
            return;
        }
        case 'kontrol': {
            const target = targetOf(p, openStore(p));
            const here = dirname(fileURLToPath(import.meta.url));
            const bundle = [join(here, '..', 'dist-mcp', 'planasistan-mcp.mjs'), resolve('dist-mcp', 'planasistan-mcp.mjs')].find(existsSync);
            const results = await runChecks(target, { bundle });
            const md = checksMarkdown(results, todayTr());
            const out = str(flags, 'cikti');
            if (out) await writeAtomic(resolve(out), md);
            print(md);
            if (results.some(r => r.durum === 'KALDI')) process.exitCode = 2;
            return;
        }
        default:
            print(USAGE);
            if (cmd && cmd !== 'yardim' && cmd !== 'help') process.exitCode = 1;
    }
};

/**
 * Node'un yerleşik fetch'i (Supabase istemcisi) HTTPS_PROXY'yi ancak
 * NODE_USE_ENV_PROXY=1 ile kullanır (Node ≥ 22.21). Vekil sunucu arkasında
 * (ör. bulut oturumları) betik bu ayarla kendini yeniden başlatır.
 */
const needsProxyRestart = () => !process.env.NODE_USE_ENV_PROXY && !!(process.env.HTTPS_PROXY || process.env.https_proxy);

if (needsProxyRestart()) {
    // Vekil ajanının "deneysel" uyarısı her komutta basılmasın
    const r = spawnSync(process.execPath, [...process.execArgv, '--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
    process.exit(r.status ?? 1);
} else {
    main().catch(e => fail(`Hata: ${(e as Error)?.stack || e}`));
}
