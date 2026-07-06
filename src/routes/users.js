import express from 'express';
import { supabaseAdmin } from '../supabaseClient.js';
import { requireAuth } from './authMiddleware.js';

export const usersRouter = express.Router();

// Called once, right after a user signs up via Supabase Auth on the frontend,
// to create their row in `profiles` (username, starting ELO, etc.)
usersRouter.post('/profile', requireAuth, async (req, res) => {
  const { username, avatarColor } = req.body;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert({ id: req.user.id, username, avatar_color: avatarColor || '#4a7bf0', elo: 1000 })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Look up other users by username, to find someone to add as a friend
// without already knowing their internal id.
usersRouter.get('/search', requireAuth, async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username query param required' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username, avatar_color, elo')
    .ilike('username', `%${username}%`)
    .neq('id', req.user.id)
    .limit(10);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

usersRouter.get('/profile/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username, elo, avatar_color, created_at')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Profile not found' });
  res.json(data);
});

// --- Friends ---

usersRouter.get('/friends', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('id, status, requester_id, recipient_id, requester:requester_id(username, elo, avatar_color), recipient:recipient_id(username, elo, avatar_color)')
    .or(`requester_id.eq.${req.user.id},recipient_id.eq.${req.user.id}`)
    .eq('status', 'accepted');

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

usersRouter.get('/friends/pending', requireAuth, async (req, res) => {
  // Incoming requests only - people who sent YOU a request, awaiting your response
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('id, requester:requester_id(id, username, avatar_color)')
    .eq('recipient_id', req.user.id)
    .eq('status', 'pending');

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

usersRouter.post('/friends/request', requireAuth, async (req, res) => {
  const { recipientId } = req.body;
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .insert({ requester_id: req.user.id, recipient_id: recipientId, status: 'pending' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

usersRouter.post('/friends/:id/respond', requireAuth, async (req, res) => {
  const { accept } = req.body; // true or false
  if (!accept) {
    const { error } = await supabaseAdmin.from('friendships').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ declined: true });
  }
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', req.params.id)
    .eq('recipient_id', req.user.id) // only the recipient can accept
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
