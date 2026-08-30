// api/upgrade.js
// Manually applies a defense-level upgrade. The level only rises when the
// owner clicks the button — never automatically — but the server still
// enforces that enough time has passed to be ELIGIBLE for the next level.

import { Redis } from '@upstash/redis';
import { BODY_IDS, isEligibleForUpgrade } from './_constants.js';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bodyId, ownerToken } = req.body || {};

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

    if (!isEligibleForUpgrade(claim, bodyId)) {
      return res.status(400).json({ error: 'No upgrade available yet — keep holding this world' });
    }

    claim.level = (claim.level || 1) + 1;
    claim.lastLevelUpTs = Date.now();
    await redis.set('world', world);

    return res.status(200).json({ ok: true, level: claim.level });
  } catch (err) {
    console.error('upgrade error:', err);
    return res.status(500).json({ error: 'Could not upgrade defense' });
  }
}
