import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDb } from './server/db/database';
import { setupRouter } from './server/routes/setupRoutes';
import { authRouter } from './server/routes/authRoutes';
import { companyRouter } from './server/routes/companyRoutes';
import { employeeRouter } from './server/routes/employeeRoutes';
import { leaveRouter } from './server/routes/leaveRoutes';
import { auditRouter } from './server/routes/auditRoutes';
import { attendanceRouter } from './server/routes/attendanceRoutes';
import { payrollRouter } from './server/routes/payrollRoutes';
import { analyticsRouter } from './server/routes/analyticsRoutes';
import { commsRouter } from './server/routes/commsRoutes';
import { aiRouter } from './server/routes/aiRoutes';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Initialize SQLite Database
  await getDb();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // API Routes
  app.use('/api/setup', setupRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', companyRouter);
  app.use('/api/employees', employeeRouter);
  app.use('/api/leaves', leaveRouter);
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/payroll', payrollRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api', commsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/ai', aiRouter); // Directly support POST /ai/chat

  // Serve face-api AI vision models statically
  app.use('/models', express.static(path.join(__dirname, 'public/models')));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HCM Lite running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
