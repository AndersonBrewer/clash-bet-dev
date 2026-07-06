import { supabaseAdmin } from '../supabaseClient.js';

export async function createNotification({ userId, type, title, body, relatedId }) {
  const { error } = await supabaseAdmin.from('notifications').insert({
    user_id: userId, type, title, body: body || null, related_id: relatedId || null,
  });
  if (error) console.error('createNotification failed:', error.message);
}

export const WELCOME_NOTIFICATION = {
  title: 'Welcome to Clash Bet!',
  body: "Pick a game, then build a 4-leg ticket: choose a player, a stat, a tier (Grey to Gold — riskier tiers pay more), and Over or Under. Challenge a friend or play online. Whoever's picks score more points wins ELO. Good luck!",
};
