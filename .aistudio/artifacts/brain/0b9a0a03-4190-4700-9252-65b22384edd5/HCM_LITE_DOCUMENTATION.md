# HCM Lite — Complete System Audit, Technical Architecture & Documentation

## 1. Executive Summary & Project Overview
**HCM Lite** is an enterprise-grade Human Capital Management and Attendance Automation Platform architected for SMEs and scaling organizations. It unifies workforce identity management, real-time geofenced attendance tracking, biometric facial verification, hierarchical leave management, automated payroll generation with progressive tax brackets, and an internal AI assistant operating under strict role-based data boundaries.

---

## 2. Complete Module Audit Matrix

| Module | Feature | Status | Verification Detail |
|---|---|:---:|---|
| **M1: Auth & Access** | JWT login with bcrypt password hashing | ✅ DONE | Salt rounds 10, stateless JWT bearer token |
| | Three roles: ADMIN, HR, EMPLOYEE with separate menus | ✅ DONE | Server route guards + client navigation isolation |
| | Role guard on every API route (server-side) | ✅ DONE | Enforced via `requireRole('admin', 'hr', 'employee')` |
| | Data scope guard: Employee can only access own data | ✅ DONE | Server-enforced via `checkEmployeeDataScope` |
| | First-run setup: empty DB shows company + admin creation | ✅ DONE | `GET /api/setup/status` triggers wizard with zero dummy rows |
| | Change password on first login (temporary password flow) | ✅ DONE | `must_change_password = 1` forces password reset |
| | Self-Service Forgot Password / Account Recovery | ✅ DONE | Recovers account by email or employee code |
| **M2: Org Setup** | Company settings: name, office start, grace, weekend | ✅ DONE | Configurable with defaults (09:00, 15m, Sat-Sun) |
| | Departments CRUD | ✅ DONE | Protected against accidental deletion cascades |
| | Leave types with yearly quotas | ✅ DONE | Configurable yearly limits per leave type |
| | Public holidays CRUD | ✅ DONE | Calendar dates excluded from absent deductions |
| | Admin user management (HR creation, status, reset) | ✅ DONE | Dedicated tab in Settings & Policies |
| **M3: Employees** | HR can register employees with auto temporary password | ✅ DONE | Sequenced codes (`EMP001`), credentials copied to clipboard |
| | Employee directory with search, filters, pagination | ✅ DONE | Real-time text search and department filter |
| | Employee 360 profile view | ✅ DONE | Full view with attendance, leaves, payslips, audit trail |
| | CSV import with dry-run error report | ✅ DONE | Validates syntax, duplicates, emails before importing |
| | CSV export | ✅ DONE | Streams formatted RFC-compliant CSV |
| **M4: Attendance** | Check-in/Check-out buttons on Employee dashboard | ✅ DONE | Interactive punch card with real-time timer |
| | SERVER sets timestamp (not browser) | ✅ DONE | Timestamps generated on backend clock |
| | One record per employee per day — duplicate returns HTTP 409 | ✅ DONE | Database constraint `UNIQUE(employee_id, date)` |
| | Status rules: late after 09:15, half_day under 5 hours, absent | ✅ DONE | Handled via grace period and duration calculations |
| | Geofencing: Haversine distance, rejection if > radius or > 100m GPS | ✅ DONE | Returns HTTP 403 with distance and reason |
| | Face Verification: 128-float embedding matching | ✅ DONE | Client-side SSD MobileNet with Euclidean threshold <= 0.55 |
| **M5: Leave** | Submit leave request with duration calculation | ✅ DONE | Calculates working days and deducts remaining quota |
| | HTTP 422 on exceeding quota or date overlap | ✅ DONE | Rejects exceeding balance or overlapping date ranges |
| | Employee can cancel pending leave request | ✅ DONE | `POST /api/leaves/:id/cancel` sets status to `cancelled` |
| | HR can approve/reject with mandatory review comment | ✅ DONE | Rejects empty comment with HTTP 400 |
| **M6: Payroll** | Formulaic salary breakdown (Basic 60%, HRA 20%, Med 10%, Allow 10%) | ✅ DONE | Standardized pay components |
| | Per-day rate deductions for absent, unpaid leave, half-day | ✅ DONE | Per-day rate = Gross / Working Days in month |
| | FBR 2024-2025 Progressive Annual Income Tax | ✅ DONE | 6-tier progressive income tax formula |
| | Draft preview, review & finalize payroll | ✅ DONE | Draft can be recalculated; finalized is locked |
| | Downloadable PDF payslip | ✅ DONE | Downloadable PDF format with gross/deductions/net pay |
| **M7: Dashboards** | Admin & HR Dashboards with metrics and distribution | ✅ DONE | Headcount cost, tax withheld, attendance rates |
| | Employee Dashboard with 4 top cards, punch card, mini-calendar | ✅ DONE | Hours this week (Xh/40h), late count, leave balance, payslips |
| **M8: AI Assistant**| Role-aware Gemini 2.5 Flash chatbot with tool grounding | ✅ DONE | Leave balance, company policies, tax calculator tools |
| | Privacy boundary: never disclose colleague salaries to employees | ✅ DONE | System prompt and server tool masks colleague salaries |
| **M9: Comms & Audit**| Company announcements broadcast banner | ✅ DONE | Admin/HR post, visible to all employees |
| | In-app notifications with unread counter | ✅ DONE | Generated on leave approvals, payroll releases |
| | Centralized immutable audit trail with IP logs | ✅ DONE | Full historical event trail with JSON details |

---

## 3. System Architecture Diagram

```
[ React 19 Client SPA ] 
  ├── Employee Dashboard (Punch Card, Mini-Calendar, Leave Requests, Payslips)
  ├── HR Dashboard & Employee Manager (CSV Import/Export, 360 View, Leave Reviews)
  ├── Admin Manager (Policies, Geofencing, User Logins & HR Creation)
  └── AI Assistant FAB (Gemini Chat with tool calls)
           │
           │ RESTful HTTP (JWT Bearer Token)
           ▼
[ Node.js / Express Server (Port 3000) ]
  ├── JWT Auth & Role Guard (`requireRole`)
  ├── Horizontal Scope Guard (`checkEmployeeDataScope`)
  ├── Geofence Engine (Haversine formula in `geoService.ts`)
  ├── Payroll Calculator (`payrollService.ts` FBR 2024-2025 Slabs)
  └── Gemini SDK (`@google/genai` Model Router)
           │
           │ SQL Queries & Atomic Transactions
           ▼
[ SQLite Database (sql.js) ]
  ├── companies, users, departments, leave_types, public_holidays
  ├── employees, leave_requests, attendance, payroll_runs, payslips
  └── announcements, notifications, audit_logs, ai_logs
```

---

## 4. Key Endpoints Reference

| Endpoint | Method | Role | Purpose |
|---|:---:|:---:|---|
| `/api/setup/status` | GET | Public | Checks if database requires initial setup |
| `/api/setup` | POST | Public | Creates initial company & admin account (empty DB only) |
| `/api/auth/login` | POST | Public | Authenticates credentials and issues 24h JWT token |
| `/api/auth/forgot-password` | POST | Public | Generates temporary password by email or employee code |
| `/api/users/hr` | POST | Admin | Creates HR user account with temporary password |
| `/api/users/:id/status` | PUT | Admin | Toggles user status (`active` / `inactive`) |
| `/api/users/:id/reset-password` | POST | Admin | Resets user password to new temporary password |
| `/api/employees/export/csv` | GET | Admin, HR | Streams formatted CSV export of employee directory |
| `/api/employees/import/csv` | POST | Admin, HR | Dry-run validation (`dry_run: true`) or atomic batch import |
| `/api/employees/:id/360` | GET | Admin, HR, Emp (self) | Aggregated 360 view (attendance, leaves, payslips, audit) |
| `/api/leaves` | POST | Admin, HR, Emp | Submits leave request (validates balance & overlap -> 422) |
| `/api/leaves/:id/cancel` | POST | Admin, HR, Emp (self) | Cancels pending leave request |
| `/api/leaves/:id/status` | PUT | Admin, HR | Approves/rejects leave request with mandatory comment |
| `/api/attendance/check-in` | POST | All | Checks in with GPS geofence validation |
| `/api/payroll/generate` | POST | Admin, HR | Computes draft prorated payroll for month |
| `/api/payroll/runs/:id/finalize` | POST | Admin, HR | Finalizes and locks payroll batch |
