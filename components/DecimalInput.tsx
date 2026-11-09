import React, { useEffect, useRef, useState } from 'react';
import { DECIMAL_TYPING, formatDecimal, parseDecimal } from '../utils/decimal';

/**
 * Ondalık sayı alanı: "1,5" ve "1.5" kabul edilir, tarayıcının dil ayarından bağımsız (UI-KRC-05).
 * Yazım sürerken metin korunur (virgül kaybolmaz); alan bırakılınca Türkçe biçime döner.
 *
 * type="number" kullanılmaz: Türkçe virgülü tarayıcıya göre "05" ya da boş okuyordu ("0,5" → 5 AA,
 * UI-AKS-20); ok tuşu ve fare tekerleği de değeri sessizce değiştirip kaydediyordu (UI-ERS-22).
 *
 *   max      Bu değerin üstü kaydedilmez; alan geçersiz işaretlenir ve bırakılınca düzenlemeye
 *            başlamadan önceki değere döner ("125" yazarken kaydedilen ara "1" de geri alınır).
 *   onEmpty  Alan boşaltılınca çağrılır (verilmezse boş alan 0 sayılır).
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'max'> & {
    value: number | undefined;
    onValue: (n: number) => void;
    onEmpty?: () => void;
    max?: number;
};

const DecimalInput: React.FC<Props> = ({ value, onValue, onEmpty, max, onFocus, onBlur, title, ...rest }) => {
    const [text, setText] = useState(formatDecimal(value));
    const [invalid, setInvalid] = useState(false);
    const focused = useRef(false);
    const atFocus = useRef<number | undefined>(value);
    // Değer dışarıdan değişirse (ör. AI tahmini) alan güncellenir; yazarken dokunulmaz
    useEffect(() => { if (!focused.current) setText(formatDecimal(value)); }, [value]);
    const overMax = invalid && max !== undefined;
    return (
        <input
            {...rest}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            aria-invalid={overMax || undefined}
            title={overMax ? `En çok ${formatDecimal(max)}` : title}
            style={overMax ? { ...(rest.style || {}), outline: '2px solid #D70015', outlineOffset: -2 } : rest.style}
            onFocus={e => { focused.current = true; atFocus.current = value; onFocus?.(e); }}
            onBlur={e => {
                focused.current = false;
                if (invalid) {
                    // Geçersiz girişle bırakıldı: yazarken kaydedilen ara değerler geri alınır
                    const back = atFocus.current;
                    if (back === undefined && onEmpty) onEmpty(); else onValue(back ?? 0);
                    setText(formatDecimal(back));
                } else setText(formatDecimal(value));
                setInvalid(false);
                onBlur?.(e);
            }}
            onChange={e => {
                const t = e.target.value;
                if (!DECIMAL_TYPING.test(t.trim())) return;
                setText(t);
                if (t.trim() === '' && onEmpty) { setInvalid(false); onEmpty(); return; }
                const n = parseDecimal(t);
                if (n === null) return;
                if (max !== undefined && n > max) { setInvalid(true); return; }
                setInvalid(false);
                onValue(n);
            }}
        />
    );
};

export default DecimalInput;
