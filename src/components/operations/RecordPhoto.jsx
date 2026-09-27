import { useEffect, useState } from 'react';
import { safePhoto } from '../../domain/commandCenter.js';
import { supabase } from '../../supabaseClient.js';

export default function RecordPhoto({ value, alt = '', className = '' }) {
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!value || value.startsWith('https://') || value.startsWith('syp-photo:')) return undefined;
    let active = true;
    supabase?.storage.from('syp-records').createSignedUrl(value, 300).then(({ data, error }) => { if (active) setLoaded({ value, url: error ? '' : data?.signedUrl || '' }); }).catch(() => { if (active) setLoaded({ value, url: '' }); });
    return () => { active = false; };
  }, [value]);
  const src = value?.startsWith('https://') ? safePhoto(value) : loaded?.value === value ? loaded.url : '';
  if (!src) return <span className={className + ' cc-photo-placeholder'} aria-label="Fotoğraf yüklenemedi veya yükleniyor" />;
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
