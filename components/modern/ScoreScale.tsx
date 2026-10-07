import React from 'react';

/**
 * 1–10 puan ölçeği (PY ve PMO sağlık puanı). Seçili puana yeniden basınca
 * puan kaldırılır. Uçların anlamı ölçeğin altında yazar.
 */
const ScoreScale: React.FC<{ label: string; value?: number; onChange: (v: number | undefined) => void; compact?: boolean }> = ({ label, value, onChange, compact }) => (
    <div className="flex flex-col gap-1">
        <div className="m-segmented self-start" role="group" aria-label={label}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button
                    key={n}
                    type="button"
                    className={`m-segment !px-0 justify-center m-tabular ${compact ? '!min-h-[34px] w-8' : 'w-10'}`}
                    aria-pressed={value === n}
                    aria-label={`${n} / 10`}
                    onClick={() => onChange(value === n ? undefined : n)}
                >
                    {n}
                </button>
            ))}
        </div>
        {!compact && (
            <div className="flex justify-between text-[12.5px] m-text-3" style={{ maxWidth: 404 }} aria-hidden="true">
                <span>1 · ciddi sorunlar</span>
                <span>10 · planlandığı gibi</span>
            </div>
        )}
    </div>
);

export default ScoreScale;
