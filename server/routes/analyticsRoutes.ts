import { Router, Response } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';
import { getHrAnalytics, getAdminAnalytics, getEmployeeAnalytics } from '../services/analyticsService';

export const analyticsRouter = Router();

// HR Dashboard Analytics
analyticsRouter.get('/hr', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const departmentId = req.query.department_id ? Number(req.query.department_id) : undefined;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    const data = getHrAnalytics({
      departmentId,
      startDate,
      endDate,
      companyId: req.user?.companyId || undefined,
    });

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Dashboard Analytics
analyticsRouter.get('/admin', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const departmentId = req.query.department_id ? Number(req.query.department_id) : undefined;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    const data = getAdminAnalytics({
      departmentId,
      startDate,
      endDate,
      companyId: req.user?.companyId || undefined,
    });

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Dashboard Analytics
analyticsRouter.get('/employee', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    let empId = user.employeeId;

    // Admin/HR can optionally pass employee_id in query parameter
    if (req.query.employee_id && (user.role === 'admin' || user.role === 'hr')) {
      empId = Number(req.query.employee_id);
    }

    if (!empId) {
      res.status(400).json({ error: 'No employee record associated with this account.' });
      return;
    }

    const data = getEmployeeAnalytics(empId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
