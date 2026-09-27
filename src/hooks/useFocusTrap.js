import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(isActive, containerRef) {
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isActive || !containerRef?.current) {
      return undefined;
    }

    const container = containerRef.current;
    previousFocusRef.current = document.activeElement;

    const getFocusable = () => Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
    const focusable = getFocusable();

    if (focusable.length) {
      focusable[0].focus();
    } else {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    function handleKeyDown(event) {
      if (event.key !== 'Tab') {
        return;
      }

      const currentFocusable = getFocusable();
      if (!currentFocusable.length) {
        event.preventDefault();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [isActive, containerRef]);
}
