import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BatchItem, ImportProgress, PhotoSummary, PhotoStatus, PhotoAvailability, Preview } from '../shared/contracts.ts';
import { lastPage, pagePhotos } from './gallery.ts';
import { ClassificationControls } from './ClassificationControls.tsx';

export function App() {
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [relocating, setRelocating] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoSummary | null>(null);
  const [currentStatus, setCurrentStatus] = useState<PhotoStatus | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PhotoAvailability>>({});
  const [refresh, setRefresh] = useState(0);
  const [viewing, setViewing] = useState(false);
  const [message, setMessage] = useState('Abrindo catálogo…');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [failures, setFailures] = useState<BatchItem[]>([]);
  const [page, setPage] = useState(0);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [thumbnailErrors, setThumbnailErrors] = useState<Record<string, string>>({});
  const openSequence = useRef(0);
  const visible = useMemo(() => pagePhotos(photos, page), [photos, page]);

  useEffect(() => {
    let active = true;
    window.revelumo.listPhotos().then((result) => {
      if (!active) return;
      if (result.ok) { setPhotos(result.value); setMessage(''); }
      else setMessage(result.message);
    }).catch(() => { if (active) setMessage('Não foi possível abrir o catálogo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setThumbnails({}); setThumbnailErrors({}); setStatuses({});
    // Only this page is resident, with one request at a time. Old page requests
    // are allowed to finish but cannot populate a newly selected page.
    void (async () => {
      for (const photo of visible) {
        if (!active) break;
        try {
          const status = await window.revelumo.originalAvailability(photo.id);
          if (!active) break;
          if (status.ok) setStatuses(current => ({ ...current, [photo.id]: status.value }));
        } catch { /* A failed status check must not falsely label an original missing. */ }
        try {
          const result = await window.revelumo.thumbnailPhoto(photo.id);
          if (!active) break;
          if (result.ok) setThumbnails(current => ({ ...current, [photo.id]: result.value.dataUrl }));
          else setThumbnailErrors(current => ({ ...current, [photo.id]: result.message }));
        } catch { if (active) setThumbnailErrors(current => ({ ...current, [photo.id]: 'Miniatura indisponível.' })); }
      }
    })();
    return () => { active = false; };
  }, [visible, refresh]);

  useEffect(() => {
    const onFocus = () => {
      if (importing || relocating || classifying) return;
      setRefresh(current => current + 1);
      if (viewing && selectedPhoto) void openPhoto(selectedPhoto);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [importing, relocating, classifying, viewing, selectedPhoto]);

  useEffect(() => {
    if (!importing) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const result = await window.revelumo.importProgress(); if (active && result.ok) setProgress(result.value); }
      catch { /* Final import result supplies any operation error. */ }
      if (active) timer = setTimeout(() => void poll(), 150);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [importing]);

  async function openPhoto(photo: PhotoSummary) {
    const sequence = ++openSequence.current;
    setViewing(true); setSelectedPhoto(photo); setCurrentStatus(null); setMessage('Abrindo prévia…'); setPreview(null);
    try {
      const status = await window.revelumo.originalStatus(photo.id);
      if (sequence !== openSequence.current) return;
      if (!status.ok) { setMessage(status.message); return; }
      setCurrentStatus(status.value);
      if (status.value.state !== 'available') { setMessage(status.value.message); return; }
      const result = await window.revelumo.previewPhoto(photo.id);
      if (sequence !== openSequence.current) return;
      if (result.ok) { setPreview(result.value); setMessage(''); }
      else {
        setMessage(result.message);
        const fresh = await window.revelumo.originalStatus(photo.id);
        if (sequence === openSequence.current && fresh.ok) setCurrentStatus(fresh.value);
      }
    } catch { if (sequence === openSequence.current) setMessage('Não foi possível abrir a prévia.'); }
  }

  async function relocatePhoto() {
    if (!selectedPhoto || !currentStatus?.canRelocate || relocating || importing) return;
    const photo = selectedPhoto;
    setRelocating(true); setMessage('Escolha a nova localização do original.');
    try {
      const result = await window.revelumo.relocatePhoto(photo.id);
      if (!result.ok) {
        setMessage(result.message);
        const status = await window.revelumo.originalStatus(photo.id);
        if (status.ok) {
          setCurrentStatus(status.value);
          if (status.value.state === 'available') await openPhoto(photo);
        }
      } else if (result.value.canceled) setMessage('Localização cancelada.');
      else { setRefresh(current => current + 1); await openPhoto(result.value.photo); }
    } catch { setMessage('Não foi possível localizar o original. O registro anterior foi preservado.'); }
    finally { setRelocating(false); }
  }

  async function importPhotos() {
    setImporting(true); setProgress(null); setFailures([]); setMessage('Escolha um ou mais JPEGs na janela de arquivos.');
    try {
      const result = await window.revelumo.importJpeg();
      if (!result.ok) { setMessage(result.message); return; }
      if (result.value.canceled) { setMessage('Seleção cancelada.'); return; }
      const items = result.value.items;
      const failed = items.filter(item => !item.result.ok);
      setFailures(failed);
      const listed = await window.revelumo.listPhotos();
      if (listed.ok) setPhotos(listed.value);
      setMessage(`${items.length - failed.length} arquivo(s) válido(s), ${failed.length} falha(s).${result.value.stopped ? ' Importação interrompida.' : ''}${listed.ok ? '' : ' Não foi possível atualizar a biblioteca.'}`);
    } catch { setMessage('Não foi possível concluir a importação. As fotos já salvas permanecem no catálogo.'); }
    finally { setImporting(false); setProgress(null); }
  }

  function showGrid() { ++openSequence.current; setViewing(false); setSelectedPhoto(null); setCurrentStatus(null); setPreview(null); setMessage(''); }

  return <main>
    <header><div><span className="eyebrow">SEU OLHAR, EM PRIMEIRO LUGAR</span><h1>Revelumo<span> / biblioteca</span></h1></div>
      <button disabled={loading || importing || relocating || classifying} onClick={() => void importPhotos()}>Importar JPEGs</button></header>
    <div className="workspace">
      <aside><h2>Biblioteca <span>{photos.length}</span></h2><p className="quiet">Originais preservados</p>
        <button className="photo" disabled={relocating || classifying} onClick={showGrid} aria-pressed={!viewing}>Todas as fotos</button>
        <button className="photo" disabled={loading || importing || relocating || classifying} onClick={() => { setRefresh(current => current + 1); if (viewing && selectedPhoto) void openPhoto(selectedPhoto); }}>Verificar disponibilidade</button>
        <p className="quiet">JPEG · catálogo local<br/>Miniaturas derivadas</p>
        {importing && <div className="import-progress" role="status" aria-live="polite"><p>{progress?.total ? `${progress.completed} de ${progress.total} arquivos` : 'Aguardando seleção…'}</p>
          {progress && progress.total > 0 && <><progress max={progress.total} value={progress.completed}/><p className="current-file">{progress.currentName}</p></>}
        </div>}
      </aside>
      <section className={viewing ? 'viewer' : 'gallery'} aria-label={viewing ? 'Visualização da foto' : 'Grade de fotos'} aria-busy={loading}>
        {viewing ? <><button className="back" disabled={relocating || classifying} onClick={showGrid}>← Voltar à grade</button>{preview ? <figure><img src={preview.dataUrl} alt={preview.photo.name}/><figcaption>{preview.photo.name}</figcaption></figure> :
          currentStatus && currentStatus.state !== 'available' ? <div className="original-notice" role="status"><h2>{selectedPhoto?.name}</h2><p>{currentStatus.message}</p>{currentStatus.canRelocate && <button disabled={relocating || importing || classifying} onClick={() => void relocatePhoto()} aria-label={`Localizar original de ${selectedPhoto?.name}`}>{relocating ? 'Localizando…' : 'Localizar original'}</button>}</div> : <p className="quiet">{message || 'Abrindo prévia…'}</p>}{selectedPhoto && <ClassificationControls key={selectedPhoto.id} photo={selectedPhoto} onBusyChange={setClassifying} onMessage={setMessage}/>}</> :
          <>{failures.length > 0 && <details className="failures"><summary>{failures.length} arquivo(s) não importado(s)</summary><ul>{failures.map((item, index) => <li key={index}>{item.name}: {!item.result.ok && item.result.message}</li>)}</ul></details>}
            {photos.length ? <><div className="grid" role="list" aria-label="Fotos importadas">{visible.map(photo => <div role="listitem" key={photo.id}><button className="tile" onClick={() => void openPhoto(photo)} aria-label={`Abrir ${photo.name}`} aria-describedby={statuses[photo.id] && statuses[photo.id].state !== 'present' ? `original-${photo.id}` : undefined}>
              <span className="thumbnail">{thumbnails[photo.id] ? <img src={thumbnails[photo.id]} alt=""/> : <span title={thumbnailErrors[photo.id]}>{thumbnailErrors[photo.id] ? 'Miniatura indisponível' : 'Carregando…'}</span>}</span><span className="filename">{photo.name}</span>
              {statuses[photo.id] && statuses[photo.id].state !== 'present' && <span className="original-status" id={`original-${photo.id}`}>{statuses[photo.id].state === 'missing' ? 'Original ausente' : 'Original indisponível'}</span>}
            </button></div>)}</div><nav className="pagination" aria-label="Páginas da biblioteca"><button disabled={page === 0} onClick={() => setPage(current => current - 1)}>Anterior</button><span>Página {page + 1} de {lastPage(photos.length) + 1}</span><button disabled={page >= lastPage(photos.length)} onClick={() => setPage(current => current + 1)}>Próxima</button></nav></> :
              <div className="empty"><span className="mark">R</span><h2>Toda foto começa com um olhar.</h2><p>Importe JPEGs para começar. Os arquivos continuam onde estão.</p></div>}
          </>}
      </section>
    </div>
    <footer><span role="status" aria-live="polite">{message || 'Catálogo local · sem alterar seus arquivos'}</span><span>PRÉVIA DE DESENVOLVIMENTO</span></footer>
  </main>;
}
