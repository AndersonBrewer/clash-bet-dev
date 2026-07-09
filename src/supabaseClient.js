import { createClient } from '@supabase/supabase-js';

// Service-role client: bypasses row-level security. Use this ONLY on the
// backend, for operations the server itself needs to do (resolving a Clash,
// updating trophies for both players, etc.) - never expose this key to the app.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verifies the JWT the app sends with each request (from the user's Supabase
// Auth session) and returns the authenticated user, or null if invalid.
export async function getUserFromToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user;
}
