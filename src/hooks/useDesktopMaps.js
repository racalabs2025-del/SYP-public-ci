import { useSyncExternalStore } from 'react';

const query = '(min-width: 769px) and (pointer: fine)';
function subscribe(callback) {
  const media = window.matchMedia(query);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const getSnapshot = () => window.matchMedia(query).matches;

// Do not mount SVG/WebGL scenes on phones, including landscape orientation.
export function useDesktopMaps() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
