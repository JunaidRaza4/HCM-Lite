import { Router, Response } from 'express';
import { query } from '../db/database';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';

export const auditRouter = Router();

// Get audit logs (Admin and HR only)
auditRouter.get('/', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const entity = req.query.entity as string;
    const action = req.query.action as string;

    let sql = `SELECT * FROM audit_logs WHERE 1=1`;
    const params: any[] = [];

    if (entity) {
      sql += ` AND entity = ?`;
      params.push(entity);
    }

    if (action) {
      sql += ` AND action = ?`;
      params.push(action);
    }

    sql += ` ORDER BY id DESC LIMIT ?`;
    params.push(limit);

    const logs = query(sql, params);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
