import { describe, expect, it } from 'vitest';
import { parseEnvFile } from './envFile';

describe('ayar dosyası', () => {
    it('yorumlar, tırnaklar, CRLF ve BOM', () => {
        const text = '\uFEFF# başlık\r\nJIRA_BASE_URL=https://jira.kurum.gov.tr\r\n# JIRA_TOKEN=yorum\r\nJIRA_TOKEN = "abc#123" \r\nexport PORT=5190   # not\r\nBOS=\r\nTEK=\'a b\'\r\nCOK="satir1\\nsatir2"\r\nbozuk satır\r\n';
        expect(parseEnvFile(text)).toEqual({ JIRA_BASE_URL: 'https://jira.kurum.gov.tr', JIRA_TOKEN: 'abc#123', PORT: '5190', BOS: '', TEK: 'a b', COK: 'satir1\nsatir2' });
    });
});
