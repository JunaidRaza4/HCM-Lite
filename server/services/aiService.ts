import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { query, queryOne, run } from '../db/database';
import { getHrAnalytics, getAdminAnalytics, getEmployeeAnalytics } from './analyticsService';

dotenv.config();

// In-memory rate limiting: 20 requests per user per hour
const userRateLimits = new Map<number, { count: number; resetAt: number }>();

export function checkAiRateLimit(userId: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const userLimit = userRateLimits.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    userRateLimits.set(userId, { count: 1, resetAt: now + 3600 * 1000 });
    return { allowed: true, remaining: 19 };
  }

  if (userLimit.count >= 20) {
    return { allowed: false, remaining: 0 };
  }

  userLimit.count += 1;
  return { allowed: true, remaining: 20 - userLimit.count };
}

export function logAiCall(params: {
  userId?: number;
  userEmail?: string;
  userRole?: string;
  prompt: string;
  toolsUsed?: string;
  response: string;
  latencyMs: number;
}): void {
  try {
    const now = new Date().toISOString();
    run(
      `INSERT INTO ai_logs (user_id, user_email, user_role, prompt, tools_used, response, latency_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.userId || null,
        params.userEmail || null,
        params.userRole || null,
        params.prompt,
        params.toolsUsed || null,
        params.response,
        params.latencyMs,
        now,
      ]
    );
  } catch (err) {
    console.error('Failed to log AI call:', err);
  }
}

// Service functions matching REST APIs
export const aiToolsExecution = {
  get_headcount(user: any, args: { department_id?: number }) {
    const filter = args.department_id ? 'AND department_id = ' + Number(args.department_id) : '';
    const row = queryOne<any>(`SELECT COUNT(*) as count FROM employees WHERE status = 'active' ${filter}`);
    return { headcount: row?.count || 0 };
  },

  get_attendance_summary(user: any, args: { date?: string; department_id?: number }) {
    const hrData = getHrAnalytics({ departmentId: args.department_id });
    return {
      presentToday: hrData.kpis.presentToday,
      lateToday: hrData.kpis.lateToday,
      onLeaveToday: hrData.kpis.onLeaveToday,
      headcount: hrData.kpis.headcount,
      pendingApprovals: hrData.kpis.pendingApprovals,
    };
  },

  get_late_comers(user: any, args: { limit?: number; month?: string }) {
    if (user.role === 'employee') {
      return { error: 'Employees can only view their own attendance records.' };
    }
    const hrData = getHrAnalytics();
    return { topLateComers: hrData.topLateComers.slice(0, args.limit || 5) };
  },

  get_leave_summary(user: any, args: { department_id?: number }) {
    if (user.role === 'employee') {
      return { error: 'Employees can only view their own leave balances.' };
    }
    const leaveTypes = query<any>('SELECT * FROM leave_types');
    const counts = leaveTypes.map((lt) => {
      const row = queryOne<any>(
        'SELECT COUNT(*) as req_count, SUM(days_count) as total_days FROM leave_requests WHERE leave_type_id = ? AND status = "approved"',
        [lt.id]
      );
      return {
        type: lt.name,
        approvedRequests: row?.req_count || 0,
        totalDays: row?.total_days || 0,
      };
    });
    return { leaveSummary: counts };
  },

  get_my_leave_balance(user: any) {
    if (!user.employeeId) {
      return { error: 'No employee profile linked to current user.' };
    }
    const empData = getEmployeeAnalytics(user.employeeId);
    return { leaveBalances: empData.leaveBalances };
  },

  get_payroll_summary(user: any, args: { month?: string }) {
    // SECURITY SCOPE ENFORCEMENT:
    // If employee asks for payroll summary, only return their own latest payslip
    if (user.role === 'employee') {
      if (!user.employeeId) return { error: 'No employee profile linked to current user.' };
      const ps = queryOne<any>(
        'SELECT month, gross, net_salary, total_deductions, status FROM payslips WHERE employee_id = ? ORDER BY month DESC LIMIT 1',
        [user.employeeId]
      );
      return ps
        ? { myLastPayslip: ps }
        : { message: 'No finalized payslips found for your account.' };
    }

    // HR and Admin can see company payroll summary
    const pr = args.month
      ? queryOne<any>('SELECT * FROM payroll_runs WHERE month = ?', [args.month])
      : queryOne<any>('SELECT * FROM payroll_runs ORDER BY month DESC LIMIT 1');

    return pr
      ? {
          month: pr.month,
          status: pr.status,
          totalGross: pr.total_gross,
          totalNet: pr.total_net,
          employeeCount: pr.employee_count,
        }
      : { message: 'No payroll runs recorded yet.' };
  },

  search_employees(user: any, args: { query?: string; department_id?: number }) {
    let sql = `
      SELECT e.id, e.code, e.name, d.name as department, e.designation, e.email
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'active'
    `;
    const params: any[] = [];
    if (args.query) {
      sql += ` AND (e.name LIKE ? OR e.code LIKE ? OR e.designation LIKE ?)`;
      params.push(`%${args.query}%`, `%${args.query}%`, `%${args.query}%`);
    }
    if (args.department_id) {
      sql += ` AND e.department_id = ?`;
      params.push(args.department_id);
    }
    sql += ` LIMIT 10`;

    // Notice: basic_salary is NEVER returned here! Safe for employee directory
    const emps = query<any>(sql, params);
    return { employees: emps };
  },
};

// Function declarations for Gemini Tool Calling
const toolDeclarations = [
  {
    name: 'get_headcount',
    description: 'Get current active company or department headcount.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        department_id: { type: Type.INTEGER, description: 'Optional department ID filter' },
      },
    },
  },
  {
    name: 'get_attendance_summary',
    description: 'Get today summary of attendance (present, late, on leave, pending approvals).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: 'Optional date YYYY-MM-DD' },
        department_id: { type: Type.INTEGER, description: 'Optional department ID' },
      },
    },
  },
  {
    name: 'get_late_comers',
    description: 'Get the top late-coming employees for this month (Admin/HR only).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: { type: Type.INTEGER, description: 'Number of employees to return, default 5' },
        month: { type: Type.STRING, description: 'Month in YYYY-MM format' },
      },
    },
  },
  {
    name: 'get_leave_summary',
    description: 'Get aggregate summary of leave types and approved days (Admin/HR only).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        department_id: { type: Type.INTEGER, description: 'Optional department ID' },
      },
    },
  },
  {
    name: 'get_my_leave_balance',
    description: 'Get leave balances (quota, used, remaining) for the currently logged-in employee.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_payroll_summary',
    description: 'Get monthly payroll summary (total gross, net) for HR/Admin, or own payslip for employee.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: { type: Type.STRING, description: 'Payroll month in YYYY-MM' },
      },
    },
  },
  {
    name: 'search_employees',
    description: 'Search employee directory by name, designation, or code (does not disclose salary).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search keyword' },
        department_id: { type: Type.INTEGER, description: 'Optional department ID filter' },
      },
    },
  },
];

export async function processAiChat(user: any, message: string) {
  const startTime = Date.now();
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const errorMsg = 'Gemini AI API Key is not configured. Please ensure AI_API_KEY or GEMINI_API_KEY is set in server environment.';
    logAiCall({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      prompt: message,
      response: errorMsg,
      latencyMs: Date.now() - startTime,
    });
    return {
      reply: errorMsg,
      isAiGenerated: true,
      smartLeaveForm: null,
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  const systemInstruction = `
You are the intelligent HCM Lite AI Assistant. You assist employees, HR, and Administrators.

CURRENT USER CONTEXT:
- Role: ${user.role}
- Name: ${user.name}
- Employee ID: ${user.employeeId || 'N/A'}
- Email: ${user.email}
- Today's Date: ${todayStr}

BUSINESS RULES & POLICIES (MANDATORY):
1. Office Schedule: Office starts at 09:00.
2. Grace Period: 15 minutes. Check-ins after 09:15 are strictly marked as 'Late'.
3. Half Day: Working hours under 5 hours are marked as 'Half Day' (incurs 0.5 day deduction in payroll).
4. Leave Quotas: Annual = 14 days, Sick = 8 days, Casual = 10 days.
5. Tax Slabs (computed on annualized gross = gross × 12, then divided by 12 for the month):
   - 0 to 600,000 → 0%
   - 600,000 to 1,200,000 → 5%
   - 1,200,000 to 2,400,000 → 30,000 + 15%
   - 2,400,000 to 3,600,000 → 210,000 + 25%
   - Above 3,600,000 → 510,000 + 35%
6. Payroll Formula:
   - GROSS = 1.5 × basic salary
   - HRA = 40% of basic
   - Medical = 10% of basic
   - Allowances = Gross - Basic - HRA - Medical
   - per_day = gross ÷ working days in that month (skipping Saturdays, Sundays, and public holidays)
   - deductions: 1 day per ABSENT day, 1 day per UNPAID leave day, 0.5 day per HALF day
   - Prorated for employees who joined or left mid-month
   - Monthly tax = Annual tax ÷ 12
   - Net salary = Effective Gross - Total Deductions - Monthly Tax

CRITICAL POLICY & TOOL RESTRICTION:
- For general policy questions (working hours, grace period, leave quotas, tax slabs, payroll formulas), answer ONLY from the business rules above; if a policy question is not covered in these rules, respond: "I don't know".
- For live operational and organizational queries (such as "How many active employees?", attendance summaries, leave balances, late comers), call the appropriate tool and answer directly using the tool's returned data.

SECURITY & CONFIDENTIALITY (STRICT COMPLIANCE REQUIRED):
- If the current user has the role 'employee' and asks for any colleague's salary or compensation details (e.g. "What is [name]'s salary?", "how much does Alice make?", "give me Bob's pay", etc.), you MUST politely and firmly refuse:
  "I cannot disclose other employees' salary or compensation details. This information is strictly confidential."
- Never expose another employee's salary under any circumstance.
- An employee may only check their own leave balance, their own attendance, or general company policies.

SMART LEAVE DETECTION:
If the user expresses intent to apply for or take time off (e.g., "I need Monday and Tuesday off for my sister's wedding", "I need 2 days leave starting tomorrow because I have flu", etc.):
Include a valid JSON block at the bottom of your answer formatted exactly like this:
\`\`\`json
{
  "smartLeave": {
    "type": "Annual" | "Sick" | "Casual",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "reason": "..."
  }
}
\`\`\`
Calculate valid YYYY-MM-DD dates relative to today's date (${todayStr}).
`;

  // Timeout promise for 15 seconds
  const timeoutPromise = new Promise<{ isTimeout: true }>((resolve) => {
    setTimeout(() => resolve({ isTimeout: true }), 14500);
  });

  const executionPromise = (async () => {
    try {
      const toolsUsedList: string[] = [];

      // Initial call with tools
      const firstResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [
          {
            role: 'user',
            parts: [{ text: message }],
          },
        ],
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: toolDeclarations as any }],
        },
      });

      // Handle function calls if any
      const functionCalls = firstResponse.functionCalls;
      let finalReply = firstResponse.text || '';

      if (functionCalls && functionCalls.length > 0) {
        const functionResponsesParts: any[] = [];

        for (const call of functionCalls) {
          const toolName = call.name || '';
          if (!toolName) continue;
          toolsUsedList.push(toolName);
          const toolHandler = (aiToolsExecution as any)[toolName];
          let toolResult: any;

          if (toolHandler) {
            try {
              toolResult = toolHandler(user, call.args || {});
            } catch (err: any) {
              toolResult = { error: err.message };
            }
          } else {
            toolResult = { error: `Tool ${toolName} not found.` };
          }

          functionResponsesParts.push({
            functionResponse: {
              name: call.name,
              response: { result: toolResult },
            },
          });
        }

        // Send tool results back to Gemini for final natural language synthesis
        const secondResponse = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: [
            {
              role: 'user',
              parts: [{ text: message }],
            },
            firstResponse.candidates?.[0]?.content as any,
            {
              role: 'tool',
              parts: functionResponsesParts,
            },
          ],
          config: {
            systemInstruction,
          },
        });

        finalReply = secondResponse.text || finalReply;
      }

      // Check for Smart Leave JSON extraction in the reply
      let smartLeaveForm: any = null;
      const jsonMatch = finalReply.match(/```(?:json)?\s*([\s\S]*?\{[\s\S]*?"smartLeave"[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.smartLeave) {
            const sl = parsed.smartLeave;
            // Match leave type from DB
            const leaveTypes = query<any>('SELECT * FROM leave_types');
            const matchedType = leaveTypes.find(
              (lt) => lt.name.toLowerCase() === (sl.type || '').toLowerCase()
            ) || leaveTypes[0];

            smartLeaveForm = {
              leave_type_id: matchedType?.id || 1,
              leave_type_name: matchedType?.name || 'Annual Leave',
              start_date: sl.start_date || todayStr,
              end_date: sl.end_date || sl.start_date || todayStr,
              reason: sl.reason || 'Personal leave',
            };

            // Clean the JSON block out of the human-facing message
            finalReply = finalReply.replace(/```(?:json)?\s*[\s\S]*?"smartLeave"[\s\S]*?```/g, '').trim();
          }
        } catch (_) {
          // JSON parse failed; prompt instructs retry once or fall back
        }
      }

      return {
        reply: finalReply || 'I processed your request.',
        toolsUsed: toolsUsedList.join(', '),
        smartLeaveForm,
      };
    } catch (err: any) {
      console.error('Gemini execution error:', err);
      return {
        reply: `I encountered an issue processing your request: ${err.message || 'Unknown error'}.`,
        toolsUsed: '',
        smartLeaveForm: null,
      };
    }
  })();

  const raceResult: any = await Promise.race([executionPromise, timeoutPromise]);

  if (raceResult.isTimeout) {
    const timeoutMsg = 'The AI assistant took too long to respond. Please try again.';
    logAiCall({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      prompt: message,
      response: timeoutMsg,
      latencyMs: Date.now() - startTime,
    });
    return {
      reply: timeoutMsg,
      isAiGenerated: true,
      smartLeaveForm: null,
    };
  }

  const latencyMs = Date.now() - startTime;
  logAiCall({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    prompt: message,
    toolsUsed: raceResult.toolsUsed,
    response: raceResult.reply,
    latencyMs,
  });

  return {
    reply: raceResult.reply,
    isAiGenerated: true,
    smartLeaveForm: raceResult.smartLeaveForm,
  };
}
