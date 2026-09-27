import { useEffect } from 'react';

export function useEscapeHandler(isActive, onEscape) {
  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onEscape?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onEscape]);
}
