import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ChevronRight, FileText, Library, Loader2, Radio, Sparkles, Video, X } from 'lucide-react'
import type { CaptureSettings, RecorderSnapshot, ScriptDocument, TakeRecord } from '../../types/recording'
import { buildPromptTiming } from '../../features/teleprompter/timing'
import { createScriptDocument, getRecordingRuntime } from '../../features/teleprompter/recordingBridge'
import { LocalWritingController } from '../../features/teleprompter/localWriting'
import { parsePrompt } from '../../features/teleprompter/text'
import { restoreLocalFonts } from '../../features/teleprompter/fonts'
import { Button, IconButton } from '../ui/primitives'
import { Brand } from '../Brand'
import { PromptReader } from './PromptReader'
import { RecordPanel } from './RecordPanel'
import { ScriptPanel } from './ScriptPanel'
import { TakesPanel } from './TakesPanel'

export type TeleprompterStudioProps = {
  onClose: () => void
  onEditTake: (file: File, take: TakeRecord) => void
}

type StudioStep = 'script' | 'record' | 'takes'

export function TeleprompterStudio({ onClose, onEditTake }: TeleprompterStudioProps) {
  const runtime = useMemo(() => getRecordingRuntime(), [])
  const { recordingLibrary, recorder } = runtime
  const [scripts, setScripts] = useState<ScriptDocument[]>([])
  const [activeId, setActiveId] = useState('')
  const [step, setStep] = useState<StudioStep>('script')
  const [takes, setTakes] = useState<TakeRecord[]>([])
  const [snapshot, setSnapshot] = useState<RecorderSnapshot>(() => recorder.getSnapshot())
  const [captureSettings, setCaptureSettings] = useState<CaptureSettings>(() => runtime.defaultCaptureSettings())
  const [loading, setLoading] = useState(true)
  const [takesLoading, setTakesLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recoveryAvailable, setRecoveryAvailable] = useState(false)
  const writingRef = useRef(new LocalWritingController())
  const [aiBusy, setAiBusy] = useState(false)
  const [aiDraft, setAiDraft] = useState<string | null>(null)
  const aiCancelRef = useRef(false)
  const scriptSaveTimer = useRef<number | undefined>(undefined)

  const active = useMemo(() => scripts.find((script) => script.id === activeId) ?? scripts[0] ?? createScriptDocument('Untitled script', ''), [activeId, scripts])

  useEffect(() => {
    void restoreLocalFonts()
  }, [])

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

  useEffect(() => () => { window.clearTimeout(scriptSaveTimer.current); writingRef.current.dispose(); void recorder.close() }, [recorder])

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
    void recordingLibrary.saveScript(createScriptDocument(result.title, result.text, active.settings)).then((script) => { setScripts((current) => [script, ...current]); setActiveId(script.id); setNotice(`Imported “${script.title}” into the local script library.`) }).catch((importError) => setError(importError instanceof Error ? importError.message : String(importError)))
  }, [active.settings, recordingLibrary])

  const deleteScript = useCallback(() => {
    if (scripts.length <= 1) { setNotice('Keep at least one script in the library.'); return }
    if (!window.confirm(`Delete “${active.title}”? Its recorded takes remain available.`)) return
    void recordingLibrary.deleteScript(active.id).then(async () => { const remaining = scripts.filter((script) => script.id !== active.id); setScripts(remaining); setActiveId(remaining[0]?.id ?? ''); await refreshTakes(remaining[0]?.id) }).catch((deleteError) => setError(deleteError instanceof Error ? deleteError.message : String(deleteError)))
  }, [active, recordingLibrary, refreshTakes, scripts])

  const openRecord = useCallback(async () => {
    setError('')
    setStep('record')
    if (recorder.getSnapshot().stream) return
    try { await recorder.open(captureSettings); setSnapshot({ ...recorder.getSnapshot() }) }
    catch (openError) { setError(openError instanceof Error ? openError.message : String(openError)) }
  }, [captureSettings, recorder])

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
    try {
      const take = await recorder.start(active, active.cursor)
      setSnapshot({ ...recorder.getSnapshot(), activeTake: take })
      setNotice('Recording. The prompt scrolls independently from the camera capture.')
    } catch (startError) { setError(startError instanceof Error ? startError.message : String(startError)) }
  }, [active, recorder])

  const probeRecovery = useCallback(async () => {
    try {
      const blob = await recorder.getRecoveryBlob?.()
      setRecoveryAvailable(Boolean(blob && blob.size > 0))
    } catch { setRecoveryAvailable(false) }
  }, [recorder])

  const stopRecording = useCallback(async () => {
    setError('')
    try { const take = await recorder.stop(active.cursor); setSnapshot({ ...recorder.getSnapshot(), activeTake: take }); await refreshTakes(); if (take.status !== 'complete') await probeRecovery(); setNotice(take.status === 'complete' ? 'Take saved to your local library.' : take.error ?? 'Take needs recovery before it can be edited.') }
    catch (stopError) { await probeRecovery(); setError(stopError instanceof Error ? stopError.message : String(stopError)) }
  }, [active.cursor, probeRecovery, recorder, refreshTakes])

  const closeStudio = useCallback(async () => {
    setError('')
    try {
      const current = recorder.getSnapshot()
      if (current.status === 'recording' || current.status === 'saving') await recorder.stop(active.cursor)
      if (recoveryAvailable && recorder.getSnapshot().status === 'error') {
        setError('Recovered media is waiting. Download it before closing this recording session.')
        return
      }
      await recorder.close()
      onClose()
    } catch (closeError) { await probeRecovery(); setError(closeError instanceof Error ? closeError.message : String(closeError)) }
  }, [active.cursor, onClose, probeRecovery, recorder, recoveryAvailable])

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

  const downloadRecovery = useCallback(async () => {
    try {
      const blob = await recorder.getRecoveryBlob?.()
      if (!blob || blob.size === 0) throw new Error('No recovered media bytes are available yet.')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${active.title || 'recovered-take'}.recovered.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setNotice('Recovered media download started. The partial take remains in the library for repair.')
    } catch (recoveryError) { setError(recoveryError instanceof Error ? recoveryError.message : String(recoveryError)) }
  }, [active.title, recorder])

  const retake = useCallback((take: TakeRecord) => {
    const prompt = parsePrompt(active.text)
    const current = prompt.spokenTokens[Math.max(0, Math.min(prompt.spokenTokens.length - 1, take.startWord))]
    const rewindToSentence = Math.max(0, (current?.sentence ?? 0) - 1)
    const target = prompt.spokenTokens.findIndex((token) => token.sentence >= rewindToSentence)
    updateScript({ cursor: target < 0 ? Math.max(0, take.startWord - 10) : target })
    void openRecord()
  }, [active.text, openRecord, updateScript])
  const starTake = useCallback((take: TakeRecord) => { void recordingLibrary.updateTake(take.id, { starred: !take.starred }).then(() => refreshTakes()).catch((takeError) => setError(takeError instanceof Error ? takeError.message : String(takeError))) }, [recordingLibrary, refreshTakes])
  const deleteTake = useCallback((take: TakeRecord) => { if (!window.confirm(`Delete ${take.title || 'this take'}?`)) return; void recordingLibrary.deleteTake(take.id).then(() => refreshTakes()).catch((takeError) => setError(takeError instanceof Error ? takeError.message : String(takeError))) }, [recordingLibrary, refreshTakes])
  const requestStorage = useCallback(() => { void recorder.requestPersistentStorage?.().then((granted) => setNotice(granted ? 'Persistent storage granted for the recording library.' : 'Storage persistence was not granted; keep external downloads for important takes.')).catch((storageError) => setError(storageError instanceof Error ? storageError.message : String(storageError))) }, [recorder])
  const testMic = useCallback(() => { void recorder.testMicrophone().then(() => setNotice('Microphone test complete. Check the live meter beside the controls.')).catch((micError) => setError(micError instanceof Error ? micError.message : String(micError))) }, [recorder])

  const generateDraft = useCallback(async (request: { mode: 'rewrite' | 'topic'; brief: string; tone: string; targetSeconds: number }) => {
    aiCancelRef.current = false
    setAiBusy(true); setAiDraft(null); setError('')
    try {
      const source = request.mode === 'topic' ? request.brief : active.text
      const instruction = request.mode === 'topic'
        ? `Create a spoken teleprompter script from this topic brief. Use a ${request.tone} tone, target about ${request.targetSeconds} seconds, and return only the script text. Keep it practical and easy to say aloud.`
        : `Rewrite this spoken teleprompter script for clarity and natural delivery. Use a ${request.tone} tone, keep the meaning and director cues, target about ${request.targetSeconds} seconds, and return only the revised script.`
      setAiDraft(await writingRef.current.generate(source, { instruction, maxNewTokens: Math.min(320, Math.max(96, Math.round(request.targetSeconds * 3.2))) }))
    }
    catch (draftError) { if (!aiCancelRef.current) setError(draftError instanceof Error ? draftError.message : String(draftError)) }
    finally { setAiBusy(false) }
  }, [active.text])
  const cancelDraft = useCallback(() => { aiCancelRef.current = true; writingRef.current.cancel(); setAiBusy(false); setNotice('Local draft cancelled. Your original script is unchanged.') }, [])

  const readerProps = { script: active, settings: active.settings, onCursorChange: (cursor: number) => updateScript({ cursor }), stream: step === 'record' ? snapshot.stream : null, recording: step === 'record', captureActive: step === 'record' && snapshot.status === 'recording', onVoiceStatus: (_status: 'idle' | 'preparing' | 'ready' | 'listening' | 'paused' | 'error', detail?: string) => { if (detail) setNotice(detail) } }

  if (loading) return <div className="tp-studio tp-loading"><Loader2 className="spin" size={20}/><span>Opening your local script library…</span></div>

  return <div className="tp-studio">
    <header className="tp-studio-header"><div className="tp-brand"><Brand compact onClick={() => void closeStudio()}/><span className="tp-header-divider"/><span className="eyebrow-small">PROMPTER STUDIO</span></div><div className="tp-steps" role="tablist" aria-label="Studio steps">{([['script', 'Script', FileText], ['record', 'Record', Video], ['takes', 'Takes', Library]] as const).map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={step === id} className={step === id ? 'is-active' : ''} onClick={() => id === 'record' ? void openRecord() : (setStep(id), id === 'takes' && void refreshTakes())}><span className="tp-step-icon"><Icon size={15}/></span><span>{label}</span>{id !== 'takes' && <ChevronRight size={13}/>}</button>)}</div><IconButton label="Close prompter studio" onClick={() => void closeStudio()}><X size={18}/></IconButton></header>
    {error && <div className="tp-global-alert" role="alert"><Radio size={16}/><span>{error}</span><button type="button" onClick={() => setError('')}>Dismiss</button></div>}
    {notice && <div className="tp-global-notice" role="status"><Sparkles size={15}/><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div>}
    <main className={`tp-studio-main tp-step-${step}`}>
      {step === 'script' && <ScriptPanel scripts={scripts} active={active} onSelect={(id) => { setActiveId(id); setAiDraft(null) }} onChange={updateScript} onCreate={createScript} onDelete={deleteScript} onImport={importScript} onGenerate={(request) => void generateDraft(request)} onCancelGenerate={cancelDraft} aiBusy={aiBusy} aiDraft={aiDraft} onApplyDraft={() => { if (aiDraft) { updateScript({ text: aiDraft }); setAiDraft(null); setNotice('Draft applied. Your source is still available in browser history until you edit again.') } }} onDiscardDraft={() => setAiDraft(null)}/>} 
      {step === 'script' && <section className="tp-reader-column"><div className="tp-reader-column-head"><div><span className="eyebrow-small">READING WINDOW</span><h1>{active.title || 'Untitled script'}</h1></div><div className="tp-reader-head-actions"><Button variant="secondary" onClick={() => void openRecord()}><Camera size={15}/> Record with camera</Button></div></div><PromptReader {...readerProps}/></section>}
      {step === 'record' && <RecordPanel snapshot={snapshot} settings={captureSettings} script={active} reader={<PromptReader {...readerProps} compact/>} recoveryAvailable={recoveryAvailable} onSettingsChange={changeCaptureSettings} onOpen={openRecord} onStart={() => void startRecording()} onStop={() => void stopRecording()} onTestMic={testMic} onRequestStorage={requestStorage} onRecoveryDownload={() => void downloadRecovery()} onSwitchCamera={() => { void recorder.switchCamera(captureSettings).then(() => setSnapshot({ ...recorder.getSnapshot() })).catch((switchError) => setError(switchError instanceof Error ? switchError.message : String(switchError))) }}/>} 
      {step === 'takes' && <TakesPanel takes={takes} loading={takesLoading} onStar={starTake} onDelete={deleteTake} onDownload={downloadTake} onEdit={(take) => void editTake(take)} onRetake={retake}/>} 
    </main>
    {step === 'script' && <footer className="tp-studio-footer"><span><FileText size={14}/> {active.text.trim() ? 'Autosaves locally as you write.' : 'Paste a script to unlock recording.'}</span><span className="mono">{buildPromptTiming(parsePrompt(active.text), active.settings).estimatedSeconds ? 'LOCAL READY' : 'WAITING FOR SCRIPT'}</span></footer>}
  </div>
}
