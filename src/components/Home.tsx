import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, ShieldCheck, Scissors, Captions, AudioLines, ScanFace, Play, Loader2, Smartphone, Video } from 'lucide-react';
import { Brand, RepositoryLink } from './Brand';
import { FileUpload } from './aceternity/file-upload';
import { Button } from './ui/primitives';
import { HeroMachine } from './HeroMachine';
import { studio, useStudio } from '../app/store';
export function Home({ onAbout, onRecord }: {
    onAbout: () => void;
    onRecord?: () => void;
}) {
    const { capabilities } = useStudio();
    const [demoBusy, setDemoBusy] = useState(false);
    const blocked = !!capabilities?.reason;
    const demo = async () => {
        setDemoBusy(true);
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}demo/one-take.mp4`);
            if (!response.ok)
                throw new Error('The bundled demo is missing. Choose your own talking video instead.');
            const blob = await response.blob();
            void studio.ingest(new File([blob], 'Signal Studio — illustrated demo.mp4', { type: 'video/mp4' }));
        }
        catch (error) {
            studio.fail('Demo couldn’t open', error);
        }
        finally {
            setDemoBusy(false);
        }
    };
    return <div className="home"><header className="site-header"><Brand onClick={() => scrollTo({ top: 0, behavior: 'smooth' })}/><div className="header-right"><span className="release-tag mono">THE ON-DEVICE EDITOR</span><RepositoryLink onAbout={onAbout}/></div></header>
  <main><section className="hero"><div className="hero-copy"><motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="eyebrow"><span className="status-light"/> LESS EDITING. MORE CREATING.</motion.div>
   <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .06, duration: .45 }}>Your raw video,<br /><span>minus the<br />awkward parts.</span></motion.h1>
   <p className="hero-description">Cuts pauses. Adds captions. Cleans your voice.<br className="desktop-break"/> Frames it for Reels. All right here.</p>
   <div className="hero-actions"><FileUpload onFile={file => void studio.ingest(file)} disabled={blocked || !capabilities}>{!capabilities ? 'Checking your device…' : 'Choose video'}</FileUpload>{onRecord && <Button variant="secondary" size="large" onClick={onRecord}><Video size={16}/>Record with teleprompter</Button>}<Button variant="ghost" size="large" onClick={() => void demo()} disabled={blocked || !capabilities || demoBusy}>{demoBusy ? <Loader2 className="spin" size={17}/> : <Play size={16}/>}Try demo<ArrowRight size={15}/></Button></div>
   <p className="trust-line"><ShieldCheck size={14}/>Processed on your device<span>·</span>No upload</p>
   <p className="input-note">MP4, MOV & WebM · Up to 5 min · Under 3 min recommended</p>
   <p className="demo-note">Demo uses an original illustration and synthetic speech.</p>
   {blocked && <div className="compatibility-card" role="status"><Smartphone size={24}/><div><strong>{capabilities?.inApp ? 'Open in your browser to edit' : 'A different browser is needed'}</strong><p>{capabilities?.reason}</p>{capabilities?.inApp && <p>Tap the app’s menu (•••), then “Open in browser” or “Open in Safari”.</p>}</div></div>}
  </div><motion.div className="hero-visual" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, delay: .12 }}><HeroMachine /><div className="hero-visual-caption"><span className="mono">01 — RAW IN. READY OUT.</span><span>One take is all it takes.</span></div></motion.div></section>
  <section className="product-strip" aria-label="Editing features"><div className="strip-title"><span className="mono">YOUR LITTLE<br />POST-PRODUCTION STUDIO</span><ArrowUpRight size={24}/></div>{[{ n: '01', icon: Scissors, title: 'Find your flow.', copy: 'Keep the voice. Lose the dead air.' }, { n: '02', icon: Captions, title: 'Make it readable.', copy: 'Local captions with a point of view.' }, { n: '03', icon: AudioLines, title: 'Clean up the signal.', copy: 'Less room noise. More you.' }, { n: '04', icon: ScanFace, title: 'Own the frame.', copy: 'Your one take, made for vertical.' }].map(f => <div key={f.n} className="feature"><div className="feature-top"><f.icon size={17}/><span className="mono">{f.n}</span></div><h2>{f.title}</h2><p>{f.copy}</p></div>)}</section>
  <section className="privacy-line"><ShieldCheck size={18}/><p>Your video stays on your device. Editing and transcription happen locally in your browser.</p><button onClick={onAbout}>The details<ArrowUpRight size={13}/></button></section>
  </main><footer className="site-footer"><span>Built for your voice. Not your data.</span><span className="mono">SIGNAL STUDIO / CREATOR AUTOEDIT</span><button onClick={onAbout}>About & privacy</button></footer>
 </div>;
}
