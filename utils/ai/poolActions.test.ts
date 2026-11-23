import { describe, expect, it } from 'vitest';
import { Person, UserRole, WorkspaceData } from '../../types';
import { createEmptyWorkspace } from '../workspace';
import { applyAction, describeAction, validateAction } from './actions';
import { parseMoney, titleCodeFor } from './poolActions';
import { buildToolContext } from './scope';
import { executeTool, toolKind, toolSpecsFor } from './tools';

const NOW = new Date('2026-11-20T09:00:00Z');
const person = (id: string, first: string, last: string, extra: Partial<Person> = {}): Person =>
    ({ id, firstName: first, lastName: last, departmentCode: 'U310', availableAA: 1, roles: [], ...extra });

const buildWs = (role: UserRole = 'pyb_destek'): WorkspaceData => ({
    ...createEmptyWorkspace(),
    currentRole: role,
    currentPersonId: role === 'py' ? 'p1' : undefined,
    departments: [{ code: 'U310', name: 'Yazılım' }],
    titles: [
        { code: 'ARŞ', name: 'Araştırmacı', monthlyCost: 115_000 },
        { code: 'UAR', name: 'Uzman Araştırmacı' },
    ],
    people: [person('p1', 'Ayşe', 'Kaya', { titleCode: 'ARŞ' }), person('p2', 'Ahmet Faruk', 'Yazı')],
});

const call = async (ws: WorkspaceData, name: string, args: Record<string, unknown>) => {
    const ctx = buildToolContext(ws, NOW);
    const out = await executeTool({ name, arguments: args }, ctx);
    return { ...out, json: JSON.parse(out.content), ctx };
};

// Kullanıcının eklediği Excel'deki Adam_ay_maaliyet tablosu (ORTALAMA satırı dahil)
const FILE_ROWS = [
    ['Aday Araştırmacı', '120.000,00'], ['Uzman Ar-Ge Proje Teknisyeni', '234.187,00'], ['Ürün Destek', '244.748,00'],
    ['Ar-Ge Proje Başteknisyeni', '259.692,00'], ['Araştırmacı', '281.014,00'], ['Kıdemli Ar-Ge Proje Başteknisyeni', '290.393,00'],
    ['Danışman', '297.610,00'], ['Uzman Araştırmacı', '352.184,00'], ['Kıdemli Uzman Araştırmacı', '417.986,00'],
    ['Başuzman Araştırmacı', '490.805,00'], ['Kıdemli Başuzman Araştırmacı', '581.805,00'], ['ORTALAMA', '₺368.962,07'],
].map(([ad, aylik_maliyet]) => ({ ad, aylik_maliyet }));

describe('veri havuzu yardımcıları', () => {
    it('para metni Türkçe ve İngilizce biçimlerde okunur', () => {
        expect(parseMoney('234.187,00')).toBe(234187);
        expect(parseMoney('₺368.962,07')).toBe(368962.07);
        expect(parseMoney('234187.5')).toBe(234187.5);
        expect(parseMoney('1,234,567.8')).toBe(1234567.8);
        expect(parseMoney('120.000')).toBe(120000);
        expect(parseMoney(281014)).toBe(281014);
        expect(parseMoney('yok')).toBeUndefined();
    });

    it('ünvan kısaltması addan üretilir ve çakışmaz', () => {
        expect(titleCodeFor('Uzman Ar-Ge Proje Teknisyeni', [])).toBe('UAPT');
        expect(titleCodeFor('Danışman', [])).toBe('DAN');
        expect(titleCodeFor('Aday Araştırmacı', [])).toBe('AAR');
        expect(titleCodeFor('Kıdemli Uzman Araştırmacı', ['KUA'])).toBe('KUA2');
    });
});

describe('veri havuzu önerileri', () => {
    it('yalnız veri havuzunu düzenleyen role sunulur ve öneri sayılır', () => {
        const names = (role: UserRole) => toolSpecsFor(buildToolContext(buildWs(role), NOW)).map(s => s.name);
        expect(names('pyb_destek')).toEqual(expect.arrayContaining(['veri_havuzu', 'oner_unvan_kaydet', 'oner_kisi_guncelle', 'oner_kisi_ekle', 'oner_bolum_kaydet']));
        for (const role of ['py', 'mudur', 'admin'] as UserRole[]) {
            expect(names(role)).toContain('veri_havuzu');
            expect(names(role)).not.toContain('oner_unvan_kaydet');
        }
        expect(toolKind('oner_unvan_kaydet')).toBe('propose');
    });

    it('dosyadaki ünvan tablosu tek öneri olur: mevcutlar güncellenir, yenilere kısaltma üretilir, ORTALAMA atlanır', async () => {
        const ws = buildWs();
        const r = await call(ws, 'oner_unvan_kaydet', { unvanlar: FILE_ROWS });
        expect(r.ok).toBe(true);
        expect(r.json.atlanan).toEqual([expect.stringContaining('ORTALAMA')]);
        expect(r.ctx.proposals).toHaveLength(1);
        const p = r.ctx.proposals[0];
        expect(p.title).toBe('Ünvan ve maliyet: 9 yeni, 2 güncelleme');
        expect(p.details.find(d => d.label === 'Araştırmacı (ARŞ)')?.value).toBe('₺115.000 → ₺281.014');
        expect(p.details.find(d => d.label === 'Uzman Araştırmacı (UAR)')?.value).toBe('maliyet yok → ₺352.184');

        const done = applyAction(ws, p.action);
        expect(done.ws.titles).toHaveLength(11);
        expect(done.ws.titles.find(t => t.code === 'ARŞ')?.monthlyCost).toBe(281_014);
        expect(done.ws.titles.find(t => t.name === 'Uzman Ar-Ge Proje Teknisyeni')).toEqual({ code: 'UAPT', name: 'Uzman Ar-Ge Proje Teknisyeni', monthlyCost: 234_187 });
        expect(done.summary).toBe('Ünvanlar: 9 eklendi, 2 güncellendi');
        expect(done.ws.auditLog?.[0]).toMatchObject({ action: 'ai.apply' });
        // Aynı tablo yeniden önerilirse değişen bir şey yok
        expect(validateAction(done.ws, p.action)).toMatch(/değişen bir şey yok/);
    });

    it('PY rolü havuz önerisini uygulayamaz (yetki uygulamada yeniden denetlenir)', () => {
        const action = { type: 'unvan_kaydet' as const, titles: [{ code: 'DAN', name: 'Danışman', monthlyCost: 297_610 }] };
        expect(validateAction(buildWs('pyb_destek'), action)).toBeNull();
        expect(validateAction(buildWs('py'), action)).toMatch(/yetkiniz yok/);
        expect(() => applyAction(buildWs('py'), action)).toThrow(/yetkiniz yok/);
    });

    it('kişi güncellemesi aynı turda önerilen ünvana başvurabilir; kart uygulanmadan kişi kartı uygulanmaz', async () => {
        const ws = buildWs();
        const ctx = buildToolContext(ws, NOW);
        await executeTool({ name: 'oner_unvan_kaydet', arguments: { unvanlar: [{ ad: 'Danışman', aylik_maliyet: 297610 }] } }, ctx);
        const out = JSON.parse((await executeTool({
            name: 'oner_kisi_guncelle',
            arguments: { kisiler: [{ kisi: 'Ahmet Faruk YAZI', unvan: 'Danışman', aa: 80 }, { kisi: 'Bilinmeyen Kişi', unvan: 'ARŞ' }] },
        }, ctx)).content);
        expect(out.atlanan).toEqual([expect.stringContaining('Bilinmeyen Kişi')]);
        const [titles, people] = ctx.proposals;
        expect(people.details).toEqual([{ label: 'Ahmet Faruk Yazı', value: 'ünvan: — → DAN · AA: 1 → 0,8' }]);
        expect(validateAction(ws, people.action)).toMatch(/Önce ünvan önerisini uygulayın/);
        const after = applyAction(applyAction(ws, titles.action).ws, people.action).ws;
        expect(after.people.find(p => p.id === 'p2')).toMatchObject({ titleCode: 'DAN', availableAA: 0.8 });
    });

    it('kişi ekleme: ad soyad tek alanda verilebilir; havuzda olan kişi eklenmez', async () => {
        const r = await call(buildWs(), 'oner_kisi_ekle', {
            kisiler: JSON.stringify([{ ad: 'Osman Çörekci', bolum: 'u310', unvan: 'arş', eposta: 'osman@kurum.gov.tr' }, { ad: 'Ayşe Kaya', bolum: 'U310' }]),
        });
        expect(r.json.atlanan).toEqual([expect.stringContaining('zaten var')]);
        const added = applyAction(buildWs(), r.ctx.proposals[0].action).ws.people.at(-1)!;
        expect(added).toMatchObject({ firstName: 'Osman', lastName: 'Çörekci', departmentCode: 'U310', titleCode: 'ARŞ', email: 'osman@kurum.gov.tr', availableAA: 1 });
    });

    it('bölüm önerisi ekler ya da adını günceller; veri_havuzu eksikleri listeler', async () => {
        const ws = buildWs();
        const r = await call(ws, 'oner_bolum_kaydet', { bolumler: [{ kod: 'u320', ad: 'Test' }, { kod: 'U310', ad: 'Yazılım Geliştirme' }] });
        expect(describeAction(ws, r.ctx.proposals[0].action).details).toEqual([
            { label: 'U320', value: 'yeni · Test' },
            { label: 'U310', value: 'Yazılım → Yazılım Geliştirme' },
        ]);
        const list = await call(ws, 'veri_havuzu', { tur: 'kisi', eksik: 'unvan' });
        expect(list.json.kisiler.map((k: { ad: string }) => k.ad)).toEqual(['Ahmet Faruk Yazı']);
        const titles = await call(ws, 'veri_havuzu', { tur: 'unvan' });
        expect(titles.json.maliyetsiz).toEqual(['UAR']);
    });
});
