import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse db.properties as a fallback for local development
function loadProperties() {
  try {
    const filePath = path.join(process.cwd(), 'db.properties');
    if (!fs.existsSync(filePath)) {
      return {}; // File doesn't exist (e.g., in Vercel production)
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const props: Record<string, string> = {};
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const idx = line.indexOf('=');
        if (idx > 0) {
          const key = line.substring(0, idx).trim();
          const value = line.substring(idx + 1).trim();
          props[key] = value;
        }
      }
    });
    return props;
  } catch (error) {
    console.warn("Could not read db.properties (this is normal in Vercel):", error);
    return {};
  }
}

const props = loadProperties();

// Prioritize process.env (Vercel) over local db.properties
const supabaseUrl = process.env.SUPABASE_URL || props['SUPABASE_URL'] || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || props['SUPABASE_ANON_KEY'] || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing SUPABASE_URL or SUPABASE_ANON_KEY. Please configure them in Vercel Environment Variables or db.properties.");
}

// Create a single supabase client for interacting with the database
// We strictly use the ANON KEY as requested by the user for security.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  }
});
