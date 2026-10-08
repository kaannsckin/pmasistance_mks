import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { TaskStatus, UserRole, WorkspaceData } from '../../types';
import { buildToolContext } from '../ai/scope';
import { createEmptyWorkspace, createProject } from '../workspace';
import { docxXmlToText, ExtractError, extractText } from './extract';
import { guideDocs, uploadedDocsToRag, workspaceDocs } from './sources';

const buildWs = (role: UserRole, personId?: string): WorkspaceData => {
    const mine = createProject('Benim Projem');
    mine.id = 'mine';
    mine.pmPersonId = 'pm';
    mine.notes = [{ id: 'n', content: 'gizli toplantı notu', createdAt: '2026-07-01T00:00:00Z', weekNumber: 27, year: 2026, tags: [], mentions: [] }];
    mine.tasks = [{ id: 't', name: 'Analiz', notes: 'Gereksinim analizi', availability: true, priority: 'Low', version: 1, predecessor: null, unit: '', resourceName: '', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', status: TaskStatus.ToDo }];
    const other = createProject('Başka Proje');
    other.id = 'other';
    other.pmPersonId = 'x';
    other.tasks = [{ ...mine.tasks[0], id: 'o', name: 'Gizli görev' }];
    return { ...createEmptyWorkspace(), currentRole: role, currentPersonId: personId, projects: [mine, other], people: [] };
};

describe('bilgi tabanı kaynakları', () => {
    it('Proje Yöneticisi yalnızca kendi projesinin içeriğini dizinler', () => {
        const ids = workspaceDocs(buildToolContext(buildWs('py', 'pm'))).map(d => d.id);
        expect(ids).toContain('not:mine:n');
        expect(ids).toContain('gorev:mine:t');
        expect(ids.some(i => i.includes('other'))).toBe(false);
    });

    it('yönetici rollerinde notlar dizine girmez', () => {
        const docs = workspaceDocs(buildToolContext(buildWs('mudur')));
        expect(docs.some(d => d.type === 'not')).toBe(false);
        expect(docs.some(d => d.id === 'gorev:other:o')).toBe(true);
    });

    it('kapanmış görevde tür, tahmin ve ölçülen kapanma süresi dizinlenir', () => {
        const ws = buildWs('py', 'pm');
        ws.projects[0].tasks.push({ ...ws.projects[0].tasks[0], id: 'k', name: 'Rapor hatası', status: TaskStatus.Done, issueType: 'bug', startedAt: '2026-06-01T09:00:00', resolvedAt: '2026-06-03T17:00:00' });
        const doc = workspaceDocs(buildToolContext(ws)).find(d => d.id === 'gorev:mine:k')!;
        expect(doc.text).toContain('tür: Hata');
        expect(doc.text).toContain('gerçekleşen kapanma: 3 iş günü (işe başlamadan kapanışa)');
        expect(workspaceDocs(buildToolContext(ws)).find(d => d.id === 'gorev:mine:t')!.text).not.toContain('gerçekleşen');
    });

    it('kılavuz başlıklara bölünür; doküman kayıtları dönüştürülür', () => {
        const g = guideDocs();
        expect(g.length).toBeGreaterThan(15);
        expect(g.map(d => d.title)).toContain('Plan onayı ve kilitleme');
        expect(g.every(d => d.text.length > 50 && d.ref.kind === 'guide')).toBe(true);
        const u = uploadedDocsToRag([{ id: 'd1', name: 'Prosedür.pdf', size: 10, addedAt: '2026-07-01T00:00:00Z', text: 'içerik' }, { id: 'd2', name: 'boş.txt', size: 0, addedAt: '2026-07-01T00:00:00Z', text: '  ' }]);
        expect(u).toEqual([{ id: 'dokuman:d1', type: 'dokuman', title: 'Prosedür.pdf', text: 'içerik', date: '2026-07-01', ref: { kind: 'document', docId: 'd1' } }]);
    });
});

describe('doküman metni çıkarma', () => {
    it('Word XML → paragraflar, sekmeler, XML varlıkları', () => {
        const xml = '<w:document><w:body><w:p><w:r><w:t>Satın alma</w:t></w:r><w:r><w:t xml:space="preserve"> prosedürü &amp; onay</w:t></w:r></w:p>'
            + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Adım</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Sorumlu</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
        expect(docxXmlToText(xml)).toBe('Satın alma prosedürü & onay\nAdım\n\tSorumlu');
    });

    it('.docx ve .txt dosyalarından metin; desteklenmeyen tür hata', async () => {
        const zip = new JSZip();
        zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Seyahat yönergesi madde 1</w:t></w:r></w:p></w:body></w:document>');
        const buf = await zip.generateAsync({ type: 'uint8array' });
        expect(await extractText(new File([buf], 'Yönerge.docx'))).toBe('Seyahat yönergesi madde 1');
        expect(await extractText(new File(['# Başlık\nMetin'], 'not.md'))).toBe('# Başlık\nMetin');
        await expect(extractText(new File(['x'], 'resim.png'))).rejects.toBeInstanceOf(ExtractError);
        await expect(extractText(new File(['   '], 'bos.txt'))).rejects.toThrow(/metin bulunamadı/);
    });
});
