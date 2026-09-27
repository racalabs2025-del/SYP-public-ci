import { createContext, useContext } from 'react';
export const CommandCenterContext = createContext(null);
export const useCommandCenter = () => useContext(CommandCenterContext);
