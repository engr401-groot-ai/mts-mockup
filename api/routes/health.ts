/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import { pythonHealth } from '../services/pythonProxy';
import type { Request, Response } from 'express';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const python = await pythonHealth();
    res.json({ status: 'healthy', node: { status: 'running' }, python });
  } catch (error: any) {
    res.status(503).json({ status: 'degraded', node: { status: 'running' }, python: { status: 'unreachable', error: error.message || 'Unknown' } });
  }
});

export default router;
