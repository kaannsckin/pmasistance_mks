/** Test yardımcıları: metin parçalarından akış üretir / akışı toplar */
export const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> => {
    const enc = new TextEncoder();
    return new ReadableStream({
        start(c) {
            chunks.forEach(ch => c.enqueue(enc.encode(ch)));
            c.close();
        },
    });
};

export const collect = async <T,>(it: AsyncIterable<T>): Promise<T[]> => {
    const out: T[] = [];
    for await (const x of it) out.push(x);
    return out;
};
