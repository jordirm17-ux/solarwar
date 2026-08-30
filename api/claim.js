// api/claim.js
// Claims an unowned body for free. The chosen weak point is stored server-side
// only — the response never echoes it back except as confirmation of success.

import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import { GRACE_MS, BODY_IDS } from './_constants.js';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bodyId, bodyName, name, link, weakRow, weakCol } = req.body || {};

  if (!bodyId || !BODY_IDS.includes(bodyId)) {
    return res.status(400).json({ error: 'Invalid body' });
  }
  if (!name || typeof name !== 'string' || !name.trim() || name.length > 40) {
    return res.status(400).json({ error: 'Invalid name' });
  }
  const row = Number.isInteger(weakRow) ? weakRow : -1;
  const col = Number.isInteger(weakCol) ? weakCol : -1;
  if (row !== 0 || col < 0 || col > 4) {
    // A fresh claim always starts at defense level 1 → exactly 1 row (row 0), 5 columns.
    return res.status(400).json({ error: 'Invalid weak point for a new claim' });
  }

  try {
    const world = (await redis.get('world')) || {};

    if (world[bodyId]) {
      return res.status(409).json({ error: 'Someone just claimed this — try attacking instead' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const now = Date.now();

    world[bodyId] = {
      owner: name.trim(),
      link: (link || '').trim().slice(0, 200),
      ownerToken: token,
      claimedAt: now,
      immuneUntil: now + GRACE_MS,
      level: 1,
      lastLevelUpTs: now,
      weakRow: row,
      weakCol: col,
      lastRepositionTs: now,
      attacksReceived: 0,
      attacksSurvived: 0,
    };
    await redis.set('world', world);

    const history = (await redis.get('history')) || [];
    history.unshift({ type: 'claim', owner: name.trim(), link: link || '', body: (bodyName || bodyId), ts: now });
    await redis.set('history', history.slice(0, 200));

    return res.status(200).json({ ok: true, ownerToken: token });
  } catch (err) {
    console.error('claim error:', err);
    return res.status(500).json({ error: 'Could not save claim' });
  }
}
