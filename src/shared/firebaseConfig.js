const DEFAULT_FIREBASE_CONFIG = {
  // This public CI mirror is intentionally non-deployable. Runtime credentials
  // belong to the private deployment environment, not this repository.
  apiKey: 'public-ci-placeholder',
  authDomain: 'foodsense-e1bf6.firebaseapp.com',
  projectId: 'foodsense-e1bf6',
  storageBucket: 'foodsense-e1bf6.firebasestorage.app',
  messagingSenderId: '737504845000',
  appId: '1:737504845000:web:8963d6571cc7f47f5319fd',
  measurementId: 'G-FM5NNE1JRX',
};

// Static property access includes only these public Firebase settings in the browser.
const viteFirebaseConfig = typeof window === 'undefined' ? {} : {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};
const nodeEnv = globalThis.process?.env;

export const firebaseConfig = {
  apiKey: viteFirebaseConfig.apiKey || nodeEnv?.FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: viteFirebaseConfig.authDomain || nodeEnv?.FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: viteFirebaseConfig.projectId || nodeEnv?.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket: viteFirebaseConfig.storageBucket || nodeEnv?.FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: viteFirebaseConfig.messagingSenderId || nodeEnv?.FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: viteFirebaseConfig.appId || nodeEnv?.FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
  measurementId: viteFirebaseConfig.measurementId || nodeEnv?.FIREBASE_MEASUREMENT_ID || DEFAULT_FIREBASE_CONFIG.measurementId,
};
