// api/heartbeat.js
// Real "who's online now" counter. Each browser tab calls this every ~20s
// while open. Each call refreshes a short-lived key for that visitor and
// returns how many such keys currently exist — since keys expire on their
// own if a tab stops calling (closed, lost connection, etc.), the count is
// always a live snapshot, not an all-time total.

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const PRESENCE_TTL_S = 45; // must be well above the client's heartbeat interval

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playerToken } = req.body || {};
  if (!playerToken || typeof playerToken !== 'string') {
    return res.status(400).json({ error: 'Missing player token' });
  }

  try {
    await redis.set(`online:${playerToken}`, '1', { ex: PRESENCE_TTL_S });

    let cursor = 0;
    let online = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: 'online:*', count: 200 });
      online += keys.length;
      cursor = Number(nextCursor);
    } while (cursor !== 0);

    return res.status(200).json({ online });
  } catch (err) {
    console.error('heartbeat error:', err);
    return res.status(200).json({ online: 0 });
  }
}
