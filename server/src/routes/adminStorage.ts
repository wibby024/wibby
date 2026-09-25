import { Router, Request, Response } from 'express';
import { getStorageAudit, runSafeTemporaryCleanup } from '../services/storageMonitor.js';

const router = Router();

// GET storage status and audit breakdown
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const audit = await getStorageAudit();
    res.json(audit);
  } catch (error) {
    console.error('Storage audit error:', error);
    res.status(500).json({ error: 'Failed to retrieve storage audit' });
  }
});

// POST trigger safe temporary data cleanup
// NOTE: Deletes ONLY expired pairing codes and expired stories/orphaned chunks. NEVER touches permanent user data.
router.post('/cleanup-temporary', async (_req: Request, res: Response) => {
  try {
    const result = await runSafeTemporaryCleanup();
    res.json({
      success: true,
      message: 'Safe temporary cleanup completed',
      result
    });
  } catch (error) {
    console.error('Safe temporary cleanup error:', error);
    res.status(500).json({ error: 'Failed to run temporary cleanup' });
  }
});

export default router;
