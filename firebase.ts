import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
export const auth = getAuth(app);

// Analytics
isSupported().then(yes => {
  if (yes && firebaseConfig.measurementId) {
    getAnalytics(app);
  }
});

// Connectivity Test
async function testConnection() {
  try {
    // Only test if not on default collection to avoid pollution
    await getDocFromServer(doc(db, 'system', 'ping'));
  } catch (error) {
    console.warn("Firestore connection check:", error);
  }
}
testConnection();
