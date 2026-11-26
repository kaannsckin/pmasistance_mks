import type { ChatImage } from '../ai/protocol';

/**
 * Uygulama asistanı ↔ açık Whiteboard köprüsü. Düzenlenebilir bir pano ekranda
 * açıkken düzenleyici kendini kaydeder; asistan sohbeti "panoya_ciz" aracıyla
 * bu panoya çizer (seçili ekran görüntüsü varsa görsel modele gösterilir).
 * Pano kapanınca kayıt silinir ve araç sohbete sunulmaz.
 */

export type WbComplete = (system: string, prompt: string, opts?: { images?: ChatImage[] }) => Promise<string>;

export interface WbDrawOutcome {
    summary: string;
    /** Eklenen nesne sayısı */
    added: number;
    moved: number;
    /** Görsel seçiliydi ama modele gönderilemedi */
    noImage: boolean;
}

export interface WhiteboardBridge {
    /** Pano ve seçim özeti (araç sonucunda ve sistem talimatında) */
    describe: () => string;
    draw: (request: string, complete: WbComplete) => Promise<WbDrawOutcome>;
}

let active: WhiteboardBridge | null = null;
/** Bir sonraki çizimde seçili görsel modele gösterilsin mi (pano asistan penceresindeki seçim) */
let sendImage = true;

export const setWhiteboardBridge = (b: WhiteboardBridge | null): void => { active = b; };
export const clearWhiteboardBridge = (b: WhiteboardBridge): void => { if (active === b) active = null; };
export const getWhiteboardBridge = (): WhiteboardBridge | null => active;
export const setWhiteboardImageConsent = (on: boolean): void => { sendImage = on; };
export const whiteboardImageConsent = (): boolean => sendImage;
