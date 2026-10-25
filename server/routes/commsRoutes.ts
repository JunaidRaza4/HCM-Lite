import { Router, Response } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';
import { query, queryOne, run } from '../db/database';
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notificationService';
import { logAudit } from '../services/auditService';

export const commsRouter = Router();

// ================= ANNOUNCEMENTS =================

// 1. Get recent announcements (All authenticated users)
commsRouter.get('/announcements', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = query<any>(`
      SELECT * FROM announcements ORDER BY id DESC LIMIT 20
    `);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Post new announcement (Admin and HR only)
commsRouter.post('/announcements', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, body } = req.body;
    if (!title || !title.trim() || !body || !body.trim()) {
      res.status(400).json({ error: 'Announcement title and body are required.' });
      return;
    }

    const now = new Date().toISOString();
    const result = run(
      `INSERT INTO announcements (title, body, author_id, author_name, author_role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title.trim(), body.trim(), req.user!.id, req.user!.name, req.user!.role, now]
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'ANNOUNCEMENT_POSTED',
      entity: 'announcement',
      entityId: result.lastInsertRowid,
      details: { title: title.trim() },
      ipAddress: req.ip,
    });

    const created = queryOne<any>('SELECT * FROM announcements WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Delete announcement (Admin and HR)
commsRouter.delete('/announcements/:id', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    run('DELETE FROM announcements WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================= IN-APP NOTIFICATIONS =================

// 1. Get user notifications
commsRouter.get('/notifications', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = getUserNotifications(req.user!.id);
    const unreadCount = getUnreadNotificationCount(req.user!.id);
    res.json({ notifications: list, unreadCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get unread count
commsRouter.get('/notifications/unread-count', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const count = getUnreadNotificationCount(req.user!.id);
    res.json({ unreadCount: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Mark single notification as read
commsRouter.put('/notifications/:id/read', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    markNotificationRead(id, req.user!.id);
    const unreadCount = getUnreadNotificationCount(req.user!.id);
    res.json({ success: true, unreadCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Mark all notifications as read
commsRouter.put('/notifications/read-all', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    markAllNotificationsRead(req.user!.id);
    res.json({ success: true, unreadCount: 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
