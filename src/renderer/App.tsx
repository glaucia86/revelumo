import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BatchItem, ImportProgress, PhotoSummary, PhotoStatus, PhotoAvailability, Preview, LibraryFilters } from '../shared/contracts.ts';
import { lastPage, pagePhotos } from './gallery.ts';
import { Icon } from './ui/Icon.tsx';
import './theme/cobre.css';
import { ClassificationControls } from './ClassificationControls.tsx';
import { ExposureEditor, type ExposureHandle } from './ExposureEditor.tsx';

export function App() {
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [filters, setFilters] = useState<LibraryFilters>({ rating: 'all', flag: 'all' });
  const [total, setTotal] = useState(0);
  const [queryError, setQueryError] = useState('');
  const [queryRefresh, setQueryRefresh] = useState(0);
  const [importNotice, setImportNotice] = useState<{ message: string; ids: string[] } | null>(null);
  const querySequence = useRef(0);
  const filtered = filters.rating !== 'all' || filters.flag !== 'all';
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
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [failures, setFailures] = useState<BatchItem[]>([]);
  const [page, setPage] = useState(0);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [thumbnailErrors, setThumbnailErrors] = useState<Record<string, string>>({});
  const openSequence = useRef(0);
  const editor = useRef<ExposureHandle>(null);
  const catalogSection = useRef<HTMLElement>(null);
  const returnFocusId = useRef<string | null>(null);
  const transitioning = useRef(false), pendingExit = useRef<(() => void | Promise<void>) | null>(null);
  const pendingClose = useRef(false);
  const [exitFailed, setExitFailed] = useState(false), [exiting, setExiting] = useState(false);
  const closeHandler = useRef<() => void>(() => {});
  closeHandler.current = () => {
    if (transitioning.current) { pendingClose.current = true; return; }
    void leave(async () => { await window.revelumo.confirmClose(); });
  };
  useEffect(() => window.revelumo.onCloseRequested(() => closeHandler.current()), []);

  async function leave(action: () => void | Promise<void>, discard = false) {
    if (transitioning.current) return;
    transitioning.current = true; pendingExit.current = action; setExiting(true);
    try {
      await editor.current?.leave(discard);
      setExitFailed(false); pendingExit.current = null;
      await action();
    } catch { setExitFailed(true); }
    finally {
      transitioning.current = false; setExiting(false);
      if (pendingClose.current) { pendingClose.current = false; closeHandler.current(); }
    }
  }
  const visible = useMemo(() => pagePhotos(photos, page), [photos, page]);

  useEffect(() => {
    if (viewing && !importNotice) return;
    let active = true;
    const sequence = ++querySequence.current;
    setLoading(true); setQueryError('');
    window.revelumo.queryPhotos(filters).then((result) => {
      if (!active || sequence !== querySequence.current) return;
      if (result.ok) {
        setPhotos(result.value.photos); setTotal(result.value.total);
        setPage(current => Math.min(current, lastPage(result.value.photos.length)));
        const visibleIds = new Set(result.value.photos.map(photo => photo.id));
        const hidden = importNotice?.ids.filter(id => !visibleIds.has(id)).length ?? 0;
        if (importNotice) setMessage(`${importNotice.message}${hidden ? ` ${hidden} foto(s) importada(s) oculta(s) pelos filtros. Os registros continuam no catálogo.` : ''}`);
      } else { setPhotos([]); setQueryError(result.message); }
    }).catch(() => { if (active && sequence === querySequence.current) { setPhotos([]); setQueryError('Não foi possível consultar a biblioteca. Tente novamente.'); } })
      .finally(() => { if (active && sequence === querySequence.current) setLoading(false); });
    return () => { active = false; };
  }, [filters, queryRefresh, viewing, importNotice]);

  useEffect(() => {
    if (viewing || loading || !returnFocusId.current) return;
    const section = catalogSection.current;
    const photoButton = section?.querySelector<HTMLButtonElement>(`[data-photo-id="${returnFocusId.current}"]`);
    const target = photoButton ?? section?.querySelector<HTMLElement>('.query-error button, h1');
    target?.focus();
    returnFocusId.current = null;
  }, [viewing, loading, visible, queryError]);

  function changeFilters(next: LibraryFilters) {
    ++querySequence.current;
    setFilters(next); setPage(0); setPhotos([]); setLoading(true); setQueryError(''); setMessage(''); setImportNotice(null);
  }

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
      // An editing session owns its draft/base until an explicit exit. Focus
      // may refresh the cheap grid snapshots, never recreate that session.
      if (viewing && selectedPhoto) void refreshSelectedStatus(selectedPhoto);
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
    if (viewing && selectedPhoto?.id !== photo.id) { await leave(() => openPhotoAfterFlush(photo)); return; }
    if (viewing && selectedPhoto?.id === photo.id && preview) return;
    await openPhotoAfterFlush(photo);
  }

  async function refreshSelectedStatus(photo: PhotoSummary) {
    const sequence = openSequence.current;
    try {
      const result = await window.revelumo.originalStatus(photo.id);
      if (sequence !== openSequence.current) return;
      if (result.ok) setCurrentStatus(result.value);
      else setMessage(result.message);
    } catch { if (sequence === openSequence.current) setMessage('Não foi possível verificar o original.'); }
  }

  async function openPhotoAfterFlush(photo: PhotoSummary) {
    const sequence = ++openSequence.current;
    setImportNotice(null);
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
      else { setRefresh(current => current + 1); if (preview) await refreshSelectedStatus(result.value.photo); else await openPhoto(result.value.photo); }
    } catch { setMessage('Não foi possível localizar o original. O registro anterior foi preservado.'); }
    finally { setRelocating(false); }
  }

  async function importPhotos() {
    setImportNotice(null);
    setImporting(true); setProgress(null); setFailures([]); setMessage('Escolha um ou mais JPEGs na janela de arquivos.');
    try {
      const result = await window.revelumo.importJpeg();
      if (!result.ok) { setMessage(result.message); return; }
      if (result.value.canceled) { setMessage('Seleção cancelada.'); return; }
      const items = result.value.items;
      const failed = items.filter(item => !item.result.ok);
      setFailures(failed);
      const ids = [...new Set(items.flatMap(item => item.result.ok ? [item.result.value.id] : []))];
      setImportNotice({ message: `${items.length - failed.length} arquivo(s) válido(s), ${failed.length} falha(s).${result.value.stopped ? ' Importação interrompida.' : ''}`, ids });
      setQueryRefresh(current => current + 1);
    } catch { setMessage('Não foi possível concluir a importação. As fotos já salvas permanecem no catálogo.'); }
    finally { setImporting(false); setProgress(null); }
  }

  function resetViewer() { if (viewing) returnFocusId.current = selectedPhoto?.id ?? null; ++openSequence.current; setLoading(true); setQueryRefresh(current => current + 1); setImportNotice(null); setViewing(false); setSelectedPhoto(null); setCurrentStatus(null); setPreview(null); setMessage(''); }
  function showGrid() { void leave(resetViewer); }

  return <main className="catalog-shell" data-view={viewing ? 'editor' : 'catalog'}>
    <header className="catalog-header">
      <div className="catalog-brand" aria-label="Revelumo"><span className="brand-mark" aria-hidden="true"/><span>revelumo<span className="brand-dot">.</span></span></div>
      <nav className="workspace-navigation" aria-label="Área de trabalho">
        <button disabled={relocating || classifying || exiting} onClick={showGrid} aria-current={!viewing ? 'page' : undefined}>Catálogo</button>
        <span aria-current={viewing ? 'page' : undefined} title={!viewing ? 'Abra uma foto do catálogo para editar' : undefined}>Edição</span>
      </nav>
      <button className="catalog-import" disabled={loading || importing || relocating || classifying || exiting} onClick={() => { if (viewing) void leave(async () => { resetViewer(); await importPhotos(); }); else void importPhotos(); }}><Icon name="import"/>Importar JPEGs</button>
    </header>
    <div className="workspace">
      <aside className="catalog-sidebar"><h2>Biblioteca</h2>
        <button className="photo" disabled={relocating || classifying || exiting} onClick={showGrid} aria-label="Todas as fotos" aria-pressed={!viewing}><Icon name="grid"/><span>Todas as fotos</span><span className="catalog-count">{total}</span></button>
        <button className="photo" disabled={loading || importing || relocating || classifying || exiting} onClick={() => { setRefresh(current => current + 1); if (viewing && selectedPhoto) void refreshSelectedStatus(selectedPhoto); }}><Icon name="refresh"/>Verificar disponibilidade</button>

        <fieldset className="library-filters" disabled={viewing || importing || relocating || classifying || exiting}>
          <legend>Filtrar biblioteca</legend>
          <label htmlFor="filter-rating">Estrelas mínimas</label>
          <select id="filter-rating" value={filters.rating} onChange={event => changeFilters({ ...filters, rating: event.target.value === 'all' || event.target.value === 'unrated' ? event.target.value : Number(event.target.value) as LibraryFilters['rating'] })}>
            <option value="all">Todas as avaliações</option><option value="unrated">Sem avaliação</option>
            {[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating} {rating === 1 ? 'estrela ou mais' : 'estrelas ou mais'}</option>)}
          </select>
          <label htmlFor="filter-flag">Marcação</label>
          <select id="filter-flag" value={filters.flag} onChange={event => changeFilters({ ...filters, flag: event.target.value as LibraryFilters['flag'] })}>
            <option value="all">Todas as marcações</option><option value="neutral">Sem flag</option><option value="selected">Selecionada</option><option value="rejected">Rejeitada</option>
          </select>
          <button disabled={!filtered} onClick={() => changeFilters({ rating: 'all', flag: 'all' })}>Limpar filtros</button>
          <p className="quiet">Estrelas e marcação se combinam. Filtros duram esta sessão.</p>
        </fieldset>
        <div className="catalog-local"><p>Seu catálogo fica neste computador.</p><p>Os originais continuam onde estão.</p></div>
        {importing && <div className="import-progress" role="status" aria-live="polite"><p>{progress?.total ? `${progress.completed} de ${progress.total} arquivos` : 'Aguardando seleção…'}</p>
          {progress && progress.total > 0 && <><progress max={progress.total} value={progress.completed}/><p className="current-file">{progress.currentName}</p></>}
        </div>}
      </aside>
      <section ref={catalogSection} className={viewing ? 'viewer' : 'gallery'} aria-label={viewing ? 'Visualização da foto' : 'Grade de fotos'} aria-busy={loading}>
        {viewing ? <><button className="back" disabled={relocating || classifying || exiting} onClick={showGrid}>← Voltar à grade</button>{currentStatus && currentStatus.state !== 'available' ? <div className="original-notice" role="status"><h2>{selectedPhoto?.name}</h2><p>{currentStatus.message}</p>{preview && <p>A prévia existente e o rascunho foram mantidos; o original precisa estar disponível para salvar.</p>}{currentStatus.canRelocate && <button disabled={relocating || importing || classifying || exiting} onClick={() => void relocatePhoto()} aria-label={`Localizar original de ${selectedPhoto?.name}`}>{relocating ? 'Localizando…' : 'Localizar original'}</button>}</div> : !preview && <p className="quiet">{message || 'Abrindo prévia…'}</p>}{selectedPhoto && <><ExposureEditor key={`exposure-${selectedPhoto.id}`} ref={editor} photo={selectedPhoto} preview={preview}/><ClassificationControls key={selectedPhoto.id} photo={selectedPhoto} onBusyChange={setClassifying} onMessage={setMessage}/></>}</> :
          <><div className="catalog-heading"><h1 tabIndex={-1}>{filtered ? 'Fotos filtradas' : 'Todas as fotos'}</h1><p>JPEG · catálogo local</p></div>{failures.length > 0 && <details className="failures"><summary>{failures.length} arquivo(s) não importado(s)</summary><ul>{failures.map((item, index) => <li key={index}>{item.name}: {!item.result.ok && item.result.message}</li>)}</ul></details>}
            {loading ? <p role="status">Consultando biblioteca.</p> : queryError ? <div className="query-error" role="alert"><p>{queryError}</p><button onClick={() => setQueryRefresh(current => current + 1)}>Tentar novamente</button></div> : photos.length ? <><p className="quiet" role="status">{photos.length} de {total} fotos{filtered ? ' correspondem aos filtros' : ''}.</p><div className="grid" role="list" aria-label="Fotos importadas">{visible.map(photo => <div role="listitem" key={photo.id}><button className="tile" data-photo-id={photo.id} onClick={() => void openPhoto(photo)} aria-label={`Abrir ${photo.name}`} aria-describedby={statuses[photo.id] && statuses[photo.id].state !== 'present' ? `original-${photo.id}` : undefined}>
              <span className="thumbnail">{thumbnails[photo.id] ? <img src={thumbnails[photo.id]} alt=""/> : <span title={thumbnailErrors[photo.id]}>{thumbnailErrors[photo.id] ? 'Miniatura indisponível' : 'Carregando…'}</span>}</span><span className="filename" title={photo.name}>{photo.name}</span><span className="tile-meta"><span>JPEG</span><span>Abrir foto <Icon name="arrow"/></span></span>
              {statuses[photo.id] && statuses[photo.id].state !== 'present' && <span className="original-status" id={`original-${photo.id}`}>{statuses[photo.id].state === 'missing' ? 'Original ausente' : 'Original indisponível'}</span>}
            </button></div>)}</div><nav className="pagination" aria-label="Páginas da biblioteca"><button disabled={page === 0} onClick={() => setPage(current => current - 1)}>Anterior</button><span>Página {page + 1} de {lastPage(photos.length) + 1}</span><button disabled={page >= lastPage(photos.length)} onClick={() => setPage(current => current + 1)}>Próxima</button></nav></> :
              total > 0 ? <div className="empty"><h2>Nenhuma foto corresponde aos filtros.</h2><p>As {total} fotos continuam no catálogo. Altere ou limpe os filtros para encontrá-las.</p><button onClick={() => changeFilters({ rating: 'all', flag: 'all' })}>Limpar filtros</button></div> : <div className="empty"><span className="empty-icon"><Icon name="image"/></span><h2>Seu catálogo está vazio</h2><p>Use “Importar JPEGs” para adicionar suas fotos.<br/>Os arquivos continuam onde estão.</p></div>}
          </>}
      </section>
    </div>
    {exitFailed && <div className="exit-failure" role="alert"><p>Não foi possível salvar o último ajuste. A foto permanece aberta.</p><button disabled={exiting} onClick={() => { const action = pendingExit.current; if (action) void leave(action); }}>Tentar novamente e sair</button><button disabled={exiting} onClick={() => { pendingExit.current = null; setExitFailed(false); }}>Permanecer</button><button disabled={exiting} onClick={() => { const action = pendingExit.current; if (action) void leave(action, true); }}>Descartar ajuste não salvo e sair</button></div>}
    <footer className="catalog-footer"><span role="status" aria-live="polite">{message || 'Catálogo local · sem alterar seus arquivos'}</span><span>Em desenvolvimento</span></footer>
  </main>;
}
