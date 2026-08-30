// api/attack.js
// The core of the anti-cheat design: the guessed cell is compared against
// the SECRET weak point stored server-side. The browser never receives
// enough information to know the answer in advance, and the per-player
// cooldown is enforced here — not trusted from the client's clock.

import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import {
  GRACE_MS,
  ATTACK_COOLDOWN_MS,
  IP_ATTACK_LIMIT,
  IP_ATTACK_WINDOW_MS,
  BODY_IDS,
  getClientIp,
  isImmune,
} from './_constants.js';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    bodyId, bodyName, playerToken,
    guessRow, guessCol,
    name, link,
  } = req.body || {};

  if (!bodyId || !BODY_IDS.includes(bodyId)) {
    return res.status(400).json({ error: 'Invalid body' });
  }
  if (!playerToken || typeof playerToken !== 'string') {
    return res.status(401).json({ error: 'Missing player token' });
  }
  if (!name || typeof name !== 'string' || !name.trim() || name.length > 40) {
    return res.status(400).json({ error: 'Enter a name before attacking' });
  }

  try {
    // --- layer 1: loose IP-wide burst limit (catches rapid incognito abuse,
    // generous enough that a household sharing wifi never notices it) ---
    const ip = getClientIp(req);
    const ipKey = `iprate:attack:${ip}`;
    const ipCount = await redis.incr(ipKey);
    if (ipCount === 1) {
      await redis.expire(ipKey, Math.ceil(IP_ATTACK_WINDOW_MS / 1000));
    }
    if (ipCount > IP_ATTACK_LIMIT) {
      return res.status(429).json({
        error: 'Too many attacks from this network recently — please wait a while and try again',
      });
    }

    // --- layer 2: strict per-device cooldown, server clock only ---
    const playerKey = `player:${playerToken}`;
    const playerState = (await redis.get(playerKey)) || {};
    const sinceAttack = Date.now() - (playerState.lastAttackTs || 0);
    if (playerState.lastAttackTs && sinceAttack < ATTACK_COOLDOWN_MS) {
      return res.status(429).json({
        error: 'You are still on cooldown',
        retryAfterMs: ATTACK_COOLDOWN_MS - sinceAttack,
      });
    }

    const world = (await redis.get('world')) || {};
    const claim = world[bodyId];

    if (!claim) {
      return res.status(404).json({ error: 'This body has not been claimed yet' });
    }
    if (isImmune(claim)) {
      return res.status(423).json({ error: 'This world is under grace protection' });
    }

    const level = claim.level || 1;
    const gRow = Number.isInteger(guessRow) ? guessRow : -1;
    const gCol = Number.isInteger(guessCol) ? guessCol : -1;
    if (gRow < 0 || gRow >= level || gCol < 0 || gCol > 4) {
      return res.status(400).json({ error: 'Guess is outside the current board size' });
    }

    // Attack always consumes the cooldown, hit or miss.
    await redis.set(playerKey, { lastAttackTs: Date.now() });

    const hit = gRow === claim.weakRow && gCol === claim.weakCol;
    const now = Date.now();
    const history = (await redis.get('history')) || [];

    if (hit) {
      // Provisional random weak point — the new owner picks their real hiding
      // spot right after via /api/reposition. Safe as a placeholder because
      // the fresh grace period blocks any attack until they do.
      const nRow = 0;
      const nCol = Math.floor(Math.random() * 5);

      const newToken = crypto.randomBytes(16).toString('hex');
      world[bodyId] = {
        owner: name.trim(),
        link: (link || '').trim().slice(0, 200),
        ownerToken: newToken,
        claimedAt: now,
        immuneUntil: now + GRACE_MS,
        level: 1,
        lastLevelUpTs: now,
        weakRow: nRow,
        weakCol: nCol,
        lastRepositionTs: now,
        attacksReceived: 0,
        attacksSurvived: 0,
      };
      await redis.set('world', world);

      history.unshift({ type: 'conquer', owner: name.trim(), link: link || '', from: claim.owner, body: (bodyName || bodyId), row: gRow, col: gCol, ts: now });
      await redis.set('history', history.slice(0, 200));

      return res.status(200).json({ hit: true, ownerToken: newToken });
    } else {
      claim.attacksReceived = (claim.attacksReceived || 0) + 1;
      claim.attacksSurvived = (claim.attacksSurvived || 0) + 1;
      await redis.set('world', world);

      history.unshift({ type: 'repel', owner: name.trim(), link: link || '', from: claim.owner, body: (bodyName || bodyId), row: gRow, col: gCol, ts: now });
      await redis.set('history', history.slice(0, 200));

      return res.status(200).json({ hit: false });
    }
  } catch (err) {
    console.error('attack error:', err);
    return res.status(500).json({ error: 'Attack transmission failed' });
  }
}
