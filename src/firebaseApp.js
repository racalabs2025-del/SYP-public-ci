import { initializeApp } from 'firebase/app';
import { firebaseConfig } from './shared/firebaseConfig.js';

if (import.meta.env?.DEV && firebaseConfig.projectId === 'foodsense-e1bf6' && import.meta.env?.VITE_ALLOW_PRODUCTION_FIREBASE !== 'true') {
  throw new Error('Yerel geliştirmede üretim Firebase projesi kapalıdır. Emulator kullanın veya VITE_ALLOW_PRODUCTION_FIREBASE=true değerini bilinçli olarak ayarlayın.');
}
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const app = initializeApp(firebaseConfig);
// Explicit local demo environment; real authentication and security rules still apply.
export const localDemo = import.meta.env?.DEV && import.meta.env?.VITE_USE_EMULATORS === 'true' && firebaseConfig.projectId.startsWith('demo-');
if (localDemo) {
  connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9098');
}
export { app };
