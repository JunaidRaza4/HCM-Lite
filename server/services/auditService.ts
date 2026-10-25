import { query, run } from '../db/database';

export interface AuditLogEntry {
  id?: number;
  actor_id?: number | null;
  actor_name?: string | null;
  actor_role?: string | null;
  action: string;
  entity: string;
  entity_id?: string | number | null;
  details?: Record<string, any> | string | null;
  ip_address?: string | null;
  created_at?: string;
}

export function logAudit(entry: {
  actorId?: number | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  details?: Record<string, any> | string | null;
  ipAddress?: string | null;
}): void {
  try {
    const detailsStr = entry.details
      ? typeof entry.details === 'string'
        ? entry.details
        : JSON.stringify(entry.details)
      : null;

    run(
      `INSERT INTO audit_logs (actor_id, actor_name, actor_role, action, entity, entity_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.actorId ?? null,
        entry.actorName ?? 'System',
        entry.actorRole ?? 'system',
        entry.action,
        entry.entity,
        entry.entityId ? String(entry.entityId) : null,
        detailsStr,
        entry.ipAddress ?? '127.0.0.1',
        new Date().toISOString(),
      ]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

export function getAuditLogs(limit: number = 100, entity?: string): AuditLogEntry[] {
  if (entity) {
    return query<AuditLogEntry>(
      `SELECT * FROM audit_logs WHERE entity = ? ORDER BY id DESC LIMIT ?`,
      [entity, limit]
    );
  }
  return query<AuditLogEntry>(
    `SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?`,
    [limit]
  );
}
