import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, History, Loader2, Radio, X } from 'lucide-react'
import type { CaptureSettings, RecorderSnapshot, ScriptDocument, TakeRecord } from '../../types/recording'
import { createScriptDocument, getRecordingRuntime } from '../../features/teleprompter/recordingBridge'
import { parsePrompt } from '../../features/teleprompter/text'
import { restoreLocalFonts } from '../../features/teleprompter/fonts'
import { Alert, Button, IconButton, Stepper } from '../ui/primitives'
import { PromptReader } from './PromptReader'
import { RecordPanel } from './RecordPanel'
import { ScriptPanel } from './ScriptPanel'
import { TakesPanel } from './TakesPanel'
import { TakeReview } from './TakeReview'

export interface TeleprompterStudioProps {
  onClose: () => void
  onImportVideo?: () => void
  initialReviewTakeId?: string
  onEditTake: (file: File, take: TakeRecord) => void
}

type StudioStep = 'script' | 'record' | 'review'

const FLOW_STEPS = [
  { id: 'script', label: 'Script', description: 'Write your prompt' },
  { id: 'record', label: 'Record', description: 'Capture a take' },
  { id: 'review', label: 'Review', description: 'Choose what to keep' },
  { id: 'edit', label: 'Edit', description: 'Shape the final cut' },
] as const

const STEP_LABEL: Record<StudioStep, string> = { script: 'Script', record: 'Record', review: 'Review' }

function asStudioStep(value: unknown): StudioStep | null {
  return value === 'script' || value === 'record' || value === 'review' ? value : null
}

export function TeleprompterStudio({ onClose, onImportVideo, initialReviewTakeId, onEditTake }: TeleprompterStudioProps) {
  const runtime = useMemo(() => getRecordingRuntime(), [])
  const { recordingLibrary, recorder } = runtime
  const [scripts, setScripts] = useState<ScriptDocument[]>([])
  const [activeId, setActiveId] = useState('')
  const [step, setStep] = useState<StudioStep>('script')
  const [reviewTake, setReviewTake] = useState<TakeRecord | null>(null)
  const [takes, setTakes] = useState<TakeRecord[]>([])
  const [snapshot, setSnapshot] = useState<RecorderSnapshot>(() => recorder.getSnapshot())
  const [captureSettings, setCaptureSettings] = useState<CaptureSettings>(() => runtime.defaultCaptureSettings())
  const [loading, setLoading] = useState(true)
  const [takesLoading, setTakesLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recoveryAvailable, setRecoveryAvailable] = useState(false)
  const [promptPlaying, setPromptPlaying] = useState(false)
  const [promptToggleRequest, setPromptToggleRequest] = useState(0)
  const scriptSaveTimer = useRef<number | undefined>(undefined)
  const stepRef = useRef<StudioStep>('script')
  const activeRef = useRef<ScriptDocument | null>(null)
  const historyEntryRef = useRef(false)
  const editorReturnRef = useRef(Boolean(initialReviewTakeId))
  const closeRef = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const active = useMemo(() => scripts.find((script) => script.id === activeId) ?? scripts[0] ?? createScriptDocument('Untitled script', ''), [activeId, scripts])
  activeRef.current = active
  stepRef.current = step

  useEffect(() => { void restoreLocalFonts() }, [])

  useEffect(() => {
    const unsubscribe = recorder.subscribe(() => setSnapshot({ ...recorder.getSnapshot() }))
    return unsubscribe
  }, [recorder])

  useEffect(() => {
    if (snapshot.status !== 'error' && !snapshot.notice?.toLocaleLowerCase().includes('recovery')) return
    let cancelled = false
    void recorder.getRecoveryBlob?.().then((blob) => { if (!cancelled) setRecoveryAvailable(Boolean(blob && blob.size > 0)) }).catch(() => { if (!cancelled) setRecoveryAvailable(false) })
    return () => { cancelled = true }
  }, [recorder, snapshot.error, snapshot.notice, snapshot.status, snapshot.savedBytes])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [storedScripts, storedSettings] = await Promise.all([recordingLibrary.listScripts(), recordingLibrary.getCaptureSettings()])
        await recordingLibrary.recoverInterrupted()
        if (cancelled) return
        let nextScripts = storedScripts
        if (!nextScripts.length) {
          const first = await recordingLibrary.saveScript(createScriptDocument('First script', ''))
          nextScripts = [first]
        }
        setScripts(nextScripts)
        setActiveId(nextScripts[0].id)
        setCaptureSettings(storedSettings)
      } catch (loadError) { if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError)) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [recordingLibrary])

  const refreshTakes = useCallback(async (scriptId = active.id) => {
    setTakesLoading(true)
    try { setTakes(await recordingLibrary.listTakes(scriptId)) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : String(loadError)) }
    finally { setTakesLoading(false) }
  }, [active.id, recordingLibrary])

  useEffect(() => { if (!loading) void refreshTakes() }, [loading, refreshTakes])

  useEffect(() => {
    if (loading || !initialReviewTakeId) return
    let cancelled = false
    void recordingLibrary.getTake(initialReviewTakeId).then((take) => {
      if (cancelled || !take) return
      setReviewTake(take)
      setStep('review')
      try { window.history.replaceState({ creatorAutoEditPrompter: true, step: 'review' }, '', window.location.href); historyEntryRef.current = true } catch { /* Optional in embedded shells. */ }
    }).catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError)) })
    return () => { cancelled = true }
  }, [initialReviewTakeId, loading, recordingLibrary])

  useEffect(() => {
    if (typeof window === 'undefined' || historyEntryRef.current) return
    try {
      if (window.history.state?.creatorAutoEditPrompter) { historyEntryRef.current = true; return }
      window.history.pushState({ creatorAutoEditPrompter: true, step: 'script' }, '', window.location.href)
      historyEntryRef.current = true
    } catch { historyEntryRef.current = false }
  }, [])

  const closeCamera = useCallback(async () => {
    try { await recorder.close() } finally { setSnapshot({ ...recorder.getSnapshot() }) }
  }, [recorder])

  const persistScript = useCallback(async (doc: ScriptDocument) => {
    window.clearTimeout(scriptSaveTimer.current)
    const saved = await recordingLibrary.saveScript({ ...doc, updatedAt: Date.now() })
    setScripts((current) => current.map((script) => script.id === saved.id ? saved : script))
    return saved
  }, [recordingLibrary])

  const updateScript = useCallback((patch: Partial<ScriptDocument>) => {
    setScripts((current) => current.map((script) => script.id === active.id ? { ...script, ...patch, updatedAt: Date.now() } : script))
    window.clearTimeout(scriptSaveTimer.current)
    scriptSaveTimer.current = window.setTimeout(() => {
      const next = { ...active, ...patch, updatedAt: Date.now() }
      void recordingLibrary.saveScript(next).then((saved) => setScripts((current) => current.map((script) => script.id === saved.id ? saved : script))).catch((saveError) => setError(saveError instanceof Error ? saveError.message : String(saveError)))
    }, 180)
  }, [active, recordingLibrary])

  const createScript = useCallback(() => {
    void recordingLibrary.saveScript(createScriptDocument('Untitled script', '', runtime.defaultPromptSettings())).then((script) => { setScripts((current) => [script, ...current]); setActiveId(script.id); setStep('script') }).catch((saveError) => setError(saveError instanceof Error ? saveError.message : String(saveError)))
  }, [recordingLibrary, runtime])

  const importScript = useCallback((result: { title: string; text: string }) => {
    void recordingLibrary.saveScript(createScriptDocument(result.title, result.text, active.settings)).then((script) => { setScripts((current) => [script, ...current]); setActiveId(script.id); setNotice(`Imported “${script.title}” into the script library.`) }).catch((importError) => setError(importError instanceof Error ? importError.message : String(importError)))
  }, [active.settings, recordingLibrary])

  const deleteScript = useCallback(() => {
    if (scripts.length <= 1) { setNotice('Keep at least one script in the library.'); return }
    if (!window.confirm(`Delete “${active.title}”? Its recorded takes remain available.`)) return
    void recordingLibrary.deleteScript(active.id).then(() => { const remaining = scripts.filter((script) => script.id !== active.id); setScripts(remaining); setActiveId(remaining[0]?.id ?? '') }).catch((deleteError) => setError(deleteError instanceof Error ? deleteError.message : String(deleteError)))
  }, [active, recordingLibrary, scripts])

  const pushStep = useCallback((next: StudioStep) => {
    setStep(next)
    try { window.history.pushState({ creatorAutoEditPrompter: true, step: next }, '', window.location.href); historyEntryRef.current = true } catch { /* History is optional in embedded test shells. */ }
  }, [])

  const openRecord = useCallback(async (replaceHistory = false) => {
    setError('')
    if (replaceHistory) {
      setStep('record')
      try { window.history.replaceState({ creatorAutoEditPrompter: true, step: 'record' }, '', window.location.href) } catch { /* Optional in embedded shells. */ }
    } else pushStep('record')
    if (recorder.getSnapshot().stream) return
    try { await recorder.open(captureSettings); setSnapshot({ ...recorder.getSnapshot() }) }
    catch (openError) { setError(openError instanceof Error ? openError.message : String(openError)) }
  }, [captureSettings, pushStep, recorder])

  const continueScript = useCallback(async () => {
    setError('')
    if (!active.text.trim()) { setError('Add a few words before opening the camera.'); headingRef.current?.focus(); return }
    try { await persistScript(active); await openRecord() }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : String(saveError)) }
  }, [active, openRecord, persistScript])

  const changeCaptureSettings = useCallback((patch: Partial<CaptureSettings>) => {
    const next = { ...captureSettings, ...patch, controls: { ...captureSettings.controls, ...(patch.controls ?? {}) } }
    setCaptureSettings(next)
    void recordingLibrary.saveCaptureSettings(next).catch((saveError) => setError(saveError instanceof Error ? saveError.message : String(saveError)))
    const reopensStream = (['cameraId', 'microphoneId', 'facingMode', 'resolution', 'fps', 'portrait'] as Array<keyof CaptureSettings>).some((key) => patch[key] !== undefined)
    if (recorder.getSnapshot().stream) {
      const operation = reopensStream ? recorder.switchCamera(next) : recorder.applySettings(patch)
      void operation.then(() => setSnapshot({ ...recorder.getSnapshot() })).catch((applyError) => setError(applyError instanceof Error ? applyError.message : String(applyError)))
    }
  }, [captureSettings, recorder, recordingLibrary])

  const startRecording = useCallback(async () => {
    setError('')
    setRecoveryAvailable(false)
    const take = await recorder.start(active, active.cursor)
    setSnapshot({ ...recorder.getSnapshot(), activeTake: take })
  }, [active, recorder])

  const probeRecovery = useCallback(async () => {
    try { const blob = await recorder.getRecoveryBlob?.(); setRecoveryAvailable(Boolean(blob && blob.size > 0)) }
    catch { setRecoveryAvailable(false) }
  }, [recorder])

  const stopRecording = useCallback(async (): Promise<TakeRecord> => {
    setError('')
    try {
      const take = await recorder.stop(active.cursor)
      setSnapshot({ ...recorder.getSnapshot(), activeTake: take })
      setReviewTake(take)
      pushStep('review')
      void refreshTakes()
      if (take.status !== 'complete') await probeRecovery()
      return take
    } catch (stopError) {
      await probeRecovery()
      setError(stopError instanceof Error ? stopError.message : String(stopError))
      throw stopError
    }
  }, [active.cursor, probeRecovery, pushStep, recorder, refreshTakes])

  const closeStudio = useCallback(async () => {
    if (closeRef.current) return
    closeRef.current = true
    setError('')
    try {
      const current = recorder.getSnapshot()
      if (current.status === 'recording' || current.status === 'saving') await recorder.stop(active.cursor)
      await closeCamera()
      onClose()
    } catch (closeError) {
      closeRef.current = false
      await probeRecovery()
      setError(closeError instanceof Error ? closeError.message : String(closeError))
    }
  }, [active.cursor, closeCamera, onClose, probeRecovery, recorder])

  const navigateBack = useCallback(async (fromBrowser = false) => {
    const currentStep = stepRef.current
    const currentScript = activeRef.current ?? active
    if (!fromBrowser && currentStep === 'review' && editorReturnRef.current && !recorder.getSnapshot().stream) {
      editorReturnRef.current = false
      setReviewTake(null)
      pushStep('record')
      try { await recorder.open(captureSettings) } catch (openError) { setError(openError instanceof Error ? openError.message : String(openError)) }
      return
    }
    if (!fromBrowser && historyEntryRef.current) {
      try { window.history.back(); return } catch { /* Fall through to direct navigation. */ }
    }
    if (currentStep === 'script') { await closeStudio(); return }
    if (currentStep === 'review') {
      setReviewTake(null)
      if (fromBrowser) setStep('record'); else pushStep('record')
      if (!recorder.getSnapshot().stream) { try { await recorder.open(captureSettings) } catch (openError) { setError(openError instanceof Error ? openError.message : String(openError)) } }
      return
    }
    const current = recorder.getSnapshot()
    if (current.status === 'recording' || current.status === 'saving') {
      try { await recorder.stop(currentScript.cursor) } catch (stopError) { setError(stopError instanceof Error ? stopError.message : String(stopError)); return }
    }
    await closeCamera()
    setReviewTake(null)
    if (fromBrowser) setStep('script'); else pushStep('script')
  }, [active, captureSettings, closeCamera, closeStudio, pushStep, recorder])

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (closeRef.current) return
      const target = asStudioStep(event.state?.creatorAutoEditPrompter ? event.state.step : null)
      if (!target) { void closeStudio(); return }
      if (target === 'record') {
        setReviewTake(null)
        setStep('record')
        if (!recorder.getSnapshot().stream) void recorder.open(captureSettings).then(() => setSnapshot({ ...recorder.getSnapshot() })).catch((openError) => setError(openError instanceof Error ? openError.message : String(openError)))
        return
      }
      if (target === 'script') {
        const current = recorder.getSnapshot()
        const finish = async () => {
          if (current.status === 'recording' || current.status === 'saving') {
            try { await recorder.stop(activeRef.current?.cursor ?? 0) } catch (stopError) { setError(stopError instanceof Error ? stopError.message : String(stopError)); return }
          }
          await closeCamera()
          setReviewTake(null)
          setStep('script')
        }
        void finish()
        return
      }
      if (target === 'review' && reviewTake) setStep('review')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [captureSettings, closeCamera, closeStudio, recorder, reviewTake])

  useEffect(() => {
    const id = window.requestAnimationFrame(() => headingRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [step])

  useEffect(() => () => { window.clearTimeout(scriptSaveTimer.current); void recorder.close() }, [recorder])

  const editTake = useCallback(async (take: TakeRecord) => {
    try {
      const blob = await recordingLibrary.getTakeBlob(take.id)
      onEditTake(new File([blob], `${take.title || 'creator-autoedit-take'}.${take.mimeType.includes('mp4') ? 'mp4' : 'webm'}`, { type: take.mimeType }), take)
    } catch (takeError) { setError(takeError instanceof Error ? takeError.message : String(takeError)) }
  }, [onEditTake, recordingLibrary])

  const downloadTake = useCallback(async (take: TakeRecord) => {
    try {
      const blob = await recordingLibrary.getTakeBlob(take.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${take.title || 'take'}.${take.mimeType.includes('mp4') ? 'mp4' : 'webm'}`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (takeError) { setError(takeError instanceof Error ? takeError.message : String(takeError)) }
  }, [recordingLibrary])

  const retake = useCallback((take: TakeRecord) => {
    const prompt = parsePrompt(active.text)
    const current = prompt.spokenTokens[Math.max(0, Math.min(prompt.spokenTokens.length - 1, take.startWord))]
    const rewindToSentence = Math.max(0, (current?.sentence ?? 0) - 1)
    const target = prompt.spokenTokens.findIndex((token) => token.sentence >= rewindToSentence)
    const replaceHistory = stepRef.current === 'review'
    updateScript({ cursor: target < 0 ? Math.max(0, take.startWord - 10) : target })
    editorReturnRef.current = false
    setReviewTake(null)
    setHistoryOpen(false)
    if (replaceHistory && recorder.getSnapshot().stream) {
      try { window.history.back(); return } catch { /* Fall through to opening the current record surface. */ }
    }
    void openRecord(replaceHistory)
  }, [active.text, openRecord, recorder, updateScript])

  const retakeReview = useCallback(() => { if (reviewTake) retake(reviewTake) }, [retake, reviewTake])
  const backFromReview = useCallback(() => { void navigateBack() }, [navigateBack])
  const keepReview = useCallback(() => { if (reviewTake) void editTake(reviewTake) }, [editTake, reviewTake])
  const favouriteReview = useCallback((starred: boolean) => {
    if (!reviewTake) return
    void recordingLibrary.updateTake(reviewTake.id, { starred }).then((saved) => { if (saved) setReviewTake(saved); void refreshTakes() }).catch((takeError) => setError(takeError instanceof Error ? takeError.message : String(takeError)))
  }, [recordingLibrary, refreshTakes, reviewTake])
  const requestStorage = useCallback(() => { void recorder.requestPersistentStorage?.().then((granted) => setNotice(granted ? 'Persistent storage granted for the recording library.' : 'Storage persistence was not granted; download important takes.')).catch((storageError) => setError(storageError instanceof Error ? storageError.message : String(storageError))) }, [recorder])
  const testMic = useCallback(() => { void recorder.testMicrophone().then(() => setNotice('Microphone test complete.')).catch((micError) => setError(micError instanceof Error ? micError.message : String(micError))) }, [recorder])

  const readerProps = { script: active, settings: active.settings, onCursorChange: (cursor: number) => updateScript({ cursor }), compact: true, captureActive: step === 'record' && snapshot.status === 'recording', onPlayingChange: setPromptPlaying }
  const openPromptHistory = () => { setHistoryOpen((open) => !open); void refreshTakes() }

  if (loading) return <div className="tp-studio tp-loading"><Loader2 className="spin" size={20}/><span>Opening your script library…</span></div>

  return <div className={`tp-studio tp-current-${step}`}>
    {step !== 'record' && step !== 'review' && <header className="tp-studio-header">
      <IconButton label="Back to home" onClick={() => void navigateBack()}><ArrowLeft size={19}/></IconButton>
      <div className="tp-studio-title"><span className="eyebrow-small">CREATOR AUTOEDIT</span><h1 ref={headingRef} tabIndex={-1}>{STEP_LABEL[step]}</h1></div>
      <Stepper className="tp-progress" steps={FLOW_STEPS.map((item) => ({ ...item, disabled: item.id !== step }))} current={step}/>
      <IconButton label={historyOpen ? 'Close take history' : 'Open take history'} onClick={openPromptHistory}><History size={18}/></IconButton>
    </header>}
    {step === 'record' && null}
    {step === 'review' && null}
    {(step === 'record' || step === 'review') && <div className="tp-fullscreen-progress" aria-label="Recording flow progress"><Stepper className="tp-progress" steps={FLOW_STEPS.map((item) => ({ ...item, disabled: true }))} current={step}/></div>}
    {error && step !== 'record' && step !== 'review' && <Alert className="tp-global-alert" title="Something needs attention" variant="destructive"><span>{error}</span><IconButton label="Dismiss error" onClick={() => setError('')}><X size={15}/></IconButton></Alert>}
    {notice && <div className="tp-global-notice" role="status"><Radio size={15}/><span>{notice}</span><IconButton label="Dismiss notification" onClick={() => setNotice('')}><X size={15}/></IconButton></div>}

    {step === 'script' && <main className="tp-studio-main tp-step-script"><ScriptPanel scripts={scripts} active={active} onSelect={(id) => setActiveId(id)} onChange={updateScript} onCreate={createScript} onDelete={deleteScript} onImport={importScript}/></main>}
    {step === 'record' && <RecordPanel snapshot={snapshot} settings={captureSettings} script={active} reader={<PromptReader {...readerProps} toggleRequest={promptToggleRequest}/>} onBack={() => void navigateBack()} onSettingsChange={changeCaptureSettings} onOpen={openRecord} onStart={startRecording} onStop={stopRecording} onTestMic={testMic} onRequestStorage={requestStorage} onRecoveryDownload={() => void recorder.getRecoveryBlob?.().then((blob) => { if (!blob) throw new Error('No recovered media bytes are available yet.'); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${active.title || 'recovered-take'}.recovered.webm`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0) }).catch((downloadError) => setError(downloadError instanceof Error ? downloadError.message : String(downloadError)))} onSwitchCamera={() => { void recorder.switchCamera(captureSettings).then(() => setSnapshot({ ...recorder.getSnapshot() })).catch((switchError) => setError(switchError instanceof Error ? switchError.message : String(switchError))) }} recoveryAvailable={recoveryAvailable} onPromptToggle={() => setPromptToggleRequest((request) => request + 1)} promptPlaying={promptPlaying}/>}
    {step === 'review' && reviewTake && <TakeReview take={reviewTake} loadBlob={() => recordingLibrary.getTakeBlob(reviewTake.id)} onBack={backFromReview} onRetake={retakeReview} onKeep={keepReview} onDownload={() => void downloadTake(reviewTake)} onFavourite={favouriteReview}/>}

    {step === 'script' && <footer className="tp-flow-actions" aria-label="Script actions"><Button variant="ghost" onClick={onImportVideo} disabled={!onImportVideo}>Import video</Button><Button variant="primary" onClick={() => void continueScript()}>Continue<ArrowRight size={17}/></Button></footer>}

    {historyOpen && <div className="tp-history-layer" role="dialog" aria-modal="true" aria-label="Take history"><button className="tp-history-backdrop" type="button" aria-label="Close take history" onClick={() => setHistoryOpen(false)}/><aside className="tp-history-drawer"><header><div><span className="eyebrow-small">HISTORY</span><h2>Your takes</h2></div><IconButton label="Close take history" onClick={() => setHistoryOpen(false)}><X size={18}/></IconButton></header><TakesPanel takes={takes} loading={takesLoading} onStar={(take) => { void recordingLibrary.updateTake(take.id, { starred: !take.starred }).then(() => refreshTakes()).catch((takeError) => setError(takeError instanceof Error ? takeError.message : String(takeError))) }} onDelete={(take) => { if (!window.confirm(`Delete ${take.title || 'this take'}?`)) return; void recordingLibrary.deleteTake(take.id).then(() => refreshTakes()).catch((takeError) => setError(takeError instanceof Error ? takeError.message : String(takeError))) }} onDownload={(take) => void downloadTake(take)} onEdit={(take) => void editTake(take)} onRetake={retake}/></aside></div>}
  </div>
}
