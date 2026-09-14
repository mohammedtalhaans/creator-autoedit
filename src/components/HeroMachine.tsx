import { useEffect, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'motion/react';
import { Check, Scissors, AudioLines, ScanFace, Captions } from 'lucide-react';
import { NumberTicker } from './magic/signal';
const bars = Array.from({ length: 54 }, (_, i) => .2 + .8 * Math.abs(Math.sin(i * 2.17) * Math.cos(i * .53)));
export function HeroMachine() {
    const [step, setStep] = useState(0), reduce = useReducedMotion();
    useEffect(() => {
        if (reduce)
            return;
        const id = setInterval(() => setStep(s => (s + 1) % 5), 1400);
        return () => clearInterval(id);
    }, [reduce]);
    const active = reduce ? 3 : step;
    return <div className="hero-machine" aria-label="Illustration: remove pauses, add captions, balance voice, and reframe vertically">
  <div className="machine-top"><span><i className="led"/> SIGNAL STUDIO</span><span className="mono">LOCAL / 001</span></div>
  <div className="machine-stage"><div className="monitor-grid"/><span className="monitor-corner tl"/><span className="monitor-corner br"/>
   <div className="stage-readout"><span className="mono">INPUT SIGNAL</span><span className="tiny-pill">ONE TAKE</span></div>
   <motion.div className="hero-frame" animate={{ width: active >= 3 ? '52%' : '86%' }} transition={{ type: 'spring', stiffness: 110, damping: 23 }}>
    <svg className="hero-subject" viewBox="0 0 420 370" aria-hidden="true"><defs><linearGradient id="shirt" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#898c7f"/><stop offset="1" stopColor="#323830"/></linearGradient><linearGradient id="face" x1="0" y1="0" x2="1" y2=".8"><stop stopColor="#b3a48f"/><stop offset="1" stopColor="#5b544d"/></linearGradient><radialGradient id="wall"><stop stopColor="#3b4540"/><stop offset="1" stopColor="#1a2220"/></radialGradient><pattern id="micro" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".45" fill="#fff" opacity=".07"/></pattern></defs><rect width="420" height="370" fill="url(#wall)"/><path d="M30 0V370M74 0V370M346 0V370M389 0V370" stroke="#fff" opacity=".045"/><circle cx="310" cy="86" r="52" fill="#899079" opacity=".10"/><ellipse cx="215" cy="348" rx="153" ry="16" fill="#050a07" opacity=".4"/><path d="M72 370L90 255Q106 224 177 209H251Q320 223 337 255L354 370Z" fill="url(#shirt)"/><path d="M179 186V222Q214 248 250 219V183" fill="url(#face)"/><path d="M166 91Q163 44 214 44Q268 43 271 96L262 161Q251 196 214 205Q174 194 165 158Z" fill="url(#face)"/><path d="M165 116L158 99Q157 35 214 32Q281 35 271 115L257 85Q235 86 222 70Q192 92 172 86Z" fill="#1c2521"/><path d="M180 123Q190 117 199 123M231 123Q241 117 250 123" stroke="#34362c" strokeWidth="4" fill="none"/><path d="M214 126L210 149L220 151" stroke="#695e50" strokeWidth="3" fill="none"/><path d="M198 170Q216 180 235 167" stroke="#403e35" strokeWidth="3" fill="none"/><path d="M176 233L154 370M251 233L278 370" stroke="#a1a78d" opacity=".2"/><rect width="420" height="370" fill="url(#micro)"/></svg>
    <div className="frame-top"><span>REC</span><i /></div>
    <AnimatePresence>{active >= 1 && <motion.div className="hero-caption" initial={{ y: 8, scale: .92, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ opacity: 0 }}><span>Make every</span><span><em>word</em> count.</span></motion.div>}</AnimatePresence>
    {active >= 3 && <motion.div className="face-target" initial={{ opacity: 0, scale: 1.15 }} animate={{ opacity: 1, scale: 1 }}><span /><span /><span /><span /></motion.div>}
    <span className="frame-format mono">{active >= 3 ? '9:16' : '16:9'}</span>
   </motion.div>
   <div className="hero-meter"><span className="mono">VOICE</span>{Array.from({ length: 18 }, (_, i) => <motion.i key={i} animate={{ opacity: active >= 2 ? (i < 13 ? 1 : .16) : (i < 9 + (step % 2) * 7 ? 1 : .16) }} className={i > 14 ? 'peak' : ''}/>)}<span className="mono">−12</span></div>
   <span className="hero-illustration mono">PRODUCT ILLUSTRATION</span>
  </div>
  <div className="machine-timeline"><div className="timeline-heading"><span className="mono">{active ? 'THE GOOD PARTS' : 'YOUR ONE TAKE'}</span><span className="duration"><NumberTicker value={active ? 68 : 94} format={n => `01:${Math.max(0, Math.round(n - 60)).toString().padStart(2, '0')}`}/><span className="mono"> / 01:34</span></span></div>
   <LayoutGroup><div className="hero-wave">{[0, 1, 2].map(group => <motion.div layout className="hero-wave-group" key={group}>{bars.slice(group * 18, group * 18 + 18).map((v, i) => <i key={i} style={{ height: `${v * 100}%` }}/>)}{group < 2 && <motion.span className="hero-gap" animate={{ width: active > 0 ? 0 : 38, opacity: active > 0 ? 0 : 1 }} transition={{ duration: .65 }}><span>PAUSE</span></motion.span>}</motion.div>)}</div></LayoutGroup>
   <div className="machine-modules">{[{ icon: Scissors, label: 'Autocut' }, { icon: Captions, label: 'Captions' }, { icon: AudioLines, label: 'Voice' }, { icon: ScanFace, label: 'Frame' }].map((item, i) => <div key={item.label} className={active > i ? 'is-lit' : ''}><item.icon size={12}/>{item.label}{active > i && <Check size={11}/>}</div>)}</div>
  </div>
  <motion.div className="floating-chip" animate={{ y: reduce ? 0 : [0, -5, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}><div className="chip-icon"><Check size={15}/></div><div><strong>No upload. All yours.</strong><span>Made on your device.</span></div></motion.div>
 </div>;
}
