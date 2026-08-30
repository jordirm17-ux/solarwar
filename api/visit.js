// api/visit.js
// Increments and returns the global visitor counter.

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const count = await redis.incr('visitors');
    return res.status(200).json({ count });
  } catch (err) {
    console.error('visit error:', err);
    return res.status(200).json({ count: 0 });
  }
}
