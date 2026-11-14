/**
 * Custom events for the aggregate, cookie-free page counter (@vercel? no — Umami Cloud; see
 * Analytics.tsx). Nothing here is required for the app to work: when no website id is configured
 * the Umami script is never loaded and every call is a no-op.
 *
 * Why these five and only these: chain already records votes and comments, so the numbers that
 * are missing are the denominator (visits) and the intent signals around it — did a visitor get a
 * wallet connected, and did they leave towards a repo or a demo. Keep the set small enough that
 * the dashboard stays readable during judging.
 */

export type AnalyticsEvent = 'wallet_connect' | 'vote' | 'unvote' | 'comment' | 'outbound_click' | 'donate' | 'stake';

type EventData = Record<string, string | number | boolean | null | undefined>;

/** The `window.umami` shape we rely on (the script's own global). */
type UmamiGlobal = { track: (event: string, data?: EventData) => void };

export function track(event: AnalyticsEvent, data?: EventData): void {
  if (typeof window === 'undefined') return;
  const umami = (window as unknown as { umami?: UmamiGlobal }).umami;
  if (!umami || typeof umami.track !== 'function') return;
  try {
    umami.track(event, data);
  } catch {
    // Analytics must never break a vote, a comment or a page.
  }
}
