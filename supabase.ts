import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const getValidUrl = (url: string | undefined): string => {
  if (!url || typeof url !== 'string') {
    console.error('CRITICAL: Supabase URL is missing. Please set VITE_SUPABASE_URL in your environment variables.');
    return 'https://placeholder-project.supabase.co';
  }
  
  if (!url.startsWith('http')) {
    return `https://${url}`;
  }
  
  return url;
};

const getValidKey = (key: string | undefined): string => {
  if (!key || typeof key !== 'string') {
    console.error('CRITICAL: Supabase Anon Key is missing. Please set VITE_SUPABASE_ANON_KEY in your environment variables.');
    return 'placeholder-anon-key';
  }
  return key;
};

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables or create a .env file.');
}

// Use a try-catch block to prevent the entire app from crashing if createClient fails
let supabaseInstance;
try {
  supabaseInstance = createClient(
    getValidUrl(supabaseUrl),
    getValidKey(supabaseAnonKey)
  );
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
  // Fallback to a dummy client if initialization fails completely
  supabaseInstance = createClient(
    'https://placeholder-project.supabase.co',
    'placeholder-anon-key'
  );
}

export const supabase = supabaseInstance;
