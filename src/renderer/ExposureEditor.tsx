import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { EditSession, PhotoSummary, Preview } from '../shared/contracts.ts';

export type ExposureHandle = { leave(discard?: boolean): Promise<void> };
type Draft = { revision: number; exposureTenths: number };

export const ExposureEditor = forwardRef<ExposureHandle, { photo: PhotoSummary; preview: Preview | null }>(function ExposureEditor({ photo, preview }, ref) {
  const session = useRef<EditSession | null>(null), draft = useRef<Draft>({ revision: 0, exposureTenths: 0 });
  const confirmed = useRef<Draft>({ revision: 0, exposureTenths: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), inFlight = useRef<Promise<boolean> | null>(null);
  const alive = useRef(true), ending = useRef(false), initialization = useRef<Promise<void>>(Promise.resolve());
  const worker = useRef<Worker | null>(null), ready = useRef(false), rendering = useRef(false), waiting = useRef<Draft | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [numericText, setNumericText] = useState('0.0');
  const [value, setValue] = useState(0), [loaded, setLoaded] = useState(false), [prepared, setPrepared] = useState(false);
  const [status, setStatus] = useState('Lendo ajuste salvo.'), [error, setError] = useState(''), [previewError, setPreviewError] = useState('');
  const [leaving, setLeaving] = useState(false), [compare, setCompare] = useState(false);
  const comparison = useRef(false);

  function cancelDelay() { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; }
  function schedule(ms = 300) { cancelDelay(); timer.current = setTimeout(() => { timer.current = null; void save(); }, ms); }
  function render(next: Draft) {
    waiting.current = next;
    if (!ready.current || rendering.current || !session.current || !worker.current) return;
    rendering.current = true; waiting.current = null;
    worker.current.postMessage({ op: 'render', id: photo.id, sessionId: session.current.sessionId, ...next });
  }
  async function save(): Promise<boolean> {
    if (inFlight.current) return inFlight.current;
    const current = session.current;
    if (!current || ending.current) return false;
    if (confirmed.current.revision === draft.current.revision) return true;
    const requested = { ...draft.current };
    if (alive.current) setStatus('Salvando…');
    const operation = (async () => {
      try {
        const result = await window.revelumo.saveExposure(photo.id, current.sessionId, requested.revision, requested.exposureTenths, 1);
        if (!alive.current) return false;
        if (!result.ok) { setError(result.message); setStatus('Não salvo'); return false; }
        if (result.value.photo.id !== photo.id || result.value.sessionId !== current.sessionId || result.value.revision !== requested.revision || result.value.exposureTenths !== requested.exposureTenths) {
          setError('Confirmação de ajuste inválida. Tente novamente.'); setStatus('Não salvo'); return false;
        }
        confirmed.current = requested;
        if (draft.current.revision === requested.revision) { setError(''); setStatus('Salvo'); }
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
      setLeaving(true); cancelDelay();
      try {
        await initialization.current;
        // A queued close may replay before React unmounts a discarded session.
        // Retirement is final even when discarded draft != confirmed revision.
        if (!session.current) return;
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
        session.current = result.value;
        draft.current = confirmed.current = { revision: result.value.revision, exposureTenths: result.value.exposureTenths };
        setValue(result.value.exposureTenths); setNumericText((result.value.exposureTenths / 10).toFixed(1)); setLoaded(true); setStatus('Salvo');
      } catch { if (alive.current) { setError('Não foi possível ler o ajuste salvo.'); setStatus('Ajuste indisponível'); } }
    })();
    return () => { alive.current = false; cancelDelay(); worker.current?.terminate(); worker.current = null; waiting.current = null; if (canvas.current) canvas.current.width = canvas.current.height = 1; };
  }, [photo.id]);

  useEffect(() => {
    if (!loaded || !preview || preview.photo.id !== photo.id || !session.current) return;
    ready.current = rendering.current = false;
    const current = session.current, instance = new Worker(new URL('./exposure.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance; setPrepared(false);
    instance.onmessage = ({ data }) => {
      if (!alive.current || instance !== worker.current || data.id !== photo.id || data.sessionId !== current.sessionId) return;
      if (data.op === 'error') { setPreviewError(data.message); return; }
      if (data.op === 'ready') { ready.current = true; render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); return; }
      if (data.op === 'pixels') {
        rendering.current = false;
        // Only the latest requested display is allowed to reach the canvas.
        if (!waiting.current && data.revision === draft.current.revision && canvas.current) {
          canvas.current.width = data.width; canvas.current.height = data.height;
          const ctx = canvas.current.getContext('2d', { colorSpace: 'srgb' });
          ctx?.putImageData(new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height, { colorSpace: 'srgb' }), 0, 0);
          canvas.current.dataset.revision = String(data.revision); setPrepared(true);
        }
        if (waiting.current) render(waiting.current);
      }
    };
    instance.onerror = () => setPreviewError('Não foi possível carregar o processamento da prévia.');
    instance.postMessage({ op: 'prepare', id: photo.id, sessionId: current.sessionId, dataUrl: preview.dataUrl });
    return () => { instance.terminate(); if (worker.current === instance) worker.current = null; waiting.current = null; ready.current = false; };
  }, [loaded, preview, photo.id]);

  function change(text: string) {
    if (!loaded || ending.current || !/^[-+]?\d+(\.\d)?$/.test(text)) return;
    const ev = Number(text), tenths = Math.round(ev * 10);
    if (!Number.isFinite(ev) || tenths < -30 || tenths > 30 || Math.abs(ev * 10 - tenths) > 1e-8 || tenths === draft.current.exposureTenths) return;
    draft.current = { revision: draft.current.revision + 1, exposureTenths: tenths };
    setValue(tenths); setError(''); setStatus('Alteração pendente');
    render({ ...draft.current, exposureTenths: comparison.current ? 0 : tenths }); schedule();
  }
  function changeControl(text: string) {
    setNumericText(Number(text).toFixed(1));
    change(text);
  }
  const disabled = !loaded || !prepared || leaving || Boolean(previewError);
  return <div className="editing">
    {preview && <figure><canvas ref={canvas} width={1} height={1} role="img" aria-label={`Prévia de edição de ${photo.name}`}/><figcaption>{photo.name} · Prévia sRGB até 2048 px</figcaption></figure>}
    <div className="exposure" aria-label="Ajuste de exposição">
      <label>Exposição <input aria-label="Exposição" type="range" min="-3" max="3" step="0.1" value={value / 10} disabled={disabled} onChange={event => changeControl(event.target.value)}/></label>
      <input aria-label="Exposição em EV" type="number" min="-3" max="3" step="0.1" value={numericText} disabled={disabled} onChange={event => { setNumericText(event.target.value); change(event.target.value); }} onBlur={() => setNumericText((draft.current.exposureTenths / 10).toFixed(1))}/><span>EV</span>
      <button disabled={disabled} onClick={() => changeControl('0')}>Redefinir exposição</button>
      <button disabled={disabled} aria-pressed={compare} onClick={() => { comparison.current = !comparison.current; setCompare(comparison.current); render({ ...draft.current, exposureTenths: comparison.current ? 0 : draft.current.exposureTenths }); }}>Comparar com 0 EV</button>
      <span className="save-status" role="status" aria-live="polite">{status}</span>
      {(error || previewError) && <p role="alert">{error || previewError} {error && loaded && <button disabled={leaving} onClick={() => { cancelDelay(); void save(); }}>Tentar salvar novamente</button>}</p>}
    </div>
  </div>;
});
