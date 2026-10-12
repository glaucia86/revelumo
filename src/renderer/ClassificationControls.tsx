import { useLanguage } from './i18n/LanguageProvider.tsx';
import type { MessageDescriptor } from '../shared/i18n/messages.ts';
import React, { useEffect, useRef, useState } from 'react';
import type { PhotoClassification, PhotoFlag, PhotoSummary } from '../shared/contracts.ts';

export function ClassificationControls({ photo, onBusyChange, onMessage }: {
  photo: PhotoSummary; onBusyChange: (busy: boolean) => void; onMessage: (message: MessageDescriptor[]) => void;
}) {
  const { t } = useLanguage();
  const [classification, setClassification] = useState<PhotoClassification | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<MessageDescriptor | null>(null);
  const [reload, setReload] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setClassification(null); setError(null);
    window.revelumo.classificationPhoto(photo.id).then(result => {
      if (!active) return;
      if (result.ok) setClassification(result.value);
      else setError(result.descriptor ?? { key: 'errors.generic' });
    }).catch(() => { if (active) setError({ key: 'errors.readClassification' }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [photo.id, reload]);

  async function save(rating: number | null, flag: PhotoFlag) {
    if (!classification || pending.current || loading) return;
    pending.current = true; setSaving(true); onBusyChange(true); setError(null);
    try {
      const result = await window.revelumo.classifyPhoto(photo.id, rating, flag);
      if (result.ok) { setClassification(result.value); onMessage([{ key: 'classification.saved' }]); }
      else { setError(result.descriptor ?? { key: 'errors.generic' }); onMessage([result.descriptor ?? { key: 'errors.generic' }]); }
    } catch {
      const message = { key: 'classification.unknown' } as const;
      // A disconnected response cannot prove whether main committed the write.
      setClassification(null); setError(message); onMessage([message]);
    } finally { pending.current = false; setSaving(false); onBusyChange(false); }
  }

  const disabled = loading || saving || !classification;
  return <section className="classification" aria-label={t({ key: 'classification.label', params: { filename: photo.name } })} aria-busy={loading || saving}>
    <div role="group" aria-label={t({ key: 'classification.stars' })}>
      {[1, 2, 3, 4, 5].map(rating => <button key={rating} disabled={disabled}
        aria-label={t({ key: 'classification.count', params: { count: rating } })} aria-pressed={classification?.rating === rating}
        onClick={() => void save(rating, classification!.flag)}>{rating} ★</button>)}
      <button disabled={disabled} aria-label={t({ key: 'classification.clear' })} aria-pressed={classification?.rating === null}
        onClick={() => void save(null, classification!.flag)}>{t({ key: 'classification.unrated' })}</button>
    </div>
    <div role="group" aria-label={t({ key: 'classification.flag' })}>
      {([{ flag: 'neutral', label: 'classification.neutral' }, { flag: 'selected', label: 'classification.selected' }, { flag: 'rejected', label: 'classification.rejected' }] as const)
        .map(({ flag, label }) => <button key={flag} disabled={disabled} aria-label={t({ key: label })} aria-pressed={classification?.flag === flag}
          onClick={() => void save(classification!.rating, flag)}>{t({ key: label })}</button>)}
    </div>
    <span role="status" aria-live="polite">{t(loading ? { key: 'classification.reading' } : saving ? { key: 'classification.saving' } : error ?? (classification?.rating == null ? { key: 'classification.unrated' } : { key: 'classification.count', params: { count: classification.rating } }))}</span>
    {error && <button disabled={saving} onClick={() => setReload(current => current + 1)}>{t({ key: 'classification.reload' })}</button>}
  </section>;
}
