import express from 'express';
import { supabaseAdmin } from '../supabaseClient.js';
import { requireAuth } from './authMiddleware.js';
import { ALLOWED_SPORTS } from '../lib/sports.js';
import { createNotification, WELCOME_NOTIFICATION } from '../lib/notifications.js';
import { rankForTrophies } from '../lib/ranks.js';

export const usersRouter = express.Router();

// Called once, right after a user signs up via Supabase Auth on the frontend,
// to create their row in `profiles` (username, starting trophies, etc.)
usersRouter.post('/profile', requireAuth, async (req, res) => {
  const { username, avatarColor } = req.body;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert({ id: req.user.id, username, avatar_color: avatarColor || '#4a7bf0', trophies: 0 })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await createNotification({ userId: data.id, type: 'welcome', ...WELCOME_NOTIFICATION });

  res.json(data);
});

// Muteable notification types - 'welcome' isn't here since it's a one-time
// onboarding message, not an ongoing preference.
const MUTEABLE_NOTIFICATION_TYPES = ['friend_request', 'clash_challenge', 'clash_ended'];

// Settings screen: update username, avatar color, and/or notification
// preferences for the logged-in user. Every field is optional so the
// frontend can send just what changed (e.g. only notificationPrefs when
// toggling a switch, without resending username).
usersRouter.patch('/profile', requireAuth, async (req, res) => {
  const { username, avatarColor, notificationPrefs } = req.body;
  const updates = {};
  if (username !== undefined) updates.username = username;
  if (avatarColor !== undefined) updates.avatar_color = avatarColor;
  if (notificationPrefs !== undefined) {
    const invalidKey = Object.keys(notificationPrefs).find(k => !MUTEABLE_NOTIFICATION_TYPES.includes(k));
    if (invalidKey) return res.status(400).json({ error: `Unknown notification type: ${invalidKey}` });
    updates.notification_prefs = notificationPrefs;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// --- Notifications ---

usersRouter.get('/notifications', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

usersRouter.delete('/notifications/:id', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('notifications')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id); // can only dismiss your own

  if (error) return res.status(400).json({ error: error.message });
  res.json({ dismissed: true });
});

// Look up other users by username, to find someone to add as a friend
// without already knowing their internal id.
usersRouter.get('/search', requireAuth, async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username query param required' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username, avatar_color, trophies')
    .ilike('username', `%${username}%`)
    .neq('id', req.user.id)
    .limit(10);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Global ranking across every user, not just friends - any logged-in user
// can see it, matching the profiles table's own "viewable by everyone" RLS policy.
usersRouter.get('/leaderboard', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username, trophies, avatar_color')
    .order('trophies', { ascending: false })
    .limit(100);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data.map(p => ({ ...p, rank: rankForTrophies(p.trophies).key })));
});

// Win % per sport, computed from this user's resolved Clashes - powers the
// Profile tab's stat boxes (both your own and a friend's read-only view).
usersRouter.get('/:id/stats', requireAuth, async (req, res) => {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, trophies, avatar_color')
    .eq('id', req.params.id)
    .single();
  if (profileError) return res.status(404).json({ error: 'Profile not found' });

  const { data: clashes, error: clashesError } = await supabaseAdmin
    .from('clashes')
    .select('sport, status, user_a_id, user_b_id')
    .or(`user_a_id.eq.${req.params.id},user_b_id.eq.${req.params.id}`)
    .in('status', ['won_a', 'won_b', 'tied']);
  if (clashesError) return res.status(400).json({ error: clashesError.message });

  const stats = {};
  for (const sport of ALLOWED_SPORTS) {
    const sportClashes = clashes.filter(c => c.sport === sport);
    const wins = sportClashes.filter(c =>
      (c.status === 'won_a' && c.user_a_id === req.params.id) ||
      (c.status === 'won_b' && c.user_b_id === req.params.id)
    ).length;
    const total = sportClashes.length;
    stats[sport] = { wins, total, winPct: total > 0 ? Math.round((wins / total) * 100) : null };
  }

  res.json({
    id: profile.id, username: profile.username, trophies: profile.trophies,
    rank: rankForTrophies(profile.trophies).key, avatarColor: profile.avatar_color, stats,
  });
});

usersRouter.get('/profile/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username, trophies, avatar_color, created_at, notification_prefs')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Profile not found' });
  res.json({ ...data, rank: rankForTrophies(data.trophies).key });
});

// --- Friends ---

usersRouter.get('/friends', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('id, status, requester_id, recipient_id, requester:requester_id(username, trophies, avatar_color), recipient:recipient_id(username, trophies, avatar_color)')
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

  // The table's own unique constraint only blocks the exact same direction
  // twice - it doesn't stop the reverse direction, so without this check
  // two people who'd each already sent the other a request (or who are
  // already friends) could each insert their own row, leaving two
  // friendships rows for the same pair and showing that person twice on
  // the Friends list.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('friendships')
    .select('id, requester_id, status')
    .or(`and(requester_id.eq.${req.user.id},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${req.user.id})`)
    .maybeSingle();
  if (existingError) return res.status(400).json({ error: existingError.message });
  if (existing) {
    if (existing.status === 'accepted') return res.status(400).json({ error: 'You are already friends with this person' });
    return res.status(400).json({ error: existing.requester_id === req.user.id
      ? 'You already sent this person a friend request'
      : 'This person already sent you a friend request - check your notifications' });
  }

  const { data, error } = await supabaseAdmin
    .from('friendships')
    .insert({ requester_id: req.user.id, recipient_id: recipientId, status: 'pending' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  const { data: requesterProfile } = await supabaseAdmin.from('profiles').select('username').eq('id', req.user.id).single();
  await createNotification({
    userId: recipientId,
    type: 'friend_request',
    title: 'New Friend Request',
    body: `${requesterProfile?.username || 'Someone'} sent you a friend request`,
    relatedId: data.id,
  });

  res.json(data);
});

usersRouter.post('/friends/:id/respond', requireAuth, async (req, res) => {
  const { accept } = req.body; // true or false

  // related_id isn't a real foreign key (it points at either a friendship or
  // a clash depending on type), so it doesn't cascade-delete on its own.
  await supabaseAdmin.from('notifications').delete().eq('related_id', req.params.id).eq('type', 'friend_request');

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
