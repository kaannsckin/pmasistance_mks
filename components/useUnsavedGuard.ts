import { useEffect } from 'react';
import { clearUnsaved, markUnsaved } from '../utils/unsavedGuard';

/** Düzenleyicinin kaydedilmemiş değişikliğini uygulamanın gezinme korumasına bildirir (UI-KRC-04) */
export const useUnsavedGuard = (key: string, dirty: boolean, message?: string): void => {
    useEffect(() => {
        if (dirty) markUnsaved(key, message);
        else clearUnsaved(key);
        return () => clearUnsaved(key);
    }, [key, dirty, message]);
};
