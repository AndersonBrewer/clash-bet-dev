import { getUserFromToken } from '../supabaseClient.js';

// Attach this to any route that requires a logged-in user.
// The app sends the Supabase session token in the Authorization header:
//   Authorization: Bearer <access_token>
export async function requireAuth(req, res, next) {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.user = user; // now available in every route handler as req.user.id
  next();
}
