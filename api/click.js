// api/click.js
// Increments and returns the global outbound-link click counter.
// Tracked globally, not per-body — simple and cheap on Upstash's command quota.

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const count = await redis.incr('clicks');
    return res.status(200).json({ count });
  } catch (err) {
    console.error('click error:', err);
    return res.status(200).json({ count: 0 });
  }
}
