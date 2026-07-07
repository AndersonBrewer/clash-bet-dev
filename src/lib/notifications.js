import { supabaseAdmin } from '../supabaseClient.js';

export async function createNotification({ userId, type, title, body, relatedId }) {
  // 'welcome' is a one-time onboarding message, not something users can mute -
  // every other type is gated on that user's saved preference (default true
  // for anyone who hasn't touched Settings, via the column's DB default).
  if (type !== 'welcome') {
    const { data: profile } = await supabaseAdmin.from('profiles').select('notification_prefs').eq('id', userId).single();
    if (profile?.notification_prefs?.[type] === false) return;
  }

  const { error } = await supabaseAdmin.from('notifications').insert({
    user_id: userId, type, title, body: body || null, related_id: relatedId || null,
  });
  if (error) console.error('createNotification failed:', error.message);
}

export const WELCOME_NOTIFICATION = {
  title: 'Welcome to Clash Bet!',
  body: "Pick a game, then build a 4-leg ticket: choose a player, a stat, a tier (Grey to Gold — riskier tiers pay more), and Over or Under. Challenge a friend or play online. Whoever's picks score more points wins ELO. Good luck!",
};
