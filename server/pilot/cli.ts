import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Note, Project, WorkspaceData } from '../../types.js';
import { matchByText } from '../../utils/ai/scope.js';
import { isoWeekOf } from '../../utils/weeklyReport.js';
import { parseImportedJson, serializeWorkspace } from '../../utils/workspace.js';
import { describeParams } from '../mcp/args.js';
import { callAs, checksMarkdown, listToolsAs, runChecks } from './check.js';
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
  baslat [--tarih GG] [--gecmis 120] [--tohum 2026] [--zorla]   Kurgusal birimi kurar, geçmişi dünü dahil doldurur
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

Ortak: --dizin pilot-data (ya da PILOT_DIZIN). GG = YYYY-AA-GG.`;

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

const loadAll = async (p: ReturnType<typeof paths>): Promise<{ ws: WorkspaceData; state: SimState }> => {
    if (!existsSync(p.ws) || !existsSync(p.state)) fail(`Pilot verisi yok: ${p.dir}. Önce "baslat" çalıştırın.`);
    const parsed = parseImportedJson(await readFile(p.ws, 'utf8'));
    if (parsed.kind !== 'workspace') fail(`${p.ws} okunamadı.`);
    const state = JSON.parse(await readFile(p.state, 'utf8')) as SimState;
    if (state.surum !== SIM_VERSION) fail(`durum.json sürümü ${state.surum}, beklenen ${SIM_VERSION}: simülasyon değişti. Pilotu baştan kurun: baslat --zorla`);
    return { ws: (parsed as { workspace: WorkspaceData }).workspace, state };
};

const saveAll = async (p: ReturnType<typeof paths>, ws: WorkspaceData, state: SimState) => {
    await writeAtomic(p.ws, serializeWorkspace(ws, false));
    await writeAtomic(p.state, JSON.stringify(state));
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

const summary = (ws: WorkspaceData, state: SimState) => ({
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

const main = async () => {
    const { pos, flags } = parseArgs(process.argv.slice(2));
    const cmd = pos[0];
    const p = paths(resolve(str(flags, 'dizin') || process.env.PILOT_DIZIN || 'pilot-data'));
    const print = (v: unknown) => process.stdout.write(`${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}\n`);

    switch (cmd) {
        case 'baslat': {
            if (existsSync(p.ws) && !flags.zorla) fail(`${p.ws} zaten var. Baştan kurmak için --zorla.`);
            const bugun = str(flags, 'tarih') || todayTr();
            const gecmis = Number(str(flags, 'gecmis') || 120);
            const tohum = Number(str(flags, 'tohum') || 2026);
            const from = dateOf(addDays(bugun, -gecmis));
            const baslangic = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;
            const state = createState(tohum, baslangic);
            const last: DayEvents[] = [];
            // Kurulumda tüm PY'ler Jira geçmişini bir kez aktarmış sayılır; sonrasını persona PY'ler kendisi aktarır
            const ws = runUntil(state, createWorld(tohum, baslangic), addDays(bugun, -1), e => { last.push(e); if (last.length > 7) last.shift(); }, { importAll: true });
            await saveAll(p, ws, state);
            await saveJira(p, state);
            for (const e of last) await writeDay(p, e);
            print({ kuruldu: p.dir, ...summary(ws, state) });
            return;
        }
        case 'gun': {
            const { ws, state } = await loadAll(p);
            const bitis = str(flags, 'tarih') || addDays(todayTr(), -1);
            if (state.sonGun && state.sonGun >= bitis) { print({ guncel: true, son_gun: state.sonGun }); return; }
            const days: DayEvents[] = [];
            const next = runUntil(state, ws, bitis, e => days.push(e));
            await saveAll(p, next, state);
            await saveJira(p, state);
            for (const e of days) await writeDay(p, e);
            print({ ilerletildi: days.map(d => d.gun), dosyalar: days.map(d => join('olaylar', `${d.gun}.md`)), ...summary(next, state) });
            return;
        }
        case 'not': {
            const { ws, state } = await loadAll(p);
            const project = findProject(ws, str(flags, 'proje'));
            const baslik = str(flags, 'baslik') || fail('--baslik gerekli');
            const metin = str(flags, 'metin') || fail('--metin gerekli');
            const day = noteDay(flags, state);
            const { year, week } = isoWeekOf(dateOf(day));
            const key = PROJECTS.find(x => x.id === project.id)?.jiraKey || project.code || 'PRJ';
            const content = `**${baslik} — ${project.name}**\n_Kaynak: Confluence › ${key} › ${day}_\n${metin}`;
            state.sayac++;
            const note: Note = { id: `not-${key}-ek-${String(state.sayac).padStart(5, '0')}`, content, createdAt: at(day, 17, 30), weekNumber: week, year, tags: ['confluence', ...(str(flags, 'etiket') || '').split(',').map(s => s.trim()).filter(Boolean)], mentions: [] };
            const next = { ...ws, projects: ws.projects.map(x => (x.id === project.id ? { ...x, notes: [...x.notes, note], updatedAt: at(day, 17, 30) } : x)) };
            await saveAll(p, next, state);
            await writeAtomic(join(p.confluence, `${day}-${key}-ek-${state.sayac}.md`), content);
            await mkdir(p.events, { recursive: true });
            await appendFile(join(p.events, `${day}.md`), `\n- (ek) ${key} Confluence notu: ${baslik}\n`);
            print({ eklendi: note.id, proje: project.name });
            return;
        }
        case 'istek': {
            const { ws, state } = await loadAll(p);
            const project = findProject(ws, str(flags, 'proje'));
            const day = noteDay(flags, state);
            state.sayac++;
            const req = {
                id: `istek-ek-${String(state.sayac).padStart(5, '0')}`, title: str(flags, 'baslik') || fail('--baslik gerekli'), description: str(flags, 'aciklama') || '',
                customerName: str(flags, 'musteri') || PROJECTS.find(x => x.id === project.id)?.customers[0] || 'Müşteri', createdAt: at(day, 12), status: 'New' as const,
            };
            const next = { ...ws, projects: ws.projects.map(x => (x.id === project.id ? { ...x, customerRequests: [...x.customerRequests, req] } : x)) };
            await saveAll(p, next, state);
            await mkdir(p.events, { recursive: true });
            await appendFile(join(p.events, `${day}.md`), `\n- (ek) ${project.name} müşteri isteği: ${req.title}\n`);
            print({ eklendi: req.id, proje: project.name });
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
            const { ws, state } = await loadAll(p);
            print(summary(ws, state));
            return;
        }
        case 'personalar': {
            print(PERSONAS.map(x => ({ ...x, ad: fullName(personById(x.personId)) })));
            return;
        }
        case 'araclar': {
            const persona = findPersona(pos[1]);
            const tools = await listToolsAs(persona, p.ws, true);
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
            if (!existsSync(p.ws)) fail(`Pilot verisi yok: ${p.ws}`);
            const out = await callAs(persona, p.ws, tool, args, { writable: true, confirm: !!flags.onayla });
            print(out.length === 1 ? out[0].json : { oneri: out[0].json, uygulama: out[1].json });
            return;
        }
        case 'kontrol': {
            if (!existsSync(p.ws)) fail(`Pilot verisi yok: ${p.ws}`);
            const here = dirname(fileURLToPath(import.meta.url));
            const bundle = [join(here, '..', 'dist-mcp', 'planasistan-mcp.mjs'), resolve('dist-mcp', 'planasistan-mcp.mjs')].find(existsSync);
            const results = await runChecks(p.ws, { bundle });
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

main().catch(e => fail(`Hata: ${(e as Error)?.stack || e}`));
