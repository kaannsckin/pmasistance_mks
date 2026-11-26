import { WbNode, Whiteboard, Project } from '../../../types';
import { ChatImage } from '../../../utils/ai/protocol';
import { AiError } from '../../../utils/ai/client';
import { buildFrame, buildWbAiPrompt, containRect, parseWbAiResult, WB_AI_SYSTEM, WbAiResult } from '../../../utils/whiteboard/assistant';
import { WbComplete } from '../../../utils/whiteboard/bridge';
import { Rect } from '../../../utils/whiteboard/model';

/**
 * Pano asistanının tek çizim turu (tarayıcıda): seçili görseli küçültüp modele
 * gösterir, yanıtı pano nesnelerine çevirir. Sağlayıcı görseli reddederse
 * (görsel okuyamayan model) bir kez görselsiz dener.
 */

const MAX_SIDE = 1280;

/** Görseli modele gidecek boyuta indirir (JPEG); doğal boyutu da verir */
export const prepareImage = (src: string): Promise<{ image: ChatImage; w: number; h: number }> => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        const s = Math.min(1, MAX_SIDE / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * s));
        c.height = Math.max(1, Math.round(h * s));
        const ctx = c.getContext('2d');
        if (!ctx) { reject(new Error('Görsel hazırlanamadı.')); return; }
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        let q = 0.85;
        let url = c.toDataURL('image/jpeg', q);
        while (url.length > 1_400_000 && q > 0.4) { q -= 0.15; url = c.toDataURL('image/jpeg', q); }
        resolve({ image: { mime: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) }, w, h });
    };
    img.onerror = () => reject(new Error('Görsel okunamadı.'));
    img.src = src;
});

const PARSE_PREFIX = 'Asistan';

export const runWbAssistant = async (opts: {
    board: Whiteboard;
    project: Project;
    selection: WbNode[];
    visible: Rect;
    request: string;
    sendImage: boolean;
    complete: WbComplete;
}): Promise<{ result: WbAiResult; noImage: boolean }> => {
    const { board, project, selection, visible, request, complete } = opts;
    const imageNode = selection.find(n => n.type === 'image' && n.src);
    let image: { node: WbNode; rect: Rect } | undefined;
    let prepared: ChatImage | undefined;
    if (imageNode?.src) {
        try {
            const p = await prepareImage(imageNode.src);
            image = { node: imageNode, rect: containRect(imageNode, p.w, p.h) };
            if (opts.sendImage) prepared = p.image;
        } catch {
            image = { node: imageNode, rect: imageNode };
        }
    }
    const frame = buildFrame({ board, selection, image, visible });
    const once = async (withImage: boolean) => parseWbAiResult(
        await complete(WB_AI_SYSTEM, buildWbAiPrompt(frame, request, { board, project, imageSent: withImage }), withImage && prepared ? { images: [prepared] } : undefined),
        frame,
    );
    try {
        return { result: await once(!!prepared), noImage: !!image && !prepared };
    } catch (e) {
        const aborted = e instanceof AiError && e.code === 'aborted';
        const parse = (e as Error)?.message?.startsWith(PARSE_PREFIX);
        const auth = e instanceof AiError && (e.code === 'auth' || e.code === 'config' || e.code === 'forbidden' || e.code === 'rate_limited');
        if (!prepared || aborted || parse || auth) throw e;
        // Model görsel okuyamıyor olabilir: görselsiz bir kez daha
        return { result: await once(false), noImage: true };
    }
};
