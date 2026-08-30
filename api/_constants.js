// api/_constants.js
// Shared game rules, mirrored from the client so the server never trusts
// timing or grid-size values sent by the browser.

export const GRACE_MS = 2 * 3600000;                  // 2h immunity after claim/conquest
export const ATTACK_COOLDOWN_MS = 2 * 3600000;         // 2h between attacks, per player, global
export const REPOSITION_COOLDOWN_L5_MS = 24 * 3600000; // level 5: reposition once per 24h

// Second layer on top of the per-device cooldown above. Same strictness as
// the device cooldown (1 attack / 2h) — the tradeoff is that two unrelated
// people sharing a network (café, office, campus wifi) could block each
// other. Chosen deliberately for an audience of independent players rather
// than households/couples sharing wifi; revisit if that assumption is wrong.
export const IP_ATTACK_LIMIT = 1;
export const IP_ATTACK_WINDOW_MS = ATTACK_COOLDOWN_MS; // 2h, same as device cooldown

// Hours required for EACH step up, counted from the last time the level
// changed (not from the original claim). index 0 = 1→2, index 1 = 2→3, etc.
// Levels never skip — one click only ever moves the level up by exactly 1.
export const LEVEL_INTERVALS_H = [2, 6, 12, 24];

export const BODY_IDS = [
  'sol', 'mercury', 'venus', 'earth', 'moon', 'mars', 'asteroids',
  'jupiter', 'europa', 'saturn', 'titan', 'uranus', 'neptune', 'pluto',
];

// Max achievable defense level differs by body — bigger/more significant
// worlds can be fortified further than a small moon or a scattered belt.
export const MAX_LEVEL_BY_BODY = {
  moon: 2, europa: 2, titan: 2, asteroids: 2,
  mercury: 3, venus: 3, mars: 3, pluto: 3,
  earth: 4, saturn: 4, uranus: 4, neptune: 4,
  jupiter: 5, sol: 5,
};
export function maxLevelForBody(bodyId) {
  return MAX_LEVEL_BY_BODY[bodyId] || 5;
}

// Vercel populates x-forwarded-for with the real client IP (comma-separated
// if there were proxies in between — the first entry is the original client).
export function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Is this claim eligible to go up exactly one level right now?
export function isEligibleForUpgrade(claim, bodyId) {
  const level = claim.level || 1;
  const max = maxLevelForBody(bodyId);
  if (level >= max) return false;
  const requiredMs = LEVEL_INTERVALS_H[level - 1] * 3600000;
  const since = Date.now() - (claim.lastLevelUpTs || claim.claimedAt);
  return since >= requiredMs;
}

export function isImmune(claim) {
  return !!(claim && claim.immuneUntil && claim.immuneUntil > Date.now());
}

// Strip the secret weak-point fields before anything public-facing sees a claim.
export function publicClaim(claim) {
  if (!claim) return claim;
  const { weakRow, weakCol, ownerToken, ...safe } = claim;
  return safe;
}
