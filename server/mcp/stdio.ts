import { createInterface } from 'node:readline';
import { readMcpConfig } from './config.js';
import { createPlanAsistanMcp } from './planasistan.js';
import { createMcpHandler, errorResponse, JSONRPC } from './protocol.js';

/**
 * PlanAsistan MCP sunucusu — stdio taşıması. MCP istemcisi (Claude Desktop,
 * Claude Code…) bu süreci başlatır; her satır bir JSON-RPC iletisidir.
 * stdout YALNIZ protokol içindir: tüm günlükler stderr'e gider.
 *
 * Derleme: npm run build:mcp → dist-mcp/planasistan-mcp.mjs
 * Kurulum: docs/MCP_KURULUM.md
 */

const toStderr = (...a: unknown[]) => console.error(...a);
console.log = toStderr;
console.info = toStderr;
console.debug = toStderr;

const log = (message: string): void => {
    process.stderr.write(`[planasistan-mcp] ${message}\n`);
};

const options = readMcpConfig(process.env);
if (options.setupError) log(`yapılandırma: ${options.setupError}`);
else log(`veri kaynağı: ${options.source?.kind || 'yok'}${options.allowWrite ? ' · değişiklik açık' : ' · salt-okunur'}`);

const handle = createMcpHandler(createPlanAsistanMcp({ ...options, log }));

const send = (msg: unknown) => process.stdout.write(`${JSON.stringify(msg)}\n`);

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = new Set<Promise<void>>();

rl.on('line', line => {
    if (!line.trim()) return;
    let msg: unknown;
    try {
        msg = JSON.parse(line);
    } catch {
        send(errorResponse(null, JSONRPC.parseError, 'JSON ayrıştırılamadı.'));
        return;
    }
    const job = handle(msg)
        .then(res => { if (res) send(res); })
        .catch(e => log(`işlenemeyen hata: ${(e as Error)?.message}`))
        .finally(() => { pending.delete(job); });
    pending.add(job);
});

// İstemci bağlantıyı kapatınca süren işler bitsin, sonra çık
rl.on('close', async () => {
    await Promise.allSettled([...pending]);
    process.exit(0);
});
