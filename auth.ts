import { auth, db } from './firebase';
import { 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export const isAdmin = async (user: FirebaseUser | null) => {
  if (!user) return false;
  
  const adminEmails = [
    'princedagogoekine@gmail.com', 
    'princegogoekine@gmail.com',
    'dagogoekineprince@gmail.com',
    'soberetamunoala@gmail.com'
  ];
  
  if (adminEmails.includes(user.email || '')) {
    console.log(`[isAdmin] Authorized by email: ${user.email}`);
    return true;
  }
  
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      const role = data.role;
      console.log(`[isAdmin] User doc found. Role: ${role}`);
      return role === 'Admin' || role === 'CEO' || role === 'Assistant CEO' || role === 'Ass CEO';
    }
    console.log(`[isAdmin] No user doc found for UID: ${user.uid}`);
    return false;
  } catch (err) {
    console.error("Error checking admin status:", err);
    return false;
  }
};

export const checkSession = (requiredRole: 'admin' | null = null): Promise<FirebaseUser | null> => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) {
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
          window.location.href = '/';
        }
        resolve(null);
        return;
      }

      const isUserAdmin = await isAdmin(user);
      if (requiredRole === 'admin' && !isUserAdmin) {
        // Redirection logic should be handled by the caller or specialized here
        // resolve(user);
      }
      resolve(user);
    });
  });
};

export const logout = async () => {
  try {
    localStorage.removeItem('isAdminSession');
    document.body.classList.remove('is-logged-in');
    document.body.classList.remove('is-admin');
    document.body.classList.remove('is-hr');
    document.body.classList.remove('is-staff');
    
    await signOut(auth);
    window.location.replace('/'); 
  } catch (error) {
    console.error("Error signing out:", error);
    window.location.replace('/');
  }
};
