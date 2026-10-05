/**
 * Bilgi Bankası dokümanlarından düz metin çıkarma — tamamen tarayıcıda.
 *  - .txt / .md / .csv : olduğu gibi
 *  - .docx             : JSZip ile word/document.xml → paragraflar
 *  - .pdf              : pdf.js (yalnızca gerektiğinde yüklenir); taranmış
 *                        (görüntü) PDF'lerde metin yoktur — OCR yapılmaz
 */

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.md', '.markdown', '.txt', '.csv'];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_CHARS = 1_500_000;

export class ExtractError extends Error {}

const ext = (name: string): string => {
    const i = name.lastIndexOf('.');
    return i === -1 ? '' : name.slice(i).toLowerCase();
};

const decodeXml = (s: string): string =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&amp;/g, '&');

/** WordprocessingML → metin: paragraf = satır, tablo hücresi = sekme, satır sonu = yeni satır */
export const docxXmlToText = (xml: string): string => {
    const body = xml
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<\/w:tc>/g, '\t')
        .replace(/<\/w:p>/g, '\n');
    const out: string[] = [];
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|([\t\n])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) out.push(m[1] !== undefined ? decodeXml(m[1]) : m[2]);
    return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

const extractDocx = async (buf: ArrayBuffer): Promise<string> => {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    const doc = zip.file('word/document.xml');
    if (!doc) throw new ExtractError('Geçerli bir Word (.docx) dosyası değil.');
    return docxXmlToText(await doc.async('string'));
};

const extractPdf = async (buf: ArrayBuffer): Promise<string> => {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map((it: any) => (typeof it.str === 'string' ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('').trim());
    }
    await task.destroy();
    return pages.filter(Boolean).join('\n\n');
};

export const extractText = async (file: File): Promise<string> => {
    const e = ext(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(e)) throw new ExtractError(`Desteklenmeyen dosya türü (${e || 'uzantısız'}). Desteklenen: PDF, Word (.docx), Markdown, metin.`);
    if (file.size > MAX_FILE_BYTES) throw new ExtractError(`Dosya çok büyük (en fazla ${MAX_FILE_BYTES / 1024 / 1024} MB).`);
    let text: string;
    if (e === '.pdf') text = await extractPdf(await file.arrayBuffer());
    else if (e === '.docx') text = await extractDocx(await file.arrayBuffer());
    else text = await file.text();
    text = text.replace(/\u0000/g, '').trim();
    if (!text) {
        throw new ExtractError(e === '.pdf' ? 'PDF\'te metin bulunamadı (taranmış/görüntü PDF olabilir; OCR desteklenmiyor).' : 'Dosyada metin bulunamadı.');
    }
    return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
};
