import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getServerApp() {
  let app = getApps().find((item) => item.name === 'syp-server');
  if (!app) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    app = initializeApp({
      credential: serviceAccount ? cert(JSON.parse(serviceAccount)) : applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
    }, 'syp-server');
  }
  return app;
}

export function getServerAuth() {
  return getAuth(getServerApp());
}
