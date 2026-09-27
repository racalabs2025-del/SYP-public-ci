import React, { useState, useEffect } from 'react';

import { ThemeContext } from './themeState.js';

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('syp_theme');
      if (savedTheme === 'dark' || savedTheme === 'light') {
        return savedTheme;
      }
    } catch (e) {
      console.warn('localStorage read error:', e);
    }
    return 'light'; // Varsayılan açık mod
  });

  useEffect(() => {
    try {
      localStorage.setItem('syp_theme', theme);
    } catch (e) {
      console.warn('localStorage write error:', e);
    }

    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('theme-dark');
      document.body.classList.remove('theme-light');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.add('theme-light');
      document.body.classList.remove('theme-dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (newTheme) => {
    if (newTheme === 'dark' || newTheme === 'light') {
      setThemeState(newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
