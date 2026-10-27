import * as XLSX from 'xlsx';
import Papa from 'papaparse';

/** Excel/CSV dosyasını satır dizisine çevirir (ilk sayfa; başlık satırı dahil) */
export const readRows = (file: File): Promise<unknown[][]> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    const csv = file.name.toLowerCase().endsWith('.csv');
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.onload = () => {
        try {
            if (csv) {
                resolve(Papa.parse<unknown[]>(reader.result as string, { skipEmptyLines: true }).data);
            } else {
                const wb = XLSX.read(reader.result, { type: 'binary' });
                resolve(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
            }
        } catch (e) {
            reject(e);
        }
    };
    if (csv) reader.readAsText(file); else reader.readAsBinaryString(file);
});
