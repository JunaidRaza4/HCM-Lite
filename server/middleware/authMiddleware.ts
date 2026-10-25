import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../services/authService';
import { queryOne } from '../db/database';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload & { status?: string };
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. No token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    return;
  }

  // Verify that the user still exists and is active in database
  const user = queryOne<{ id: number; status: string; must_change_password: number; role: string; employee_id: number }>(
    `SELECT id, status, must_change_password, role, employee_id FROM users WHERE id = ?`,
    [payload.id]
  );

  if (!user || user.status !== 'active') {
    res.status(401).json({ error: 'User account is inactive or disabled.' });
    return;
  }

  req.user = {
    ...payload,
    role: user.role as 'admin' | 'hr' | 'employee',
    employeeId: user.employee_id,
    mustChangePassword: user.must_change_password,
  };

  next();
}

/**
 * Middleware ensuring user has one of the allowed roles
 */
export function requireRole(...allowedRoles: Array<'admin' | 'hr' | 'employee'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Forbidden: role '${req.user.role}' is not authorized to access this resource. Required: ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Helper to enforce data scope:
 * If user is an Employee, they can only access their own employee ID.
 * Admins and HR have company-wide access.
 */
export function checkEmployeeDataScope(req: AuthenticatedRequest, targetEmployeeId: number): boolean {
  if (!req.user) return false;
  if (req.user.role === 'admin' || req.user.role === 'hr') {
    return true; // Admin and HR can access any employee record
  }
  if (req.user.role === 'employee') {
    return Number(req.user.employeeId) === Number(targetEmployeeId);
  }
  return false;
}
