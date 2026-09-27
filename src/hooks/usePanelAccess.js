import { useContext, createContext } from 'react';

export const PanelAccessContext = createContext({ role: null, canRead: false, canWrite: false, canDelete: false, canAddNotes: false });
export const usePanelAccess = () => useContext(PanelAccessContext);
