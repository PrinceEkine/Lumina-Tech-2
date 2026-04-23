import { supabase } from './supabase';

export const isAdmin = async (user) => {
  if (!user) return false;
  
  // Hardcoded admins for initial setup
  const adminEmails = [
    'princedagogoekine@gmail.com', 
    'princegogoekine@gmail.com',
    'dagogoekineprince@gmail.com',
    'soberetamunoala@gmail.com'
  ];
  
  if (adminEmails.includes(user.email)) return true;
  
  // Check staff table for Admin role
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('role')
      .eq('email', user.email)
      .single();
      
    if (error) return false;
    return data && data.role === 'Admin';
  } catch (err) {
    return false;
  }
};

export const checkSession = async (requiredRole = null) => {
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
      window.location.href = '/';
    }
    return null;
  }

  const user = session.user;
  const isUserAdmin = await isAdmin(user);
  
  if (requiredRole === 'admin' && !isUserAdmin) {
    window.location.href = '/admin.html'; // Both roles now use admin.html with visibility classes
    return null;
  }

  return user;
};

export const logout = async () => {
  try {
    console.log("Attempting sign out...");
    
    // Clear local state immediately for perceived speed
    localStorage.removeItem('isAdminSession');
    document.body.classList.remove('is-logged-in');
    document.body.classList.remove('is-admin');
    
    // Wait for sign out to complete
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    console.log("Sign out successful, redirecting...");
    
    // Redirect after successful sign out
    window.location.replace('/'); 
  } catch (error) {
    console.error("Error signing out:", error);
    // Force redirect anyway as a fallback
    window.location.replace('/');
  }
};
