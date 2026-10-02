/**
 * Server-Sent Events ayrıştırıcı — sağlayıcıların akış yanıtlarını (OpenAI,
 * Anthropic, Gemini hepsi SSE kullanır) olaylara böler. Parçalar satır
 * ortasında kesilse de doğru birleştirir; \n ve \r\n satır sonlarını kabul eder.
 */

export interface SseEvent {
    event?: string;
    data: string;
}

export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName: string | undefined;
    let dataLines: string[] = [];

    const flush = (): SseEvent | null => {
        if (dataLines.length === 0) {
            eventName = undefined;
            return null;
        }
        const ev: SseEvent = { event: eventName, data: dataLines.join('\n') };
        eventName = undefined;
        dataLines = [];
        return ev;
    };

    const handleLine = (line: string): SseEvent | null => {
        if (line === '') return flush();
        if (line.startsWith(':')) return null; // yorum / keep-alive
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'event') eventName = value;
        else if (field === 'data') dataLines.push(value);
        return null;
    };

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, idx).replace(/\r$/, '');
                buffer = buffer.slice(idx + 1);
                const ev = handleLine(line);
                if (ev) yield ev;
            }
        }
        buffer += decoder.decode();
        if (buffer.length > 0) {
            const ev = handleLine(buffer.replace(/\r$/, ''));
            if (ev) yield ev;
        }
        const last = flush();
        if (last) yield last;
    } finally {
        reader.releaseLock();
    }
}
