import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';
/** Original Signal Studio adaptation of the number-ticker interaction. */
export function NumberTicker({ value, format = (n: number) => n.toFixed(1), className }: {
    value: number;
    format?: (n: number) => string;
    className?: string;
}) {
    const number = useMotionValue(value), spring = useSpring(number, { stiffness: 130, damping: 26, mass: 1 });
    const display = useTransform(spring, format), ref = useRef<HTMLSpanElement>(null), reduce = useReducedMotion();
    useEffect(() => {
        number.set(value);
        if (reduce && ref.current)
            ref.current.textContent = format(value);
    }, [value, number, reduce, format]);
    useEffect(() => {
        if (reduce)
            return;
        return display.on('change', v => {
            if (ref.current)
                ref.current.textContent = v;
        });
    }, [display, reduce]);
    return <span ref={ref} className={cn('number-ticker', className)} aria-label={format(value)}>{format(value)}</span>;
}
export function BorderBeam({ active = true }: {
    active?: boolean;
}) { return active ? <span className="border-beam" aria-hidden="true"/> : null; }
export function BlurFade({ children, delay = 0, className }: {
    children: ReactNode;
    delay?: number;
    className?: string;
}) {
    const reduce = useReducedMotion();
    return <motion.div className={className} initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, delay }}>{children}</motion.div>;
}
