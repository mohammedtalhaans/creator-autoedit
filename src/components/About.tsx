import { ArrowUpRight, Film, GitBranch, ShieldCheck } from 'lucide-react'
import { Card, Modal } from './ui/primitives'
import { repoUrl } from '../lib/utils'

export function About({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const url = repoUrl()
  return <Modal open={open} onOpenChange={onOpenChange} title="A private studio for your next take" description="Creator AutoEdit · on-device recording and editing" wide>
    <div className="about-intro"><div className="about-icon"><ShieldCheck size={26}/></div><div><h3>Your video stays on this device.</h3><p>Recordings, scripts, and edits remain in this browser session and local library.</p></div></div>
    <div className="about-grid">
      <Card className="about-card"><span className="eyebrow-small">PRIVACY DETAILS</span><p>Creator AutoEdit reads your selected video locally. Camera recordings are written to the browser’s local recording library so you can review a take before continuing.</p><p>No account, analytics, database, or session replay is required. Browser storage can be evicted, so download important takes before clearing site data.</p></Card>
      <Card className="about-card"><span className="eyebrow-small">INSIDE THE STUDIO</span><div className="architecture-mini mono"><span><Film size={12}/> CAMERA + MIC</span><i>↓</i><span>NATIVE MEDIARECORDER</span><i>↓</i><span>ORDERED LOCAL CHUNKS</span><i>↓</i><strong>H.264 + AAC → MP4</strong></div></Card>
    </div>
    <section className="about-limitations"><h3>Designed for short talking videos.</h3><p>English talking-head clips up to 5 minutes work best. Input codecs, output size, and speed depend on your browser and hardware. Portrait and landscape recordings keep their negotiated display dimensions for review and editing.</p><p>This source build is a release candidate. See <code>QA_REPORT.md</code> in the repository for the exact verification status.</p></section>
    <div className="about-source">{url ? <a href={url} target="_blank" rel="noopener noreferrer"><GitBranch size={17}/>Source, architecture &amp; license notices<ArrowUpRight size={15}/></a> : <p>Source code is included with this build. Set <code>VITE_REPOSITORY_URL</code> to your repository.</p>}<span className="mono">RELEASE CANDIDATE / 0.9</span></div>
  </Modal>
}
