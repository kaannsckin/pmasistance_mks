import React, { useEffect, useRef, useState } from 'react';
import { DECIMAL_TYPING, formatDecimal, parseDecimal } from '../utils/decimal';

/**
 * Ondalık sayı alanı: "1,5" ve "1.5" kabul edilir, tarayıcının dil ayarından bağımsız (UI-KRC-05).
 * Yazım sürerken metin korunur (virgül kaybolmaz); alan bırakılınca Türkçe biçime döner.
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    value: number | undefined;
    onValue: (n: number) => void;
};

const DecimalInput: React.FC<Props> = ({ value, onValue, onFocus, onBlur, ...rest }) => {
    const [text, setText] = useState(formatDecimal(value));
    const focused = useRef(false);
    // Değer dışarıdan değişirse (ör. AI tahmini) alan güncellenir; yazarken dokunulmaz
    useEffect(() => { if (!focused.current) setText(formatDecimal(value)); }, [value]);
    return (
        <input
            {...rest}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onFocus={e => { focused.current = true; onFocus?.(e); }}
            onBlur={e => { focused.current = false; setText(formatDecimal(value)); onBlur?.(e); }}
            onChange={e => {
                const t = e.target.value;
                if (!DECIMAL_TYPING.test(t.trim())) return;
                setText(t);
                const n = parseDecimal(t);
                if (n !== null) onValue(n);
            }}
        />
    );
};

export default DecimalInput;
