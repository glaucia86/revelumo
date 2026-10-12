import React, { useEffect, useRef, useState } from 'react';
import type { PhotoClassification, PhotoFlag, PhotoSummary } from '../shared/contracts.ts';

export function ClassificationControls({ photo, onBusyChange, onMessage }: {
  photo: PhotoSummary; onBusyChange: (busy: boolean) => void; onMessage: (message: string) => void;
}) {
  const [classification, setClassification] = useState<PhotoClassification | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setClassification(null); setError('');
    window.revelumo.classificationPhoto(photo.id).then(result => {
      if (!active) return;
      if (result.ok) setClassification(result.value);
      else setError(result.message);
    }).catch(() => { if (active) setError('Não foi possível ler a classificação.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [photo.id, reload]);

  async function save(rating: number | null, flag: PhotoFlag) {
    if (!classification || pending.current || loading) return;
    pending.current = true; setSaving(true); onBusyChange(true); setError('');
    try {
      const result = await window.revelumo.classifyPhoto(photo.id, rating, flag);
      if (result.ok) { setClassification(result.value); onMessage('Classificação salva.'); }
      else { setError(result.message); onMessage(result.message); }
    } catch {
      const message = 'Não foi possível confirmar a gravação. Recarregue a classificação antes de tentar novamente.';
      // A disconnected response cannot prove whether main committed the write.
      setClassification(null); setError(message); onMessage(message);
    } finally { pending.current = false; setSaving(false); onBusyChange(false); }
  }

  const disabled = loading || saving || !classification;
  return <section className="classification" aria-label={`Classificação de ${photo.name}`} aria-busy={loading || saving}>
    <div role="group" aria-label="Estrelas">
      {[1, 2, 3, 4, 5].map(rating => <button key={rating} disabled={disabled}
        aria-label={`${rating} ${rating === 1 ? 'estrela' : 'estrelas'}`} aria-pressed={classification?.rating === rating}
        onClick={() => void save(rating, classification!.flag)}>{rating} ★</button>)}
      <button disabled={disabled} aria-label="Limpar estrelas" aria-pressed={classification?.rating === null}
        onClick={() => void save(null, classification!.flag)}>Sem estrelas</button>
    </div>
    <div role="group" aria-label="Flag">
      {([{ flag: 'neutral', label: 'Sem flag' }, { flag: 'selected', label: 'Selecionada' }, { flag: 'rejected', label: 'Rejeitada' }] as const)
        .map(({ flag, label }) => <button key={flag} disabled={disabled} aria-label={label} aria-pressed={classification?.flag === flag}
          onClick={() => void save(classification!.rating, flag)}>{label}</button>)}
    </div>
    <span role="status" aria-live="polite">{loading ? 'Lendo classificação.' : saving ? 'Salvando classificação.' : error || (classification?.rating === null ? 'Sem estrelas.' : `${classification?.rating ?? ''} estrela(s).`)}</span>
    {error && <button disabled={saving} onClick={() => setReload(current => current + 1)}>Recarregar classificação</button>}
  </section>;
}
