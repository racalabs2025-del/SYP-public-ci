import { useEffect, useState } from 'react';

const cache = new Map();
export function useNeighborhoodBoundaries(districtId) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const requestId = `${districtId}/${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        let data = cache.get(districtId);
        if (!data) {
          const response = await fetch(`/map/neighborhoods/${encodeURIComponent(districtId)}.json`, { signal: controller.signal });
          if (!response.ok) throw new Error('Sınırlar yüklenemedi.');
          data = await response.json();
          if (data.districtId !== districtId || !Array.isArray(data.features)
            || !Array.isArray(data.missingIds) || typeof data.sourceTimestamp !== 'string'
            || data.features.some(f => typeof f.id !== 'string' || typeof f.path !== 'string'
              || !Number.isFinite(f.anchor?.x) || !Number.isFinite(f.anchor?.y)
              || !['minX', 'minY', 'maxX', 'maxY'].every(key => Number.isFinite(f.bounds?.[key])))) throw new Error('Sınır verisi doğrulanamadı.');
          cache.set(districtId, data);
        }
        if (!controller.signal.aborted) setResult({ requestId, status: 'ready', data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ requestId, status: 'error', error: error.message });
      }
    };
    load();
    return () => controller.abort();
  }, [districtId, requestId]);
  return { ...(result?.requestId === requestId ? result : { status: 'loading' }), retry: () => setAttempt(n => n + 1) };
}
