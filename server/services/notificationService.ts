import { query, queryOne, run } from '../db/database';

export interface NotificationRecord {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  is_read: number;
  created_at: string;
}

export function createNotification(params: {
  userId: number;
  title: string;
  message: string;
  type: string;
  link?: string;
}): void {
  const now = new Date().toISOString();
  run(
    `INSERT INTO notifications (user_id, title, message, type, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [params.userId, params.title, params.message, params.type, params.link || null, now]
  );
}

export function getUserNotifications(userId: number, limit = 50): NotificationRecord[] {
  return query<NotificationRecord>(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    [userId, limit]
  );
}

export function getUnreadNotificationCount(userId: number): number {
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
    [userId]
  );
  return row?.count || 0;
}

export function markNotificationRead(id: number, userId: number): void {
  run(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
}

export function markAllNotificationsRead(userId: number): void {
  run(
    `UPDATE notifications SET is_read = 1 WHERE user_id = ?`,
    [userId]
  );
}
