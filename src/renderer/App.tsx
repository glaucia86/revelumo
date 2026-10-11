import React, { useEffect, useState } from 'react';
import type { PhotoSummary, Preview } from '../shared/contracts.ts';

export function App() {
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('Abrindo catálogo…');

  useEffect(() => {
    let active = true;
    window.revelumo.listPhotos().then((result) => {
      if (!active) return;
      if (result.ok) { setPhotos(result.value); setMessage(''); }
      else setMessage(result.message);
    }).catch(() => { if (active) setMessage('Não foi possível abrir o catálogo.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function openPhoto(photo: PhotoSummary) {
    setBusy(true); setMessage('Abrindo prévia…'); setPreview(null);
    try {
      const result = await window.revelumo.previewPhoto(photo.id);
      if (result.ok) { setPreview(result.value); setMessage(''); }
      else setMessage(result.message);
    } catch { setMessage('Não foi possível abrir a prévia.'); }
    finally { setBusy(false); }
  }

  async function importPhoto() {
    setBusy(true); setMessage('Escolha um JPEG na janela de arquivos.');
    try {
      const result = await window.revelumo.importJpeg();
      if (!result.ok) { setMessage(result.message); return; }
      if (result.value.canceled) { setMessage(''); return; }
      const photo = result.value.photo;
      setPhotos((current) => current.some((item) => item.id === photo.id) ? current : [...current, photo]);
      await openPhoto(photo);
    } catch { setMessage('Não foi possível importar a foto.'); }
    finally { setBusy(false); }
  }

  return <main>
    <header><div><span className="eyebrow">SEU OLHAR, EM PRIMEIRO LUGAR</span><h1>Revelumo<span> / biblioteca</span></h1></div>
      <button disabled={busy} onClick={() => void importPhoto()}>Importar JPEG</button></header>
    <div className="workspace">
      <aside><h2>Biblioteca <span>{photos.length}</span></h2><p className="quiet">Originais preservados</p>
        <nav aria-label="Fotos importadas">{photos.map((photo) => <button className={preview?.photo.id === photo.id ? 'photo selected' : 'photo'} key={photo.id} disabled={busy} onClick={() => void openPhoto(photo)} aria-pressed={preview?.photo.id === photo.id}>{photo.name}</button>)}</nav>
      </aside>
      <section className="viewer" aria-label="Visualização da foto" aria-busy={busy}>
        {preview ? <figure><img src={preview.dataUrl} alt={preview.photo.name}/><figcaption>{preview.photo.name}</figcaption></figure> :
          <div className="empty"><span className="mark">R</span><h2>{photos.length ? 'Seu catálogo está aqui.' : 'Toda foto começa com um olhar.'}</h2><p>{photos.length ? 'Escolha uma foto da biblioteca para visualizar.' : 'Importe um JPEG para começar. O arquivo continua onde está.'}</p></div>}
      </section>
    </div>
    <footer><span role="status" aria-live="polite">{message || 'Catálogo local · sem alterar seus arquivos'}</span><span>PRÉVIA DE DESENVOLVIMENTO</span></footer>
  </main>;
}
