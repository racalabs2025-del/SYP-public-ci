import { getAuth } from 'firebase/auth';
import { app } from './firebaseApp.js';

export const auth = getAuth(app);