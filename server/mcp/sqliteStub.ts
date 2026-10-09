/**
 * Paketleme yardımcısı: undici'nin (kurum sertifikasıyla Jira/AI isteği) hiç
 * kullanılmayan SQLite önbelleği `node:sqlite` ister; tek dosyalık pakette bu
 * istek en üste taşınıp Node'un "deneysel özellik" uyarısını basar. MCP ve
 * pilot paketlerinde bu boş modül kullanılır (vite.mcp.config.ts).
 */
export class DatabaseSync {
    constructor() {
        throw new Error('node:sqlite bu pakette kullanılamaz.');
    }
}
export default { DatabaseSync };
