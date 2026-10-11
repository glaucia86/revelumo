import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BatchItem, ImportProgress, PhotoSummary, Preview } from '../shared/contracts.ts';
import { lastPage, pagePhotos } from './gallery.ts';

export function App() {
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
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
    setThumbnails({}); setThumbnailErrors({});
    // Only this page is resident, with one request at a time. Old page requests
    // are allowed to finish but cannot populate a newly selected page.
    void (async () => {
      for (const photo of visible) {
        if (!active) break;
        try {
          const result = await window.revelumo.thumbnailPhoto(photo.id);
          if (!active) break;
          if (result.ok) setThumbnails(current => ({ ...current, [photo.id]: result.value.dataUrl }));
          else setThumbnailErrors(current => ({ ...current, [photo.id]: result.message }));
        } catch { if (active) setThumbnailErrors(current => ({ ...current, [photo.id]: 'Miniatura indisponível.' })); }
      }
    })();
    return () => { active = false; };
  }, [visible]);

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
    setViewing(true); setMessage('Abrindo prévia…'); setPreview(null);
    try {
      const result = await window.revelumo.previewPhoto(photo.id);
      if (sequence !== openSequence.current) return;
      if (result.ok) { setPreview(result.value); setMessage(''); }
      else setMessage(result.message);
    } catch { if (sequence === openSequence.current) setMessage('Não foi possível abrir a prévia.'); }
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

  function showGrid() { ++openSequence.current; setViewing(false); setPreview(null); setMessage(''); }

  return <main>
    <header><div><span className="eyebrow">SEU OLHAR, EM PRIMEIRO LUGAR</span><h1>Revelumo<span> / biblioteca</span></h1></div>
      <button disabled={loading || importing} onClick={() => void importPhotos()}>Importar JPEGs</button></header>
    <div className="workspace">
      <aside><h2>Biblioteca <span>{photos.length}</span></h2><p className="quiet">Originais preservados</p>
        <button className="photo" onClick={showGrid} aria-pressed={!viewing}>Todas as fotos</button>
        <p className="quiet">JPEG · catálogo local<br/>Miniaturas derivadas</p>
        {importing && <div className="import-progress" role="status" aria-live="polite"><p>{progress?.total ? `${progress.completed} de ${progress.total} arquivos` : 'Aguardando seleção…'}</p>
          {progress && progress.total > 0 && <><progress max={progress.total} value={progress.completed}/><p className="current-file">{progress.currentName}</p></>}
        </div>}
      </aside>
      <section className={viewing ? 'viewer' : 'gallery'} aria-label={viewing ? 'Visualização da foto' : 'Grade de fotos'} aria-busy={loading}>
        {viewing ? <><button className="back" onClick={showGrid}>← Voltar à grade</button>{preview ? <figure><img src={preview.dataUrl} alt={preview.photo.name}/><figcaption>{preview.photo.name}</figcaption></figure> : <p className="quiet">{message || 'Abrindo prévia…'}</p>}</> :
          <>{failures.length > 0 && <details className="failures"><summary>{failures.length} arquivo(s) não importado(s)</summary><ul>{failures.map((item, index) => <li key={index}>{item.name}: {!item.result.ok && item.result.message}</li>)}</ul></details>}
            {photos.length ? <><div className="grid" role="list" aria-label="Fotos importadas">{visible.map(photo => <button role="listitem" className="tile" key={photo.id} onClick={() => void openPhoto(photo)} aria-label={`Abrir ${photo.name}`}>
              <span className="thumbnail">{thumbnails[photo.id] ? <img src={thumbnails[photo.id]} alt=""/> : <span title={thumbnailErrors[photo.id]}>{thumbnailErrors[photo.id] ? 'Miniatura indisponível' : 'Carregando…'}</span>}</span><span className="filename">{photo.name}</span>
            </button>)}</div><nav className="pagination" aria-label="Páginas da biblioteca"><button disabled={page === 0} onClick={() => setPage(current => current - 1)}>Anterior</button><span>Página {page + 1} de {lastPage(photos.length) + 1}</span><button disabled={page >= lastPage(photos.length)} onClick={() => setPage(current => current + 1)}>Próxima</button></nav></> :
              <div className="empty"><span className="mark">R</span><h2>Toda foto começa com um olhar.</h2><p>Importe JPEGs para começar. Os arquivos continuam onde estão.</p></div>}
          </>}
      </section>
    </div>
    <footer><span role="status" aria-live="polite">{message || 'Catálogo local · sem alterar seus arquivos'}</span><span>PRÉVIA DE DESENVOLVIMENTO</span></footer>
  </main>;
}
