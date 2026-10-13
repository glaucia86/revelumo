import type { ExportJobState, ExportAttempt } from '../shared/jpeg-export-contract.ts';
import { exportFailureMessage } from '../shared/jpeg-export-messages.ts';
import { useLanguage } from './i18n/LanguageProvider.tsx';
import type { MessageDescriptor } from '../shared/i18n/messages.ts';
import { isMessageDescriptor } from '../shared/i18n/format.ts';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PreviewSource } from './preview-source.ts';
import { MAX_EXPOSURE_CHECKPOINT_GESTURES } from '../shared/contracts.ts';
import type { EditSession, PhotoSummary, ExposureGesture, PhotoAdjustments } from '../shared/contracts.ts';

export type ExposureHandle = { leave(discard?: boolean, retirePreview?: () => Promise<void>): Promise<ExportJobState | undefined> };
type GestureKind = 'number' | 'slider-pointer' | 'slider-key' | 'reset';
type Draft = PhotoAdjustments & { revision: number };
type PendingGesture = ExposureGesture & Draft;
type PreviewRequest = Draft & { renderRequestId: number };

export const ExposureEditor = forwardRef<ExposureHandle, { photo: PhotoSummary; preview: PreviewSource | null; previewLoading: boolean; previewFailure: MessageDescriptor | null; onRetryPreview: () => void; onExportResult: (result: ExportJobState) => void }>(function ExposureEditor({ photo, preview, previewLoading, previewFailure, onRetryPreview, onExportResult }, ref) {
  const { t } = useLanguage();
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<MessageDescriptor | null>(null);
  const [exportProblem, setExportProblem] = useState(false), [exportCleanup, setExportCleanup] = useState(false);
  const pendingExportStart = useRef<ExportAttempt | null>(null);
  const lastExport = useRef<ExportJobState | null>(null);
  const exportGuard = useRef(false), exportCanceled = useRef(false), exportJobId = useRef<string | null>(null);
  async function cancelExport() {
    exportCanceled.current = true; setExportStatus({ key: 'export.canceling' });
    if (exportJobId.current) { try { await window.revelumo.cancelJpegExport(exportJobId.current); } catch { /* Status reconciliation owns the final outcome. */ } }
  }
  const exportFlight = useRef<Promise<void> | null>(null), leavingNow = useRef(false);
  function exportPhoto() {
    if (exportFlight.current || leavingNow.current) return;
    const operation = performExport(); exportFlight.current = operation;
    void operation.finally(() => { if (exportFlight.current === operation) exportFlight.current = null; });
  }
  async function performExport() {
    if (exportGuard.current || ending.current || leavingNow.current || !session.current) return;
    exportGuard.current = true; exportCanceled.current = false; setExporting(true); lastExport.current = null; setExportProblem(false); setExportCleanup(false); setExportStatus({ key: 'export.preparing' });
    try {
      if (pendingExportStart.current) { const recovered = await recoverExportStart(); await observeExport(recovered.jobId, recovered); return; }
      if (exportJobId.current) { await observeExport(exportJobId.current); return; }
      finishGesture(); cancelDelay(); comparison.current = false; setCompare(false);
      if (historyFlight.current) await historyFlight.current;
      if (historyRequest.current) {
        await moveHistory(historyRequest.current.direction);
        if (historyRequest.current) throw Object.assign(new Error(), { code: 'SAVE_NOT_CONFIRMED' });
      }
      while (confirmed.current.revision !== draft.current.revision) {
        if (!await save()) throw Object.assign(new Error(), { code: 'SAVE_NOT_CONFIRMED' });
        cancelDelay();
      }
      render({ ...draft.current });
      const expectedPreview = String(previewSequence.current), deadline = Date.now() + 10000;
      while (canvas.current?.dataset.renderRequestId !== expectedPreview) {
        if (exportCanceled.current) break;
        if (!alive.current || Date.now() > deadline) throw Object.assign(new Error(), { code: 'PREVIEW_NOT_READY' });
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (exportCanceled.current) { setExportStatus({ key: 'export.canceled' }); return; }
      const selection = { attemptId: crypto.randomUUID(), id: photo.id, sessionId: session.current.sessionId, revision: confirmed.current.revision };
      pendingExportStart.current = selection;
      let started;
      try { started = await window.revelumo.startJpegExport(selection.id, selection.sessionId, selection.revision, selection.attemptId); }
      catch { const recovered = await recoverExportStart(); await observeExport(recovered.jobId, recovered); return; }
      pendingExportStart.current = null;
      if (!started.ok) throw Object.assign(new Error(), { code: started.code });
      exportJobId.current = started.value.jobId;
      if (exportCanceled.current) await window.revelumo.cancelJpegExport(started.value.jobId);
      await observeExport(started.value.jobId, started.value);
    } catch (error) { setExportProblem(true); setExportStatus(exportFailureMessage((error as { code?: string }).code ?? 'UNKNOWN_JOB')); }
    finally { exportGuard.current = false; setExporting(false); }
  }

  async function recoverExportStart(): Promise<ExportJobState> {
    const selection = pendingExportStart.current!;
    const recovered = await window.revelumo.recoverJpegExport(selection.id, selection.sessionId, selection.revision, selection.attemptId);
    if (!recovered.ok) {
      if (recovered.code === 'UNKNOWN_JOB') {
        pendingExportStart.current = null;
        onExportResult({ jobId: '', photoId: selection.id, sessionId: selection.sessionId, revision: selection.revision, state: 'failed', error: 'UNKNOWN_JOB' });
      }
      throw Object.assign(new Error(), { code: recovered.code });
    }
    pendingExportStart.current = null; exportJobId.current = recovered.value.jobId;
    if (exportCanceled.current) await cancelExport();
    return recovered.value;
  }
  async function observeExport(jobId: string, initial?: ExportJobState) {
    let state = initial;
    while (!state || !['succeeded', 'failed', 'canceled'].includes(state.state)) {
      setExportStatus({ key: exportCanceled.current ? 'export.canceling' : state?.state === 'choosing' ? 'export.choosing' : 'export.exporting' });
      await new Promise(resolve => setTimeout(resolve, 100));
      const response = await window.revelumo.jpegExportStatus(jobId);
      if (!response.ok) {
        if (response.code === 'UNKNOWN_JOB') {
          exportJobId.current = null;
          onExportResult({ jobId, photoId: photo.id, sessionId: session.current?.sessionId ?? '', revision: confirmed.current.revision, state: 'failed', error: 'UNKNOWN_JOB' });
        }
        throw Object.assign(new Error(), { code: response.code });
      }
      state = response.value;
    }
    exportJobId.current = null; lastExport.current = state; onExportResult(state);
    setExportProblem(state.state === 'failed'); setExportCleanup(state.cleanupPending === true);
    setExportStatus(state.state === 'failed' ? exportFailureMessage(state.error) : { key: state.state === 'succeeded' ? 'export.succeeded' : 'export.canceled' });
  }

  const session = useRef<EditSession | null>(null), draft = useRef<Draft>({ revision: 0, exposureTenths: 0, temperature: 0, tint: 0 });
  const confirmed = useRef<Draft>({ revision: 0, exposureTenths: 0, temperature: 0, tint: 0 });
  const saveRequest = useRef<(Draft & { gestures: ExposureGesture[] }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), inFlight = useRef<Promise<boolean> | null>(null);
  const alive = useRef(true), ending = useRef(false), initialization = useRef<Promise<void>>(Promise.resolve());
  const worker = useRef<Worker | null>(null), ready = useRef(false), rendering = useRef<number | null>(null), waiting = useRef<PreviewRequest | null>(null);
  const previewSequence = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null), exposureInput = useRef<HTMLInputElement>(null);
  const restorePreviewFocus = useRef(false);
  const [numericText, setNumericText] = useState('0.0');
  const [whiteBalance, setWhiteBalance] = useState({ temperature: 0, tint: 0 });
  const [whiteBalanceText, setWhiteBalanceText] = useState({ temperature: '0', tint: '0' });
  const [value, setValue] = useState(0), [loaded, setLoaded] = useState(false), [prepared, setPrepared] = useState(false);
  const [status, setStatus] = useState<MessageDescriptor>({ key: 'editor.reading' }), [error, setError] = useState<MessageDescriptor | null>(null), [previewError, setPreviewError] = useState<MessageDescriptor | null>(null);
  const [leaving, setLeaving] = useState(false), [compare, setCompare] = useState(false);
  const comparison = useRef(false);
  const pendingGestures = useRef<PendingGesture[]>([]);
  const activeGesture = useRef<{ id: number; kind: GestureKind; changed: boolean } | null>(null);
  const nextGesture = useRef(0);
  const sliderKeys = useRef(new Set<string>());
  const isSliderKey = (key: string) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(key);

  function beginGesture(kind: GestureKind) {
    if (activeGesture.current?.kind === kind) return;
    finishGesture();
    activeGesture.current = { id: ++nextGesture.current, kind, changed: false };
  }
  function rememberGesture(complete: boolean) {
    const gesture = activeGesture.current;
    if (!gesture?.changed) return;
    const next = { ...draft.current, id: gesture.id, complete };
    const index = pendingGestures.current.findIndex(item => item.id === gesture.id);
    if (index < 0) pendingGestures.current.push(next); else pendingGestures.current[index] = next;
  }
  function finishGesture(kind?: GestureKind) {
    const gesture = activeGesture.current;
    if (!gesture || (kind && gesture.kind !== kind)) return;
    if (gesture.changed) {
      draft.current = { ...draft.current, revision: draft.current.revision + 1 };
      rememberGesture(true); setStatus({ key: 'editor.pending' });
      render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); schedule();
    }
    activeGesture.current = null;
  }
  function finishSliderGesture() {
    sliderKeys.current.clear();
    finishGesture('slider-pointer'); finishGesture('slider-key');
  }
  useEffect(() => {
    window.addEventListener('blur', finishSliderGesture);
    return () => window.removeEventListener('blur', finishSliderGesture);
  }, [photo.id]);
  const [history, setHistory] = useState({ undoSteps: 0, redoSteps: 0 });
  const [moving, setMoving] = useState(false);
  const movingNow = useRef(false);
  const historyFlight = useRef<Promise<void> | null>(null);
  const historyRequest = useRef<{ revision: number; direction: 'undo' | 'redo'; temperature: number; tint: number } | null>(null);
  const [historyFailure, setHistoryFailure] = useState(false);

  function confirms(result: EditSession, current: EditSession, requested: { revision: number } & Partial<PhotoAdjustments>): boolean {
    return result.photo.id === photo.id && result.sessionId === current.sessionId && result.revision === requested.revision &&
      (requested.exposureTenths === undefined || result.exposureTenths === requested.exposureTenths) &&
      (requested.temperature === undefined || result.temperature === requested.temperature) && (requested.tint === undefined || result.tint === requested.tint);
  }

  function moveHistory(direction: 'undo' | 'redo'): Promise<void> {
    if (historyFlight.current) return historyFlight.current;
    const operation = performHistoryMove(direction);
    historyFlight.current = operation;
    void operation.finally(() => { if (historyFlight.current === operation) historyFlight.current = null; });
    return operation;
  }

  async function performHistoryMove(direction: 'undo' | 'redo') {
    if (movingNow.current || ending.current || !session.current) return;
    finishGesture(); movingNow.current = true; setMoving(true); cancelDelay();
    try {
      while (confirmed.current.revision !== draft.current.revision) {
        if (!await save()) return;
        cancelDelay();
      }
      const current = session.current;
      const requested = historyRequest.current ?? { revision: draft.current.revision + 1, direction, temperature: draft.current.temperature, tint: draft.current.tint };
      historyRequest.current = requested;
      const { revision } = requested;
      setStatus({ key: 'editor.saving' });
      const result = await window.revelumo.moveExposureHistory(photo.id, current.sessionId, revision, requested.direction);
      if (!alive.current) return;
      if (!result.ok) { setHistoryFailure(true); setError(result.descriptor ?? { key: 'errors.generic' }); setStatus({ key: 'editor.unsaved' }); return; }
      if (!confirms(result.value, current, requested)) {
        setHistoryFailure(true); setError({ key: 'editor.historyConfirmation' }); setStatus({ key: 'editor.unsaved' }); return;
      }
      historyRequest.current = null; setHistoryFailure(false);
      draft.current = confirmed.current = { revision, exposureTenths: result.value.exposureTenths, temperature: result.value.temperature, tint: result.value.tint };
      setWhiteBalance({ temperature: result.value.temperature, tint: result.value.tint });
      setWhiteBalanceText({ temperature: String(result.value.temperature), tint: String(result.value.tint) });
      setHistory(result.value); setValue(result.value.exposureTenths); setNumericText((result.value.exposureTenths / 10).toFixed(1));
      setError(null); setStatus({ key: 'editor.saved' });
      render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths });
    } catch { if (alive.current) { setHistoryFailure(true); setError({ key: 'editor.historyFailed' }); setStatus({ key: 'editor.unsaved' }); } }
    finally { movingNow.current = false; if (alive.current) setMoving(false); }
  }

  function cancelDelay() { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; }
  function schedule(ms = 300) { cancelDelay(); timer.current = setTimeout(() => { timer.current = null; void save(); }, ms); }
  function render(next: Draft) {
    waiting.current = { ...next, renderRequestId: ++previewSequence.current };
    startNextRender();
  }
  function startNextRender() {
    const next = waiting.current;
    if (!next || !ready.current || rendering.current !== null || !session.current || !worker.current) return;
    rendering.current = next.renderRequestId; waiting.current = null;
    worker.current.postMessage({ op: 'render', id: photo.id, sessionId: session.current.sessionId, ...next });
  }
  async function save(): Promise<boolean> {
    if (inFlight.current) return inFlight.current;
    const current = session.current;
    if (!current || ending.current) return false;
    if (confirmed.current.revision === draft.current.revision) return true;
    const batch = pendingGestures.current.slice(0, MAX_EXPOSURE_CHECKPOINT_GESTURES), last = batch.at(-1);
    const snapshot = pendingGestures.current.length > MAX_EXPOSURE_CHECKPOINT_GESTURES ? last! : draft.current;
    const requested = saveRequest.current ?? { revision: snapshot.revision, exposureTenths: snapshot.exposureTenths, temperature: snapshot.temperature, tint: snapshot.tint,
      gestures: batch.map(({ id, exposureTenths, complete }) => ({ id, exposureTenths, complete })) };
    saveRequest.current = requested;
    if (alive.current) setStatus({ key: 'editor.saving' });
    const operation = (async () => {
      try {
        const result = await window.revelumo.saveAdjustments(photo.id, current.sessionId, requested.revision, { exposureTenths: requested.exposureTenths, temperature: requested.temperature, tint: requested.tint }, 2, requested.gestures);
        if (!alive.current) return false;
        if (!result.ok) { setError(result.descriptor ?? { key: 'errors.generic' }); setStatus({ key: 'editor.unsaved' }); return false; }
        if (!confirms(result.value, current, requested)) {
          setError({ key: 'editor.saveConfirmation' }); setStatus({ key: 'editor.unsaved' }); return false;
        }
        confirmed.current = { revision: requested.revision, exposureTenths: requested.exposureTenths, temperature: requested.temperature, tint: requested.tint };
        saveRequest.current = null;
        pendingGestures.current = pendingGestures.current.filter(item => item.revision > requested.revision);
        if (draft.current.revision === requested.revision) { setHistory(result.value); setError(null); setStatus({ key: 'editor.saved' }); }
        else setStatus({ key: 'editor.pending' });
        return true;
      } catch { if (alive.current) { setError({ key: 'editor.saveFailed' }); setStatus({ key: 'editor.unsaved' }); } return false; }
    })();
    inFlight.current = operation;
    const ok = await operation;
    inFlight.current = null;
    if (ok && !ending.current && draft.current.revision > confirmed.current.revision && timer.current === null) schedule(0);
    return ok;
  }

  useImperativeHandle(ref, () => ({
    async leave(discard = false, retirePreview) {
      leavingNow.current = true;
      if (exportFlight.current || exportJobId.current || pendingExportStart.current) {
        try {
          await cancelExport();
          if (exportFlight.current) await exportFlight.current;
          if (pendingExportStart.current) { await recoverExportStart(); await cancelExport(); }
          if (exportJobId.current) { setExporting(true); await observeExport(exportJobId.current); }
          if (lastExport.current?.state === 'succeeded') { leavingNow.current = false; return lastExport.current; }
        } catch (error) {
          leavingNow.current = false; setExportProblem(true); setExportStatus(exportFailureMessage('UNKNOWN_JOB')); throw error;
        } finally { setExporting(false); }
      }
      if (!discard) finishGesture();
      setLeaving(true); cancelDelay();
      try {
        await initialization.current;
        // A queued close may replay before React unmounts a discarded session.
        // Retirement is final even when discarded draft != confirmed revision.
        if (!session.current) return;
        if (historyFlight.current) await historyFlight.current;
        if (!discard && historyRequest.current) {
          await moveHistory(historyRequest.current.direction);
          if (historyRequest.current) throw new Error('Histórico ainda não confirmado.');
        }
        if (discard) {
          ending.current = true;
          // An already running transaction may confirm; explicit discard only
          // discards the remaining unpersisted draft, never undoes that commit.
          if (inFlight.current) await inFlight.current;
        } else {
          while (confirmed.current.revision !== draft.current.revision) {
            if (!await save()) throw new Error('Ajuste ainda não salvo.');
            cancelDelay();
          }
          ending.current = true;
        }
        cancelDelay();
        // Flush/export reconciliation has succeeded. Retire only derived preview
        // work before end-edit joins the same protected queue; otherwise a stale
        // preview ahead of end-edit would still read/decode its original.
        await retirePreview?.();
        if (session.current) {
          const result = await window.revelumo.endEditingPhoto(photo.id, session.current.sessionId);
          if (!result.ok) throw new Error(result.message);
          session.current = null;
        }
      } catch (cause) { leavingNow.current = false; ending.current = false; setLeaving(false); throw cause; }
    },
  }));

  useEffect(() => {
    alive.current = true;
    initialization.current = (async () => {
      try {
        const result = await window.revelumo.beginEditingPhoto(photo.id);
        if (!alive.current) return;
        if (!result.ok) { setError(result.descriptor ?? { key: 'errors.generic' }); setStatus({ key: 'editor.unavailable' }); return; }
        session.current = result.value; setHistory(result.value);
        draft.current = confirmed.current = { revision: result.value.revision, exposureTenths: result.value.exposureTenths, temperature: result.value.temperature, tint: result.value.tint };
        setWhiteBalance({ temperature: result.value.temperature, tint: result.value.tint });
        setWhiteBalanceText({ temperature: String(result.value.temperature), tint: String(result.value.tint) });
        setValue(result.value.exposureTenths); setNumericText((result.value.exposureTenths / 10).toFixed(1)); setLoaded(true); setStatus({ key: 'editor.saved' });
      } catch { if (alive.current) { setError({ key: 'editor.readFailed' }); setStatus({ key: 'editor.unavailable' }); } }
    })();
    return () => { alive.current = false; cancelDelay(); worker.current?.terminate(); worker.current = null; waiting.current = null; if (canvas.current) canvas.current.width = canvas.current.height = 1; };
  }, [photo.id]);

  useEffect(() => {
    // The parent can reject recovery while an exit/export is being reconciled.
    // Clear the prior error only when a new source request was actually accepted.
    if (previewLoading) setPreviewError(null);
  }, [previewLoading]);

  useEffect(() => {
    setPrepared(false);
    if (!loaded || !preview || preview.photo.id !== photo.id || !session.current) return;
    ready.current = false; rendering.current = null; setPreviewError(null);
    const current = session.current;
    let instance: Worker;
    try { instance = new Worker(new URL('./exposure.worker.ts', import.meta.url), { type: 'module' }); }
    catch { preview.release(); setPreviewError({ key: 'editor.workerFailed' }); return; }
    worker.current = instance;
    const currentAttempt = () => alive.current && instance === worker.current;
    function disposeAttempt() {
      preview!.release(); instance.terminate();
      if (worker.current === instance) worker.current = null;
      ready.current = false; rendering.current = null; waiting.current = null;
      if (canvas.current) { canvas.current.width = canvas.current.height = 1; delete canvas.current.dataset.renderRequestId; delete canvas.current.dataset.revision; }
    }
    function failPreview(problem: MessageDescriptor) {
      if (!currentAttempt()) return;
      disposeAttempt(); setPrepared(false); setPreviewError(problem);
    }
    instance.onmessage = ({ data }) => {
      if (!alive.current || instance !== worker.current || data.id !== photo.id || data.sessionId !== current.sessionId) return;
      if (data.op === 'error') { failPreview(isMessageDescriptor(data.descriptor) ? data.descriptor : { key: 'editor.workerFailed' }); return; }
      if (data.op === 'ready') { preview.release(); ready.current = true; render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); return; }
      if (data.op === 'pixels') {
        if (data.renderRequestId !== rendering.current) return;
        rendering.current = null;
        // Only the latest requested display is allowed to reach the canvas.
        if (!waiting.current && data.renderRequestId === previewSequence.current && data.revision === draft.current.revision && canvas.current) {
          canvas.current.width = data.width; canvas.current.height = data.height;
          const ctx = canvas.current.getContext('2d', { colorSpace: 'srgb' });
          ctx?.putImageData(new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height, { colorSpace: 'srgb' }), 0, 0);
          canvas.current.dataset.revision = String(data.revision); canvas.current.dataset.renderRequestId = String(data.renderRequestId); setPrepared(true);
        }
        startNextRender();
      }
    };
    instance.onerror = () => failPreview({ key: 'editor.workerFailed' });
    try { instance.postMessage({ op: 'prepare', id: photo.id, sessionId: current.sessionId, dataUrl: preview.read() }); }
    catch { failPreview({ key: 'editor.workerFailed' }); }
    return disposeAttempt;
  }, [loaded, preview, photo.id]);

  function change(text: string, kind: GestureKind) {
    if (!loaded || exportGuard.current || ending.current || movingNow.current || historyRequest.current || !/^[-+]?\d+(\.\d)?$/.test(text)) return;
    const ev = Number(text), tenths = Math.round(ev * 10);
    if (!Number.isFinite(ev) || tenths < -30 || tenths > 30 || Math.abs(ev * 10 - tenths) > 1e-8 || tenths === draft.current.exposureTenths) return;
    beginGesture(kind); activeGesture.current!.changed = true;
    draft.current = { ...draft.current, revision: draft.current.revision + 1, exposureTenths: tenths };
    rememberGesture(false);
    setValue(tenths); setError(null); setStatus({ key: 'editor.pending' });
    render({ ...draft.current, exposureTenths: comparison.current ? 0 : tenths }); schedule();
  }
  function changeControl(text: string, kind: GestureKind = activeGesture.current?.kind === 'slider-pointer' ? 'slider-pointer' : 'slider-key') {
    setNumericText(Number(text).toFixed(1));
    change(text, kind);
  }
  function changeWhiteBalance(field: 'temperature' | 'tint', text: string) {
    if (!loaded || exportGuard.current || ending.current || movingNow.current || historyRequest.current || !/^[-+]?\d+$/.test(text)) return;
    const value = Number(text);
    if (!Number.isInteger(value) || value < -100 || value > 100 || value === draft.current[field]) return;
    finishGesture();
    draft.current = { ...draft.current, revision: draft.current.revision + 1, [field]: value };
    setWhiteBalance({ temperature: draft.current.temperature, tint: draft.current.tint });
    setError(null); setStatus({ key: 'editor.pending' });
    render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); schedule();
  }
  function resetWhiteBalance() {
    if (exportGuard.current || ending.current) return;
    setWhiteBalanceText({ temperature: '0', tint: '0' });
    if (draft.current.temperature === 0 && draft.current.tint === 0) return;
    finishGesture();
    draft.current = { ...draft.current, revision: draft.current.revision + 1, temperature: 0, tint: 0 };
    setWhiteBalance({ temperature: 0, tint: 0 }); setError(null); setStatus({ key: 'editor.pending' });
    render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); schedule();
  }
  function formatWhiteBalance(field: 'temperature' | 'tint') {
    setWhiteBalanceText(current => ({ ...current, [field]: String(draft.current[field]) }));
  }
  const disabled = exporting || !loaded || !prepared || leaving || moving || historyFailure || Boolean(previewError || previewFailure) || previewLoading;
  const pendingChange = pendingGestures.current.some(item => item.exposureTenths !== confirmed.current.exposureTenths);
  useEffect(() => {
    if (!restorePreviewFocus.current) return;
    // Restore only focus lost by the explicit recovery action. A user who
    // moved to Save, Back or another control keeps that newer choice.
    if (document.activeElement !== document.body && document.activeElement !== retryButton.current) { restorePreviewFocus.current = false; return; }
    if (previewLoading || leaving || moving || exporting) return;
    const target = previewError || previewFailure ? retryButton.current : prepared ? exposureInput.current : null;
    if (target && !target.disabled) { target.focus(); restorePreviewFocus.current = false; }
  }, [prepared, previewError, previewFailure, previewLoading, leaving, moving, exporting]);
  return <div className="editing">
      {(previewError || previewFailure) && <p className="preview-problem" role="alert">{t((previewError || previewFailure)!)} <button ref={retryButton} className="preview-retry" disabled={previewLoading || leaving || moving || exporting} onClick={event => { restorePreviewFocus.current = document.activeElement === event.currentTarget; onRetryPreview(); }}>{t({ key: 'editor.retryPreview' })}</button></p>}
    <div className="export-controls"><button className="export-jpeg" disabled={disabled} onClick={() => void exportPhoto()}>{t({ key: exportJobId.current || pendingExportStart.current ? 'export.checkResult' : 'export.action' })}</button>{exporting && <button className="export-cancel" onClick={() => void cancelExport()}>{t({ key: 'export.cancel' })}</button>}<small>{t({ key: 'export.settings' })}</small><small>{t({ key: 'export.limitHint' })}</small>{exportStatus && <p role={exportProblem ? 'alert' : 'status'}>{t(exportStatus)}</p>}{exportCleanup && <p role="alert">{t({ key: 'export.cleanupFailure' })}</p>}</div>
    {preview && <figure><canvas ref={canvas} width={1} height={1} role="img" aria-label={t({ key: 'editor.previewLabel', params: { filename: photo.name } })}/><figcaption>{photo.name} · {t({ key: 'editor.previewCaption' })}</figcaption></figure>}
    <div className="exposure" aria-label={t({ key: 'editor.exposureGroup' })}>
      <label>{t({ key: 'editor.exposure' })} <input ref={exposureInput} aria-label={t({ key: 'editor.exposure' })} type="range" min="-3" max="3" step="0.1" value={value / 10} disabled={disabled} onChange={event => changeControl(event.target.value)}
        onPointerDown={event => { beginGesture('slider-pointer'); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={() => finishGesture('slider-pointer')} onPointerCancel={() => finishGesture('slider-pointer')} onLostPointerCapture={() => finishGesture('slider-pointer')}
        onKeyDown={event => { if (isSliderKey(event.key)) { sliderKeys.current.add(event.key); if (activeGesture.current?.kind !== 'slider-pointer') beginGesture('slider-key'); } }}
        onKeyUp={event => { if (isSliderKey(event.key)) { sliderKeys.current.delete(event.key); if (!sliderKeys.current.size) finishGesture('slider-key'); } }}
        onBlur={finishSliderGesture}/>
      </label>
      <input aria-label={t({ key: 'editor.exposureValue' })} type="number" min="-3" max="3" step="0.1" value={numericText} disabled={disabled} onChange={event => { setNumericText(event.target.value); change(event.target.value, 'number'); }} onBlur={() => { finishGesture('number'); setNumericText((draft.current.exposureTenths / 10).toFixed(1)); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { finishGesture('number'); setNumericText((draft.current.exposureTenths / 10).toFixed(1)); } }}/><span>EV</span>
      <button disabled={disabled} onClick={() => { finishGesture(); changeControl('0', 'reset'); finishGesture('reset'); }}>{t({ key: 'editor.resetExposure' })}</button>
      <button disabled={disabled || (!history.undoSteps && !pendingChange)} onClick={() => void moveHistory('undo')}>{t({ key: 'editor.undo' })}</button>
      <button disabled={disabled || !history.redoSteps || pendingChange} onClick={() => void moveHistory('redo')}>{t({ key: 'editor.redo' })}</button>
      <button disabled={disabled} aria-pressed={compare} onClick={() => { comparison.current = !comparison.current; setCompare(comparison.current); render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); }}>{t({ key: 'editor.compare' })}</button>
      <span className="save-status" role="status" aria-live="polite">{t(status)}</span>
      {error && <p role="alert">{t(error)} {error && loaded && (historyFailure ? <button disabled={leaving || moving} onClick={() => { if (historyRequest.current) void moveHistory(historyRequest.current.direction); }}>{t({ key: 'editor.retryHistory' })}</button> : <button disabled={leaving} onClick={() => { cancelDelay(); void save(); }}>{t({ key: 'editor.retrySave' })}</button>)}</p>}
    </div>
    <div className="white-balance" aria-label={t({ key: 'editor.whiteBalance' })}>
      <h3>{t({ key: 'editor.whiteBalance' })} <small>{t({ key: 'editor.relative' })}</small></h3>
      {([{ field: 'temperature', label: 'editor.temperature', numeric: 'editor.temperatureValue' }, { field: 'tint', label: 'editor.tint', numeric: 'editor.tintValue' }] as const).map(({ field, label, numeric }) =>
        <div key={field} className="balance-control">
          <label>{t({ key: label })} <input aria-label={t({ key: label })} type="range" min="-100" max="100" step="1" value={whiteBalance[field]} disabled={disabled}
            onChange={event => { const text = event.target.value; setWhiteBalanceText(current => ({ ...current, [field]: text })); changeWhiteBalance(field, text); }}/></label>
          <input aria-label={t({ key: numeric })} type="number" min="-100" max="100" step="1" value={whiteBalanceText[field]} disabled={disabled}
            onChange={event => { const text = event.target.value; setWhiteBalanceText(current => ({ ...current, [field]: text })); changeWhiteBalance(field, text); }}
            onBlur={() => formatWhiteBalance(field)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) formatWhiteBalance(field); }}/>
        </div>)}
      <button disabled={disabled} onClick={resetWhiteBalance}>{t({ key: 'editor.resetWhiteBalance' })}</button>
    </div>
  </div>;
});
