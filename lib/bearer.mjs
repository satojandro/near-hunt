import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Whether an `Authorization` header carries `Bearer <secret>`, compared in constant time.
 *
 * A plain `===` stops at the first differing byte, so how long a wrong guess takes says how much of
 * it was right. Both sides are hashed first so they always have the same length, which is what
 * `timingSafeEqual` needs, and the secret's length is not revealed either.
 *
 * @param {string | null | undefined} header the request's Authorization header
 * @param {string | null | undefined} secret the expected secret; an empty or missing one never matches
 * @returns {boolean}
 */
export function bearerMatches(header, secret) {
  if (typeof secret !== 'string' || secret === '') return false;
  if (typeof header !== 'string') return false;
  const digest = (value) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
