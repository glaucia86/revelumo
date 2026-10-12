import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MAX_EXPOSURE_CHECKPOINT_GESTURES } from '../shared/contracts.ts';
import type { EditSession, PhotoSummary, Preview, ExposureGesture, PhotoAdjustments } from '../shared/contracts.ts';

export type ExposureHandle = { leave(discard?: boolean): Promise<void> };
type GestureKind = 'number' | 'slider-pointer' | 'slider-key' | 'reset';
type Draft = PhotoAdjustments & { revision: number };
type PendingGesture = ExposureGesture & Draft;
type PreviewRequest = Draft & { renderRequestId: number };

export const ExposureEditor = forwardRef<ExposureHandle, { photo: PhotoSummary; preview: Preview | null }>(function ExposureEditor({ photo, preview }, ref) {
  const session = useRef<EditSession | null>(null), draft = useRef<Draft>({ revision: 0, exposureTenths: 0, temperature: 0, tint: 0 });
  const confirmed = useRef<Draft>({ revision: 0, exposureTenths: 0, temperature: 0, tint: 0 });
  const saveRequest = useRef<(Draft & { gestures: ExposureGesture[] }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), inFlight = useRef<Promise<boolean> | null>(null);
  const alive = useRef(true), ending = useRef(false), initialization = useRef<Promise<void>>(Promise.resolve());
  const worker = useRef<Worker | null>(null), ready = useRef(false), rendering = useRef<number | null>(null), waiting = useRef<PreviewRequest | null>(null);
  const previewSequence = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [numericText, setNumericText] = useState('0.0');
  const [whiteBalance, setWhiteBalance] = useState({ temperature: 0, tint: 0 });
  const [whiteBalanceText, setWhiteBalanceText] = useState({ temperature: '0', tint: '0' });
  const [value, setValue] = useState(0), [loaded, setLoaded] = useState(false), [prepared, setPrepared] = useState(false);
  const [status, setStatus] = useState('Lendo ajuste salvo.'), [error, setError] = useState(''), [previewError, setPreviewError] = useState('');
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
      rememberGesture(true); setStatus('Alteração pendente');
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
  const historyRequest = useRef<{ revision: number; direction: 'undo' | 'redo' } | null>(null);
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
      const requested = historyRequest.current ?? { revision: draft.current.revision + 1, direction };
      historyRequest.current = requested;
      const { revision } = requested;
      setStatus('Salvando…');
      const result = await window.revelumo.moveExposureHistory(photo.id, current.sessionId, revision, requested.direction);
      if (!alive.current) return;
      if (!result.ok) { setHistoryFailure(true); setError(result.message); setStatus('Não salvo'); return; }
      if (!confirms(result.value, current, requested)) {
        setHistoryFailure(true); setError('Confirmação de histórico inválida. Tente novamente.'); setStatus('Não salvo'); return;
      }
      historyRequest.current = null; setHistoryFailure(false);
      draft.current = confirmed.current = { revision, exposureTenths: result.value.exposureTenths, temperature: result.value.temperature, tint: result.value.tint };
      setWhiteBalance({ temperature: result.value.temperature, tint: result.value.tint });
      setWhiteBalanceText({ temperature: String(result.value.temperature), tint: String(result.value.tint) });
      setHistory(result.value); setValue(result.value.exposureTenths); setNumericText((result.value.exposureTenths / 10).toFixed(1));
      setError(''); setStatus('Salvo');
      render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths });
    } catch { if (alive.current) { setHistoryFailure(true); setError('Não foi possível alterar o histórico. Tente novamente.'); setStatus('Não salvo'); } }
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
    if (alive.current) setStatus('Salvando…');
    const operation = (async () => {
      try {
        const result = await window.revelumo.saveAdjustments(photo.id, current.sessionId, requested.revision, { exposureTenths: requested.exposureTenths, temperature: requested.temperature, tint: requested.tint }, 2, requested.gestures);
        if (!alive.current) return false;
        if (!result.ok) { setError(result.message); setStatus('Não salvo'); return false; }
        if (!confirms(result.value, current, requested)) {
          setError('Confirmação de ajuste inválida. Tente novamente.'); setStatus('Não salvo'); return false;
        }
        confirmed.current = { revision: requested.revision, exposureTenths: requested.exposureTenths, temperature: requested.temperature, tint: requested.tint };
        saveRequest.current = null;
        pendingGestures.current = pendingGestures.current.filter(item => item.revision > requested.revision);
        if (draft.current.revision === requested.revision) { setHistory(result.value); setError(''); setStatus('Salvo'); }
        else setStatus('Alteração pendente');
        return true;
      } catch { if (alive.current) { setError('Não foi possível salvar o ajuste. Tente novamente.'); setStatus('Não salvo'); } return false; }
    })();
    inFlight.current = operation;
    const ok = await operation;
    inFlight.current = null;
    if (ok && !ending.current && draft.current.revision > confirmed.current.revision && timer.current === null) schedule(0);
    return ok;
  }

  useImperativeHandle(ref, () => ({
    async leave(discard = false) {
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
        if (session.current) {
          const result = await window.revelumo.endEditingPhoto(photo.id, session.current.sessionId);
          if (!result.ok) throw new Error(result.message);
          session.current = null;
        }
      } catch (cause) { ending.current = false; setLeaving(false); throw cause; }
    },
  }));

  useEffect(() => {
    alive.current = true;
    initialization.current = (async () => {
      try {
        const result = await window.revelumo.beginEditingPhoto(photo.id);
        if (!alive.current) return;
        if (!result.ok) { setError(result.message); setStatus('Ajuste indisponível'); return; }
        session.current = result.value; setHistory(result.value);
        draft.current = confirmed.current = { revision: result.value.revision, exposureTenths: result.value.exposureTenths, temperature: result.value.temperature, tint: result.value.tint };
        setWhiteBalance({ temperature: result.value.temperature, tint: result.value.tint });
        setWhiteBalanceText({ temperature: String(result.value.temperature), tint: String(result.value.tint) });
        setValue(result.value.exposureTenths); setNumericText((result.value.exposureTenths / 10).toFixed(1)); setLoaded(true); setStatus('Salvo');
      } catch { if (alive.current) { setError('Não foi possível ler o ajuste salvo.'); setStatus('Ajuste indisponível'); } }
    })();
    return () => { alive.current = false; cancelDelay(); worker.current?.terminate(); worker.current = null; waiting.current = null; if (canvas.current) canvas.current.width = canvas.current.height = 1; };
  }, [photo.id]);

  useEffect(() => {
    if (!loaded || !preview || preview.photo.id !== photo.id || !session.current) return;
    ready.current = false; rendering.current = null;
    const current = session.current, instance = new Worker(new URL('./exposure.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance; setPrepared(false);
    instance.onmessage = ({ data }) => {
      if (!alive.current || instance !== worker.current || data.id !== photo.id || data.sessionId !== current.sessionId) return;
      if (data.op === 'error') { setPreviewError(data.message); return; }
      if (data.op === 'ready') { ready.current = true; render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); return; }
      if (data.op === 'pixels') {
        if (data.renderRequestId !== rendering.current) return;
        rendering.current = null;
        // Only the latest requested display is allowed to reach the canvas.
        if (!waiting.current && data.renderRequestId === previewSequence.current && data.revision === draft.current.revision && canvas.current) {
          canvas.current.width = data.width; canvas.current.height = data.height;
          const ctx = canvas.current.getContext('2d', { colorSpace: 'srgb' });
          ctx?.putImageData(new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height, { colorSpace: 'srgb' }), 0, 0);
          canvas.current.dataset.revision = String(data.revision); setPrepared(true);
        }
        startNextRender();
      }
    };
    instance.onerror = () => setPreviewError('Não foi possível carregar o processamento da prévia.');
    instance.postMessage({ op: 'prepare', id: photo.id, sessionId: current.sessionId, dataUrl: preview.dataUrl });
    return () => { instance.terminate(); if (worker.current === instance) worker.current = null; waiting.current = null; ready.current = false; };
  }, [loaded, preview, photo.id]);

  function change(text: string, kind: GestureKind) {
    if (!loaded || ending.current || movingNow.current || historyRequest.current || !/^[-+]?\d+(\.\d)?$/.test(text)) return;
    const ev = Number(text), tenths = Math.round(ev * 10);
    if (!Number.isFinite(ev) || tenths < -30 || tenths > 30 || Math.abs(ev * 10 - tenths) > 1e-8 || tenths === draft.current.exposureTenths) return;
    beginGesture(kind); activeGesture.current!.changed = true;
    draft.current = { ...draft.current, revision: draft.current.revision + 1, exposureTenths: tenths };
    rememberGesture(false);
    setValue(tenths); setError(''); setStatus('Alteração pendente');
    render({ ...draft.current, exposureTenths: comparison.current ? 0 : tenths }); schedule();
  }
  function changeControl(text: string, kind: GestureKind = activeGesture.current?.kind === 'slider-pointer' ? 'slider-pointer' : 'slider-key') {
    setNumericText(Number(text).toFixed(1));
    change(text, kind);
  }
  function changeWhiteBalance(field: 'temperature' | 'tint', text: string) {
    if (!loaded || ending.current || movingNow.current || historyRequest.current || !/^[-+]?\d+$/.test(text)) return;
    const value = Number(text);
    if (!Number.isInteger(value) || value < -100 || value > 100 || value === draft.current[field]) return;
    finishGesture();
    draft.current = { ...draft.current, revision: draft.current.revision + 1, [field]: value };
    setWhiteBalance({ temperature: draft.current.temperature, tint: draft.current.tint });
    setError(''); setStatus('Alteração pendente');
    render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); schedule();
  }
  function resetWhiteBalance() {
    setWhiteBalanceText({ temperature: '0', tint: '0' });
    if (draft.current.temperature === 0 && draft.current.tint === 0) return;
    finishGesture();
    draft.current = { ...draft.current, revision: draft.current.revision + 1, temperature: 0, tint: 0 };
    setWhiteBalance({ temperature: 0, tint: 0 }); setError(''); setStatus('Alteração pendente');
    render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); schedule();
  }
  function formatWhiteBalance(field: 'temperature' | 'tint') {
    setWhiteBalanceText(current => ({ ...current, [field]: String(draft.current[field]) }));
  }
  const disabled = !loaded || !prepared || leaving || moving || historyFailure || Boolean(previewError);
  const pendingChange = pendingGestures.current.some(item => item.exposureTenths !== confirmed.current.exposureTenths);
  return <div className="editing">
    {preview && <figure><canvas ref={canvas} width={1} height={1} role="img" aria-label={`Prévia de edição de ${photo.name}`}/><figcaption>{photo.name} · Prévia sRGB até 2048 px</figcaption></figure>}
    <div className="exposure" aria-label="Ajuste de exposição">
      <label>Exposição <input aria-label="Exposição" type="range" min="-3" max="3" step="0.1" value={value / 10} disabled={disabled} onChange={event => changeControl(event.target.value)}
        onPointerDown={event => { beginGesture('slider-pointer'); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={() => finishGesture('slider-pointer')} onPointerCancel={() => finishGesture('slider-pointer')} onLostPointerCapture={() => finishGesture('slider-pointer')}
        onKeyDown={event => { if (isSliderKey(event.key)) { sliderKeys.current.add(event.key); if (activeGesture.current?.kind !== 'slider-pointer') beginGesture('slider-key'); } }}
        onKeyUp={event => { if (isSliderKey(event.key)) { sliderKeys.current.delete(event.key); if (!sliderKeys.current.size) finishGesture('slider-key'); } }}
        onBlur={finishSliderGesture}/>
      </label>
      <input aria-label="Exposição em EV" type="number" min="-3" max="3" step="0.1" value={numericText} disabled={disabled} onChange={event => { setNumericText(event.target.value); change(event.target.value, 'number'); }} onBlur={() => { finishGesture('number'); setNumericText((draft.current.exposureTenths / 10).toFixed(1)); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { finishGesture('number'); setNumericText((draft.current.exposureTenths / 10).toFixed(1)); } }}/><span>EV</span>
      <button disabled={disabled} onClick={() => { finishGesture(); changeControl('0', 'reset'); finishGesture('reset'); }}>Redefinir exposição</button>
      <button disabled={disabled || (!history.undoSteps && !pendingChange)} onClick={() => void moveHistory('undo')}>Desfazer exposição</button>
      <button disabled={disabled || !history.redoSteps || pendingChange} onClick={() => void moveHistory('redo')}>Refazer exposição</button>
      <button disabled={disabled} aria-pressed={compare} onClick={() => { comparison.current = !comparison.current; setCompare(comparison.current); render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); }}>Comparar com 0 EV</button>
      <span className="save-status" role="status" aria-live="polite">{status}</span>
      {(error || previewError) && <p role="alert">{error || previewError} {error && loaded && (historyFailure ? <button disabled={leaving || moving} onClick={() => { if (historyRequest.current) void moveHistory(historyRequest.current.direction); }}>Tentar alterar histórico</button> : <button disabled={leaving} onClick={() => { cancelDelay(); void save(); }}>Tentar salvar novamente</button>)}</p>}
    </div>
    <div className="white-balance" aria-label="Balanço de branco">
      <h3>Balanço de branco <small>relativo · JPEG</small></h3>
      {([{ field: 'temperature', label: 'Temperatura', numeric: 'Temperatura relativa' }, { field: 'tint', label: 'Matiz', numeric: 'Matiz relativo' }] as const).map(({ field, label, numeric }) =>
        <div key={field} className="balance-control">
          <label>{label} <input aria-label={label} type="range" min="-100" max="100" step="1" value={whiteBalance[field]} disabled={disabled}
            onChange={event => { const text = event.target.value; setWhiteBalanceText(current => ({ ...current, [field]: text })); changeWhiteBalance(field, text); }}/></label>
          <input aria-label={numeric} type="number" min="-100" max="100" step="1" value={whiteBalanceText[field]} disabled={disabled}
            onChange={event => { const text = event.target.value; setWhiteBalanceText(current => ({ ...current, [field]: text })); changeWhiteBalance(field, text); }}
            onBlur={() => formatWhiteBalance(field)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) formatWhiteBalance(field); }}/>
        </div>)}
      <button disabled={disabled} onClick={resetWhiteBalance}>Redefinir balanço de branco</button>
    </div>
  </div>;
});
