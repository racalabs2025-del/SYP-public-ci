import { useEffect } from 'react';
import { useFocusTrap } from './useFocusTrap.js';

// Keep the same map mounted so opening the focus view preserves its camera.
export function useMapFocus(active, containerRef, onClose) {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const siblings = [];
    let node = containerRef.current;
    while (node.parentElement && node !== document.body) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && !sibling.inert) {
          siblings.push(sibling);
          sibling.setAttribute('inert', '');
        }
      }
      node = node.parentElement;
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      siblings.forEach((sibling) => sibling.removeAttribute('inert'));
      window.removeEventListener('keydown', handleEscape);
    };
  }, [active, containerRef, onClose]);

  useFocusTrap(active, containerRef);
}
