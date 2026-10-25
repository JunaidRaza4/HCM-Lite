import { Router, Response } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';
import { processAiChat, checkAiRateLimit } from '../services/aiService';
import { query } from '../db/database';

export const aiRouter = Router();

// POST /ai/chat or /api/ai/chat
aiRouter.post('/chat', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    // Rate limiting: ~20 requests per user per hour
    const rateCheck = checkAiRateLimit(user.id);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded: You can make up to 20 AI queries per hour. Please try again later.',
        remaining: 0,
      });
      return;
    }

    const result = await processAiChat(user, message.trim());
    res.json(result);
  } catch (err: any) {
    console.error('AI chat endpoint error:', err);
    res.status(500).json({
      reply: 'An unexpected error occurred while communicating with the AI Assistant.',
      isAiGenerated: true,
      smartLeaveForm: null,
    });
  }
});

// GET /api/ai/logs - Admin & HR can inspect AI queries and tool usage
aiRouter.get('/logs', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = query<any>('SELECT * FROM ai_logs ORDER BY id DESC LIMIT 50');
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
