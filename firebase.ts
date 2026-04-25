import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const dbId = firebaseConfig.firestoreDatabaseId || undefined;
console.log(`[Firebase] Initializing with DB ID: ${dbId || 'default'}`);

let db;
try {
  db = getFirestore(app, dbId);
} catch (err) {
  console.error("[Firebase] Fatal error initializing Firestore:", err);
  // Fallback to default if specifically configured one fails
  db = getFirestore(app);
}

export { db };
export const auth = getAuth(app);
export const storage = getStorage(app);

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
