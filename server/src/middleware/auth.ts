import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/firebaseAdmin.js';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
  }

  if (!token) {
    res.status(401).json({ error: 'Missing or invalid authorization token' });
    return;
  }

  
  try {
    const decodedToken = await auth.verifyIdToken(token);
    // Attach user to request
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};
