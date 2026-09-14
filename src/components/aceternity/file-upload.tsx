import { useRef, useState, type ReactNode } from 'react';
import { Upload, Plus } from 'lucide-react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';
/** Original accessible upload/glow implementation; no restricted third-party source copied. */
export function FileUpload({ onFile, disabled = false, children }: {
    onFile: (file: File) => void;
    disabled?: boolean;
    children?: ReactNode;
}) {
    const ref = useRef<HTMLInputElement>(null), [over, setOver] = useState(false);
    const depth = useRef(0);
    return <div className={cn('file-upload', over && 'drag-over')} onDragEnter={e => { e.preventDefault(); depth.current++; setOver(true); }} onDragLeave={e => {
            e.preventDefault();
            if (--depth.current <= 0)
                setOver(false);
        }} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }} onDrop={e => {
            e.preventDefault();
            depth.current = 0;
            setOver(false);
            const file = e.dataTransfer.files[0];
            if (file && !disabled)
                onFile(file);
        }}>
  <input ref={ref} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" className="sr-only" aria-label="Choose a video file" disabled={disabled} onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f)
                onFile(f);
        }}/>
  <MagneticButton disabled={disabled} onClick={() => ref.current?.click()}><Plus size={20}/>{children ?? 'Choose video'}<span className="cta-key"><Upload size={13}/></span></MagneticButton>
  <span className="drop-hint">or drop your video here</span>
  {over && <div className="drop-message"><Upload size={30}/><strong>Drop it into the studio</strong><span>Your video stays on your device.</span></div>}
 </div>;
}
export function MagneticButton({ children, onClick, disabled = false }: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
}) {
    const x = useMotionValue(0), y = useMotionValue(0), sx = useSpring(x, { stiffness: 280, damping: 24 }), sy = useSpring(y, { stiffness: 280, damping: 24 });
    const reduce = useReducedMotion();
    return <motion.button type="button" disabled={disabled} className="button button-primary button-large magnetic" onClick={onClick} style={{ x: sx, y: sy }} onPointerMove={e => {
            if (e.pointerType !== 'mouse' || reduce)
                return;
            const r = e.currentTarget.getBoundingClientRect();
            x.set((e.clientX - r.left - r.width / 2) * .045);
            y.set((e.clientY - r.top - r.height / 2) * .07);
        }} onPointerLeave={() => { x.set(0); y.set(0); }} whileTap={reduce ? undefined : { scale: .985 }}>{children}</motion.button>;
}
export function GlowSurface({ children, className }: {
    children: ReactNode;
    className?: string;
}) {
    return <div className={cn('glow-surface', className)} onPointerMove={e => {
            if (e.pointerType !== 'mouse')
                return;
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty('--pointer-x', `${e.clientX - r.left}px`);
            e.currentTarget.style.setProperty('--pointer-y', `${e.clientY - r.top}px`);
        }}>{children}</div>;
}
