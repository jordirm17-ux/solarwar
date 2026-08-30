// api/reposition.js
// Moves an existing claim's hidden weak point. Ownership is proven by the
// bearer token issued at claim time — never trust a bodyId/owner pair alone.

import { Redis } from '@upstash/redis';
import {
  REPOSITION_COOLDOWN_L5_MS,
  BODY_IDS,
  maxLevelForBody,
} from './_constants.js';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bodyId, bodyName, ownerToken, weakRow, weakCol } = req.body || {};

  if (!bodyId || !BODY_IDS.includes(bodyId)) {
    return res.status(400).json({ error: 'Invalid body' });
  }
  if (!ownerToken || typeof ownerToken !== 'string') {
    return res.status(401).json({ error: 'Missing owner token' });
  }

  try {
    const world = (await redis.get('world')) || {};
    const claim = world[bodyId];

    if (!claim) {
      return res.status(404).json({ error: 'This body has not been claimed' });
    }
    if (claim.ownerToken !== ownerToken) {
      return res.status(403).json({ error: 'You do not hold this body' });
    }

    const level = claim.level || 1;
    const row = Number.isInteger(weakRow) ? weakRow : -1;
    const col = Number.isInteger(weakCol) ? weakCol : -1;
    if (row < 0 || row >= level || col < 0 || col > 4) {
      return res.status(400).json({ error: 'Weak point is outside the current board size' });
    }

    if (level >= maxLevelForBody(bodyId)) {
      const sinceReposition = Date.now() - claim.lastRepositionTs;
      if (sinceReposition < REPOSITION_COOLDOWN_L5_MS) {
        return res.status(429).json({
          error: 'At max level you can only reposition once every 24h',
          retryAfterMs: REPOSITION_COOLDOWN_L5_MS - sinceReposition,
        });
      }
    }

    const now = Date.now();
    claim.weakRow = row;
    claim.weakCol = col;
    claim.lastRepositionTs = now;
    await redis.set('world', world);

    const history = (await redis.get('history')) || [];
    history.unshift({ type: 'reposition', owner: claim.owner, link: claim.link, body: (bodyName || bodyId), ts: now });
    await redis.set('history', history.slice(0, 200));

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('reposition error:', err);
    return res.status(500).json({ error: 'Could not save new position' });
  }
}
