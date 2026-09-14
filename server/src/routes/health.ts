import { Router, Request, Response } from 'express';
import { getDb } from '../lib/mongodb.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    // Quick ping to check MongoDB connection
    await db.command({ ping: 1 });
    
    res.json({
      status: 'ok',
      services: {
        api: 'ok',
        mongodb: 'ok'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      services: {
        api: 'ok',
        mongodb: 'error'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
