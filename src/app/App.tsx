import { useEffect, useRef, useState, Component, type ComponentProps, type ErrorInfo, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react'
import { ArrowRight, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { Home } from '../components/Home'
import { Analysis } from '../components/Analysis'
import { Editor } from '../components/Editor'
import { Exporting, Complete } from '../components/Export'
import { About } from '../components/About'
import { Modal, Button, Tooltip } from '../components/ui/primitives'
import { TeleprompterStudio } from '../components/teleprompter/TeleprompterStudio'
import { studio, useStudio } from './store'

function Studio() {
  const state = useStudio()
  const [about, setAbout] = useState(false)
  const [newTake, setNewTake] = useState(false)
  // Script is the app's first useful surface. Opening the prompter itself does
  // not request media; the Continue action owns that first permission gesture.
  const [prompter, setPrompter] = useState(true)
  const [returnTakeId, setReturnTakeId] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void studio.initialize()
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (studio.getSnapshot().project) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  useEffect(() => {
    if (!state.notice) return
    const id = window.setTimeout(studio.clearNotice, 8000)
    return () => window.clearTimeout(id)
  }, [state.notice])

  const openExistingVideo = () => input.current?.click()
  const handleExistingVideo = (file: File) => {
    setReturnTakeId(null)
    setPrompter(false)
    void studio.ingest(file)
  }
  const handleEditTake = (file: File, take: Parameters<ComponentProps<typeof TeleprompterStudio>['onEditTake']>[1]) => {
    setReturnTakeId(take.id)
    setPrompter(false)
    void studio.ingest(file, {
      scriptId: take.scriptId,
      takeId: take.id,
      scriptTitle: take.scriptSnapshot.title,
      scriptText: take.scriptSnapshot.text,
      startWord: take.startWord,
    })
  }

  return <MotionConfig reducedMotion="user" transition={{ duration: .22 }}><Tooltip.Provider delayDuration={400}><LayoutGroup><AnimatePresence mode="wait" initial={false}>
    {prompter ? <motion.div key="prompter" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><TeleprompterStudio onClose={() => { setPrompter(false); setReturnTakeId(null) }} onImportVideo={openExistingVideo} initialReviewTakeId={returnTakeId ?? undefined} onEditTake={handleEditTake}/></motion.div>
      : state.stage === 'home' ? <motion.div key="home" exit={{ opacity: 0 }}><Home onAbout={() => setAbout(true)} onRecord={() => { setReturnTakeId(null); setPrompter(true) }}/></motion.div>
        : state.stage === 'ingest' || state.stage === 'analyzing' ? <motion.div key="analysis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Analysis /></motion.div>
          : state.stage === 'editor' && state.project ? <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Editor project={state.project} onAbout={() => setAbout(true)} onNew={() => setNewTake(true)} onBack={() => setPrompter(true)}/></motion.div>
            : state.stage === 'exporting' ? <motion.div key="export" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Exporting /></motion.div>
              : state.stage === 'complete' ? <motion.div key="complete" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Complete onAbout={() => setAbout(true)} onNew={() => setNewTake(true)}/></motion.div> : null}
  </AnimatePresence></LayoutGroup>

  <About open={about} onOpenChange={setAbout}/>
  <Modal open={!!state.error} onOpenChange={(open) => { if (!open) studio.clearError() }} title={state.error?.title ?? 'Something needs attention'} description="Your source video has not been changed.">
    <div className="error-card"><TriangleAlert size={25}/><p>{state.error?.message}</p></div><Button className="full-width" onClick={studio.clearError}>Back to the studio<ArrowRight size={15}/></Button>
  </Modal>
  <Modal open={newTake} onOpenChange={setNewTake} title="A fresh take?" description="The current edit lives only in this tab.">
    <p className="dialog-paragraph">Choose another video to replace this project. Save your exported MP4 first; unsaved edits cannot be restored.</p>
    <div className="dialog-actions"><Button variant="ghost" onClick={() => setNewTake(false)}>Keep editing</Button><Button variant="primary" onClick={() => { setNewTake(false); openExistingVideo() }}>Choose another video<ArrowRight size={14}/></Button></div>
    <Button variant="ghost" size="small" className="home-reset" onClick={() => { setNewTake(false); studio.reset() }}>Discard edit &amp; return home</Button>
  </Modal>
  <input ref={input} className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" aria-label="Choose another video" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) handleExistingVideo(file) }}/>
  <AnimatePresence>{state.notice && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><ShieldCheck size={18}/><p>{state.notice}</p><button aria-label="Dismiss notification" onClick={studio.clearNotice}><X size={15}/></button></motion.div>}</AnimatePresence>
  </Tooltip.Provider></MotionConfig>
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) { studio.cancel() }
  render() { return this.state.failed ? <div className="fatal-error"><img src={`${import.meta.env.BASE_URL}mark.svg`} alt="" width="44"/><h1>The studio needs a reset.</h1><p>Your original video is unchanged. A browser resource or display error interrupted this session.</p><button className="button button-primary" onClick={() => location.reload()}>Reload Creator AutoEdit</button></div> : this.props.children }
}

export default function App() { return <ErrorBoundary><Studio /></ErrorBoundary> }
