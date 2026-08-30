// api/world.js
// Returns the current state of every claimed body. Weak-point coordinates
// are stripped from the response UNLESS the caller proves ownership by
// supplying a token that matches that specific claim's stored ownerToken —
// so nobody can read anyone else's hiding spot from the network tab.

import { Redis } from '@upstash/redis';
import { publicClaim } from './_constants.js';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { myTokens } = req.body || {};

  try {
    const world = (await redis.get('world')) || {};
    const history = (await redis.get('history')) || [];
    const visitors = (await redis.get('visitors')) || 0;
    const clicks = (await redis.get('clicks')) || 0;

    const claims = {};
    for (const [bodyId, claim] of Object.entries(world)) {
      const supplied = myTokens && myTokens[bodyId];
      if (supplied && claim.ownerToken && supplied === claim.ownerToken) {
        // Verified owner — include the real weak point so their own UI can show it.
        const { ownerToken, ...withSecret } = claim;
        claims[bodyId] = withSecret;
      } else {
        claims[bodyId] = publicClaim(claim);
      }
    }

    return res.status(200).json({ claims, history: history.slice(0, 60), visitors, clicks });
  } catch (err) {
    console.error('world fetch error:', err);
    return res.status(500).json({ error: 'Could not load world state' });
  }
}
