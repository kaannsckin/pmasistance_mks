export interface LensBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

const lensFrames = [
    { offset: 0, travel: 0, stretch: 0 },
    { offset: .16, travel: .10, stretch: .58 },
    { offset: .39, travel: .49, stretch: 1 },
    { offset: .66, travel: .93, stretch: .46 },
    { offset: .82, travel: 1.035, stretch: -.19 },
    { offset: .93, travel: .995, stretch: .07 },
    { offset: 1, travel: 1, stretch: 0 },
];

export const sameLensBounds = (a: LensBounds, b: LensBounds): boolean =>
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Read the painted bounds before redirecting a transition already in progress. */
export const paintedLensBounds = (lens: HTMLElement): LensBounds => {
    const style = getComputedStyle(lens);
    const transform = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
    return { x: transform.e, y: transform.f, width: parseFloat(style.width), height: parseFloat(style.height) };
};

export const animateGlassLens = (lens: HTMLElement, reflection: HTMLElement, from: LensBounds, to: LensBounds): Animation[] => {
    const dx = (to.x + to.width / 2) - (from.x + from.width / 2);
    const dy = (to.y + to.height / 2) - (from.y + from.height / 2);
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return [];

    const across = Math.abs(dx) / distance;
    const down = Math.abs(dy) / distance;
    const elongation = Math.min(44, distance * .37, Math.max(from.width, to.width) * .62);
    const duration = Math.round(380 + Math.min(100, distance * .24));
    const timing = { duration, easing: 'linear' };

    const keyframes = lensFrames.map(({ offset, travel, stretch }) => {
        const blend = Math.min(1, Math.max(0, travel));
        const width = (from.width + (to.width - from.width) * blend) * (1 - .14 * stretch * down)
            + elongation * stretch * across;
        const height = (from.height + (to.height - from.height) * blend) * (1 - .22 * stretch * across)
            + elongation * .60 * stretch * down;
        const x = from.x + from.width / 2 + dx * travel - width / 2;
        const y = from.y + from.height / 2 + dy * travel - height / 2;
        return { offset, width: `${width}px`, height: `${height}px`, transform: `translate(${x}px, ${y}px)` };
    });

    const sweepX = dx / distance * 83;
    const sweepY = dy / distance * 83;
    const reflectAt = (position: number) => `translate(${position * sweepX}%, ${position * sweepY}%)`;
    return [lens.animate(keyframes, timing), reflection.animate([
        { offset: 0, opacity: 0, transform: reflectAt(-1) },
        { offset: .22, opacity: .93, transform: reflectAt(-.37) },
        { offset: .53, opacity: .81, transform: reflectAt(.21) },
        { offset: .81, opacity: .35, transform: reflectAt(.70) },
        { offset: 1, opacity: 0, transform: reflectAt(1.07) },
    ], timing)];
};
