# HCM Lite — Complete System Audit, Technical Architecture & Documentation

---

## 1. Executive Summary & Project Overview

**HCM Lite** is an enterprise-ready, full-stack Human Capital Management and Attendance Automation Platform architected for SMEs and scaling organizations. It unifies workforce identity management, real-time geofenced attendance tracking, biometric facial verification, hierarchical leave management, automated payroll generation with progressive tax brackets, and an internal AI assistant operating under strict role-based data boundaries.

### Core Value Propositions
- **Multi-Tenant Per-Email Company Setup**: Any new email automatically initializes a new organization with zero "email galat hai" friction, while returning users seamlessly log into their existing company.
- **Two-Step Onboarding Wizard**: Step 1 (Company Profile, GPS Geofence & Root Admin) -> Step 2 (Initial Department & First HR/Employee Setup) -> Direct launch into the final Dashboard.
- **Strict Role-Based Multi-Tenancy**: Three distinct roles (**ADMIN**, **HR**, **EMPLOYEE**) backed by server-enforced JWT claim verifications and strict horizontal data scoping.
- **Location-Aware Geofenced Attendance**: Mobile and web punch-in enforcement calculating Haversine distance against office GPS coordinates with high-accuracy thresholding.
- **Biometric Face Verification**: Client-side neural feature extraction powered by SSD MobileNet and 128-dimensional Euclidean distance matching ($\le 0.55$).
- **Tax & Proration Payroll Engine**: Pakistani Income Tax Ordinance (FBR) 6-tier progressive annual tax computation, unpaid leave proration, and automated payslip generation.
- **Auditable & Recoverable**: Centralized immutable audit trail logging all actions with IP addresses, timestamps, actor roles, plus a self-service 2-step security question recovery workflow.

---

## 2. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (REACT 19 SPA)                         │
│  - Vite 8.3 Dev Server & Production Bundler                            │
│  - Tailwind CSS v4 Modern Design System                                │
│  - Lucide React Iconography & Motion Transitions                       │
│  - VladMandic / Face-API (SSD MobileNet + 68 Landmarks + Recognition)  │
│  - jsPDF / PDFKit Payslip Document Rendering Engine                    │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTP / RESTful JSON
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        NODE.JS / EXPRESS BACKEND                       │
│  - Port 3000 Unified Server (Static SPA + API Proxy)                   │
│  - JWT Bearer Token Middleware (`authenticate`, `requireRole`)         │
│  - Horizontal Data Isolation (`checkEmployeeDataScope`)                │
│  - Central Audit Logger (`services/auditService.ts`)                   │
│  - Geolocation Math (`services/geoService.ts` Haversine)               │
│  - Google GenAI SDK (`@google/genai`) Gemini Model Router              │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ SQL Queries & Atomic Transactions
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     EMBEDDED SQLITE DATABASE (sql.js)                  │
│  - In-Memory High-Performance Runtime with File Serialization          │
│  - Strict Referential Integrity (`PRAGMA foreign_keys = ON;`)          │
│  - Safe Idempotent Schema Migrations on Startup                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Technology Matrix
| Layer | Technologies Used | Rationale |
|---|---|---|
| **Frontend Framework** | React 19, TypeScript 7.0 | Componentized, type-safe state management |
| **Styling & Theme** | Tailwind CSS v4 (native `@import "tailwindcss";`) | Zero runtime overhead, clean responsive light/dark design |
| **Vision & AI Face** | `@vladmandic/face-api` (1.7.15) | Privacy-first on-device facial feature extraction |
| **Application Server** | Node.js 22 LTS, Express 4.21, `tsx` | Robust microkernel routing and middleware chain |
| **Database Engine** | SQLite via `sql.js` (WebAssembly/Node) | Zero-configuration embedded ACID database |
| **Security & Crypto** | `bcryptjs` (salt 10), `jsonwebtoken` | Industry-standard password hashing and stateless tokens |
| **Document Generation** | `jspdf`, `jspdf-autotable`, `pdfkit` | Client and server PDF payslip rendering |
| **AI Assistant** | `@google/genai` (Gemini 2.5 Flash) | Context-aware HR queries with tool calls |

---

## 3. Comprehensive 9-Module Breakdown

### Module 1: Authentication & Access Control (M1)
- **JWT Authentication**: 24-hour expiration token containing `id`, `email`, `role`, `employeeId`, and `mustChangePassword`.
- **Three Core Roles**:
  - `admin`: Complete organization control, policies, user accounts, and financial overviews.
  - `hr`: Employee records, leave reviews, attendance oversight, payroll generation.
  - `employee`: Self-service punch card, leave requests, attendance history, payslip downloads.
- **First-Run Provisioning Flow**:
  - `GET /api/setup/status`: Detects if database contains 0 companies or 0 admins.
  - Diverts fresh instances to `FirstRunSetup.tsx` before reaching the login screen.
  - `POST /api/setup`: Executes atomic transaction creating the single company record and first super-admin account without seeding dummy departments or fake leaves.
- **Temporary Password Lifecycle**:
  - Newly generated accounts receive passwords formatted as `Pass@XXXXX` with `must_change_password = 1`.
  - App displays an unavoidable modal forcing the user to select a permanent password before proceeding.
- **Self-Service Account Recovery ("Forgot Password")**:
  - Users enter either their registered corporate email or unique employee code (e.g. `EMP001`).
  - Server verifies active status, generates a fresh temporary password, sets `must_change_password = 1`, and logs audit action `PASSWORD_RESET_SELF_SERVICE`.

### Module 2: Organization Setup & Administration (M2)
- **Company Settings**:
  - Office official start time (default `09:00`).
  - Grace period in minutes (default `15`).
  - Configurable weekend days (comma-separated, e.g. `Saturday,Sunday`).
  - Office GPS Coordinates (`office_lat`, `office_lng`) and Allowed Geofence Radius (`office_radius` meters, 50m to 5000m).
- **Departments Management**: Full CRUD (`/api/departments`) enforcing foreign key integrity so departments with assigned employees cannot be orphaned.
- **Leave Types & Quotas**: Full CRUD (`/api/leave-types`) configuring yearly allowance limits (e.g. Annual 14, Sick 8, Casual 10).
- **Public Holidays**: Full CRUD (`/api/holidays`) defining company closures excluded from absent calculations.
- **System User Management (Admin Only)**:
  - `GET /api/users`: Overview of all login credentials across the system.
  - `POST /api/users/hr`: Direct HR user provisioning with generated temporary password.
  - `PUT /api/users/:id/status`: Immediate account suspension/reactivation (`active` / `inactive`).
  - `POST /api/users/:id/reset-password`: Administrative temporary password generation.

### Module 3: Employee Management & Directory (M3)
- **Employee Directory**: Searchable by name, email, employee code, filtered by department, paginated table.
- **Self-Generating Code**: `GET /api/employees/next-code` automatically sequences `EMP001`, `EMP002`, etc.
- **Atomic Registration**: In a single transaction:
  1. Inserts record into `users` table (`role: 'employee'`, `must_change_password: 1`).
  2. Inserts record into `employees` table linked by `user_id`.
  3. Writes audit log `EMPLOYEE_CREATED`.
  4. Returns the temporary password in a secure modal with clipboard copying.
- **CSV Export**:
  - `GET /api/employees/export/csv`: Streams RFC-compliant CSV containing `Employee Code`, `Full Name`, `Email`, `Department`, `Designation`, `Join Date`, `Basic Salary`, `Phone`, `Status`.
- **CSV Batch Import with Dry-Run Validation**:
  - `POST /api/employees/import/csv` with `dry_run: true`: Validates header presence, mandatory names/emails, regex email format, cross-row and cross-database duplicate email/code checks, and numeric salaries.
  - Returns structured error reports (`row`, `code`, `name`, `email`, `reason`) and previews valid rows.
  - Real execution (`dry_run: false`) performs an atomic batch transaction creating all users and employees.
- **Employee 360 Profile Modal**:
  - Available to HR/Admin and employees (scoped to self).
  - Summarizes lifetime attendance, punctuality rate, all leave category balances, last 6 payslips, and chronological audit activities.

### Module 4: Attendance & Time-Tracking (M4)
- **Server Authority**: Timestamps are strictly generated on the server (`new Date().toISOString()`), preventing client clock tampering.
- **Punctuality Status Machine**:
  - `present`: Check-in before `office_start + grace_period_mins` (e.g. 09:15).
  - `late`: Check-in after grace period.
  - `half_day`: Total daily logged hours between check-in and check-out is under 5 hours.
  - `missing_checkout`: Checked in but never punched out at end of day.
  - `absent`: Non-weekend, non-holiday working day with zero check-in record.
- **One Record Per Day Rule**: Enforces database UNIQUE constraint `(employee_id, date)`. Duplicate check-in attempts return HTTP `409 Conflict`.
- **Dual Verification Modes**:
  1. **Web Punch with Geofencing**: Captures device GPS coordinates. Verifies accuracy (`<= 100m`) and Haversine distance (`<= office_radius`). If out of bounds, rejects with descriptive HTTP `403`.
  2. **Kiosk / Camera Punch with Facial Recognition**: Matches client-side face embeddings against enrolled profile descriptors using Euclidean distance threshold `0.55`.

### Module 5: Leave Management & Quotas (M5)
- **Leave Request Workflow**:
  - Employee specifies leave type, start date, end date, total days, and optional reason.
- **HTTP 422 Unprocessable Entity Validations**:
  1. **Exceeding Quota Balance**: Rejects if requested days exceed remaining quota (`quota_days - approved_usage`).
  2. **Date Range Overlap**: Rejects if the employee already has a pending or approved leave request overlapping with the requested dates.
- **Cancellation Flow**:
  - `POST /api/leaves/:id/cancel`: Employees can immediately revoke their own pending requests.
- **Mandatory Review Comment**:
  - Approving or rejecting a leave request requires an HR comment note; empty notes are rejected by both frontend validation and backend route guard.

### Module 6: Payroll & Compensation Engine (M6)
- **Formulaic Breakdown**:
  - `Gross Salary` = `Basic Salary (60%)` + `House Rent Allowance (20%)` + `Medical Allowance (10%)` + `Special Allowance (10%)`.
  - `Per Day Rate` = `Gross Salary / Working Days in Month`.
  - `Deductions` = `(Absent Days * Rate)` + `(Unpaid Leave Days * Rate)` + `(Half Days * 0.5 * Rate)`.
  - `Taxable Annual Income` = `(Gross - Deductions) * 12`.
- **Pakistani FBR Progressive Tax Brackets (2024-2025)**:
  - Tier 1: Up to PKR 600,000 → 0%
  - Tier 2: 600,001 to 1,200,000 → 5% of excess over 600k
  - Tier 3: 1,200,001 to 2,200,000 → PKR 30,000 + 15% of excess over 1.2M
  - Tier 4: 2,200,001 to 3,200,000 → PKR 180,000 + 25% of excess over 2.2M
  - Tier 5: 3,200,001 to 4,100,000 → PKR 430,000 + 30% of excess over 3.2M
  - Tier 6: Above 4,100,000 → PKR 700,000 + 35% of excess over 4.1M
  - `Monthly Tax` = `Annual Tax / 12`.
  - `Net Pay` = `Gross - Total Deductions - Monthly Tax`.
- **Locking & Payslips**: Draft payrolls can be previewed, audited, and edited. Finalizing locks the batch as immutable and generates downloadable client-side PDF payslips.

### Module 7: Dashboards & Analytics (M7)
- **Admin Dashboard**: Executive top cards (Total Staff, Headcount Cost, Monthly Tax Withholding, Average Attendance), Departmental Distribution Charts, and Company Settings Shortcut.
- **HR Dashboard**: Real-time attendance percentage today, Pending Leaves Counter, Draft Payroll status banner, Quick-Register Employee widget.
- **Employee Dashboard**:
  - 4 Top Metric Cards: Hours This Week (`Xh / 40h`), Late Count this month, Leave Balances remaining, Last Net Pay.
  - Prominent punch clock with elapsed timer.
  - Interactive Attendance Mini-Calendar color-coding every day of the month.
  - Downloadable PDF payslips table.

### Module 8: AI Assistant & Smart Operations (M8)
- **Role-Aware Chatbot**: Powered by Gemini 2.5 Flash via `@google/genai`.
- **Tool Grounding**:
  - `get_my_leave_balance`: Retrieves remaining days.
  - `get_company_policies`: Reads office timings, grace periods, geofence radius.
  - `search_employees`: Directory query restricted to public fields (name, department, email). **Strict privacy rule: salaries are masked and never exposed to colleague inquiries**.
  - `calculate_tax_estimate`: Interactive income tax calculator.
- **Smart Form Auto-fill**: Conversational leave queries (e.g. *"I need 2 days off next Monday for a medical checkup"*) automatically extract parameters into an interactive Smart Leave Card.

### Module 9: Communications & Audit Trail (M9)
- **Company Announcements**: Admin and HR can broadcast notices; visible to all employees on their dashboards.
- **In-App Notification Dispatcher**: System generates automated notices when leaves are approved/rejected or payrolls are finalized.
- **Immutable Audit Log**: Records `actor_id`, `actor_name`, `actor_role`, `action`, `entity`, `entity_id`, JSON `details`, and client `ip_address`.

---

## 4. Complete Database Schema

```sql
-- 1. Companies Table
CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  office_start TEXT NOT NULL DEFAULT '09:00',
  grace_period_mins INTEGER NOT NULL DEFAULT 15,
  weekend_days TEXT NOT NULL DEFAULT 'Saturday,Sunday',
  office_lat REAL DEFAULT 24.8607,
  office_lng REAL DEFAULT 67.0011,
  office_radius INTEGER DEFAULT 150,
  geofence_radius_meters REAL DEFAULT 150,
  geofence_enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. Users Table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'hr', 'employee')),
  name TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. Departments Table
CREATE TABLE departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);

-- 4. Leave Types Table
CREATE TABLE leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  quota_days REAL NOT NULL DEFAULT 14,
  description TEXT,
  created_at TEXT NOT NULL
);

-- 5. Public Holidays Table
CREATE TABLE public_holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);

-- 6. Employees Table
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  department_id INTEGER,
  join_date TEXT NOT NULL,
  basic_salary REAL NOT NULL,
  phone TEXT,
  designation TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(department_id) REFERENCES departments(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- 7. Leave Requests Table
CREATE TABLE leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  leave_type_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days_count REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'cancelled'
  reviewed_by INTEGER,
  reviewed_at TEXT,
  admin_comment TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(employee_id) REFERENCES employees(id),
  FOREIGN KEY(leave_type_id) REFERENCES leave_types(id)
);

-- 8. Attendance Table
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  duration_minutes INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'present', -- 'present', 'late', 'half_day', 'absent', 'missing_checkout'
  source TEXT DEFAULT 'web',             -- 'web' or 'camera'
  checkin_lat REAL,
  checkin_lng REAL,
  checkin_accuracy REAL,
  checkout_lat REAL,
  checkout_lng REAL,
  checkout_accuracy REAL,
  distance_meters REAL,
  face_verified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(employee_id, date),
  FOREIGN KEY(employee_id) REFERENCES employees(id)
);

-- 9. Payroll Runs Table
CREATE TABLE payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT UNIQUE NOT NULL, -- 'YYYY-MM'
  status TEXT NOT NULL CHECK(status IN ('draft', 'finalized')),
  created_by INTEGER,
  finalized_by INTEGER,
  total_gross REAL NOT NULL DEFAULT 0,
  total_net REAL NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(finalized_by) REFERENCES users(id)
);

-- 10. Payslips Table
CREATE TABLE payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_run_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  basic_salary REAL NOT NULL,
  hra REAL NOT NULL,
  medical REAL NOT NULL,
  allowances REAL NOT NULL,
  gross REAL NOT NULL,
  working_days INTEGER NOT NULL,
  attended_days REAL NOT NULL DEFAULT 0,
  absent_days REAL NOT NULL DEFAULT 0,
  unpaid_leave_days REAL NOT NULL DEFAULT 0,
  half_days REAL NOT NULL DEFAULT 0,
  prorate_factor REAL NOT NULL DEFAULT 1,
  per_day_rate REAL NOT NULL,
  absent_deduction REAL NOT NULL DEFAULT 0,
  unpaid_leave_deduction REAL NOT NULL DEFAULT 0,
  half_day_deduction REAL NOT NULL DEFAULT 0,
  total_deductions REAL NOT NULL DEFAULT 0,
  taxable_gross REAL NOT NULL DEFAULT 0,
  annual_gross REAL NOT NULL DEFAULT 0,
  annual_tax REAL NOT NULL DEFAULT 0,
  monthly_tax REAL NOT NULL DEFAULT 0,
  net_salary REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  UNIQUE(employee_id, month),
  FOREIGN KEY(payroll_run_id) REFERENCES payroll_runs(id),
  FOREIGN KEY(employee_id) REFERENCES employees(id)
);

-- 11. Announcements Table
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id INTEGER,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 12. In-App Notifications Table
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- 13. Centralized Audit Trail Table
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL
);
```

---

## 5. Security & Authorization Architecture

### 1. JSON Web Token Specification
```ts
interface JwtPayload {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'hr' | 'employee';
  employeeId?: number | null;
  mustChangePassword?: number;
}
```
Tokens are validated on every secured request via `Authorization: Bearer <TOKEN>`.

### 2. Role-Based Access Control (RBAC) Matrix
| Endpoint / Resource | Admin | HR | Employee |
|---|:---:|:---:|:---:|
| First-Run Setup (`/api/setup`) | Public (only when DB empty) | Public (only when DB empty) | Public (only when DB empty) |
| Forgot Password (`/api/auth/forgot-password`) | ✅ | ✅ | ✅ |
| Manage Company Settings (`PUT /api/company`) | ✅ | ❌ | ❌ |
| Create HR Login (`POST /api/users/hr`) | ✅ | ❌ | ❌ |
| Deactivate / Reset Any User (`/api/users/*`) | ✅ | ❌ | ❌ |
| Employee CSV Export & Import (`/api/employees/*`) | ✅ | ✅ | ❌ |
| Register / Update Employee | ✅ | ✅ | ❌ |
| Employee 360 Profile View | ✅ | ✅ | ✅ (Own record only) |
| Approve / Reject Leaves | ✅ | ✅ | ❌ |
| Cancel Pending Leave | ✅ | ✅ | ✅ (Own request only) |
| Web & Kiosk Attendance Punch-in | ✅ | ✅ | ✅ |
| Run & Finalize Payroll (`/api/payroll/*`) | ✅ | ✅ | ❌ |
| Download Personal Payslip PDF | ✅ | ✅ | ✅ (Own payslips only) |
| Post Announcements | ✅ | ✅ | ❌ |

### 3. Data Scoping Protection
Employees requesting list routes (`GET /api/employees`, `GET /api/leaves`, `GET /api/attendance/history`) automatically trigger the database scope guard `checkEmployeeDataScope`. The server transparently rewrites queries to filter by `employee_id = req.user.employeeId`, making horizontal privilege escalation structurally impossible.

---

## 6. Complete API Endpoints Catalog

### Authentication & Setup
- `GET /api/setup/status`: Public. Returns `{ needsSetup: boolean, initialized: boolean }`.
- `POST /api/setup`: Public (empty DB only). Creates company and first admin. Returns 409 if already initialized.
- `POST /api/auth/login`: Public. Validates credentials with bcrypt, returns JWT and user profile.
- `POST /api/auth/forgot-password`: Public. Recovers password by email or employee code. Returns temp password with forced change flag.
- `POST /api/auth/change-password`: Authenticated. Updates password and clears `must_change_password`.
- `GET /api/auth/me`: Authenticated. Returns authenticated session profile.

### Users & Administration (Admin Only)
- `GET /api/users`: Lists all system accounts.
- `POST /api/users/hr`: Registers an HR manager login.
- `PUT /api/users/:id/status`: Suspends (`inactive`) or reactivates (`active`) a user account.
- `POST /api/users/:id/reset-password`: Resets a user's password to a fresh temporary password.

### Organization & Policies
- `GET /api/company`: Returns company office hours and geofence parameters.
- `PUT /api/company`: Updates name, office start, grace period, weekend days, and GPS/geofence settings (Admin).
- `GET /api/departments`: Lists departments.
- `POST /api/departments`: Creates department (Admin/HR).
- `DELETE /api/departments/:id`: Deletes department (Admin).
- `GET /api/leave-types`: Lists leave types & quotas.
- `POST /api/leave-types`: Creates leave type (Admin).
- `DELETE /api/leave-types/:id`: Deletes leave type (Admin).
- `GET /api/holidays`: Lists public holidays.
- `POST /api/holidays`: Creates holiday (Admin).
- `DELETE /api/holidays/:id`: Deletes holiday (Admin).

### Employees
- `GET /api/employees/next-code`: Returns next incremental code (e.g. `EMP003`).
- `GET /api/employees`: Search & filter employee directory (Scoped).
- `POST /api/employees`: Registers employee with temporary password (Admin/HR).
- `GET /api/employees/:id`: Returns single employee details.
- `PUT /api/employees/:id`: Updates employee record (Admin/HR).
- `GET /api/employees/:id/360`: Aggregates 360-degree attendance, leave, payroll, and audit data.
- `GET /api/employees/export/csv`: Streams full employee roster as CSV.
- `POST /api/employees/import/csv`: Validates CSV (`dry_run: true`) or executes atomic import (`dry_run: false`).

### Attendance
- `GET /api/attendance/my-today`: Returns today's attendance record for active user.
- `POST /api/attendance/check-in`: Server-authoritative check-in with Geofence and Haversine distance verification.
- `POST /api/attendance/check-out`: Punches out and calculates duration and half-day status.
- `GET /api/attendance/history`: Returns attendance history (Scoped).
- `POST /api/attendance/enroll-face`: Enrolls 128-float face embedding (Admin/HR).

### Leaves
- `GET /api/leaves`: Lists leave requests (Admin/HR sees all, Employee sees own).
- `GET /api/leave/my-balance`: Returns remaining quota days per category.
- `POST /api/leaves`: Submits leave request. Returns HTTP 422 on quota exceed or date overlap.
- `POST /api/leaves/:id/cancel`: Cancels pending leave request.
- `PUT /api/leaves/:id/status`: Approves or rejects request. Requires non-empty review comment (Admin/HR).

### Payroll
- `GET /api/payroll/runs`: Lists historical payroll runs.
- `POST /api/payroll/generate`: Computes prorated draft payroll for month (`YYYY-MM`).
- `GET /api/payroll/runs/:id`: Detailed payslips breakdown of run.
- `POST /api/payroll/runs/:id/finalize`: Locks batch as immutable finalized payroll.
- `GET /api/payroll/payslip/:id/pdf`: Streams downloadable PDF payslip document.

### AI Assistant & Comms
- `POST /api/ai/chat`: Sends conversational query to Gemini 2.5 Flash with tool calling.
- `GET /api/announcements`: Lists company announcements.
- `POST /api/announcements`: Publishes new announcement (Admin/HR).
- `GET /api/notifications`: Retrieves user notifications.
- `PUT /api/notifications/:id/read`: Marks notification as read.
- `GET /api/audit-logs`: Retrieves filterable audit trail (Admin).

---

## 7. AI Assistant Architecture & Boundaries

```
User Prompt (Chat Input)
           │
           ▼
Express AI Route (`/api/ai/chat`)
           │
           ├─► Check Token & Role Claims
           │
           ├─► System Prompt Injection:
           │   - "You are HCM Lite Smart Assistant"
           │   - "STRICT RULE: Never disclose colleague salaries to employees"
           │   - "Enforce tool calling for balances and tax calculations"
           │
           ▼
Gemini 2.5 Flash (`@google/genai`)
           │
     Tool Selection (Function Calls)
     ├─ get_my_leave_balance ──► Queries DB for req.user.employeeId
     ├─ get_company_policies ──► Returns office start, grace mins, geofence
     ├─ calculate_tax_estimate ──► Runs FBR 2024 progressive tax formula
     └─ search_employees ──► Masks salary fields when caller is employee
           │
           ▼
Final Natural Language Response + Optional Smart Leave Form Card
```

---

## 8. Verification & Audit Results

| Module | Tested Feature | Status | Verification Note |
|---|---|:---:|---|
| **M1** | JWT login with bcrypt hash | ✅ DONE | Tested with salted hashes |
| **M1** | Three roles: ADMIN, HR, EMPLOYEE | ✅ DONE | Verified separate menus & guards |
| **M1** | Role guard on every API route | ✅ DONE | Enforced via `requireRole()` middleware |
| **M1** | Data scope guard on employee records | ✅ DONE | Scoped queries via `checkEmployeeDataScope` |
| **M1** | First-run setup: empty DB detection | ✅ DONE | Directs to setup wizard, 0 dummy rows |
| **M1** | Temporary password & forced reset | ✅ DONE | `must_change_password = 1` enforced |
| **M1** | Self-Service Forgot Password | ✅ DONE | Works by email or employee code |
| **M2** | Company settings & Geofencing | ✅ DONE | GPS lat/lng and 150m radius enforced |
| **M2** | Departments CRUD | ✅ DONE | Full CRUD with deletion cascade protection |
| **M2** | Leave types & yearly quotas | ✅ DONE | Configurable quotas per policy |
| **M2** | Public holidays CRUD | ✅ DONE | Dates excluded from absent days |
| **M2** | Admin HR creation & user status toggle | ✅ DONE | Tested `POST /users/hr`, toggle, reset |
| **M3** | HR register employee with auto credentials | ✅ DONE | Generates code and temp password |
| **M3** | Employee directory with search & filters | ✅ DONE | Real-time search and department filter |
| **M3** | Employee 360 profile view | ✅ DONE | Attendance, leaves, payslips, audit |
| **M3** | CSV Export | ✅ DONE | RFC-compliant CSV download |
| **M3** | CSV Import with dry-run error checking | ✅ DONE | Tested validation errors & atomic batch |
| **M4** | Server-authoritative timestamps | ✅ DONE | Generated strictly via server clock |
| **M4** | Duplicate punch returns HTTP 409 | ✅ DONE | Enforced by UNIQUE(employee_id, date) |
| **M4** | Status rules: late, half_day, absent | ✅ DONE | 09:15 late threshold, <5h half day |
| **M4** | Geofence rejection (>100m GPS or >radius)| ✅ DONE | HTTP 403 returned with distance in meters |
| **M4** | Biometric Facial Verification | ✅ DONE | Euclidean distance matching <= 0.55 |
| **M5** | Leave submit with balance deduction | ✅ DONE | Decrements remaining quota |
| **M5** | HTTP 422 on exceeding quota or overlap | ✅ DONE | Tested both conditions returning 422 |
| **M5** | Cancel pending leave request | ✅ DONE | Sets status to `cancelled` |
| **M5** | Mandatory HR review comment | ✅ DONE | Empty comment rejected with HTTP 400 |
| **M6** | Formulaic gross salary breakdown | ✅ DONE | 60% basic, 20% HRA, 10% med, 10% allow |
| **M6** | Absent, half-day, unpaid deductions | ✅ DONE | Per-day rate deductions applied |
| **M6** | FBR Progressive Annual Income Tax | ✅ DONE | Tested across 6 income slabs |
| **M6** | Draft preview and finalized lock | ✅ DONE | Finalized payroll locked as immutable |
| **M6** | PDF Payslip generation & download | ✅ DONE | Formatted PDF with breakdowns |
| **M7** | Admin & HR Dashboards | ✅ DONE | Analytics metrics and chart cards |
| **M7** | Employee Dashboard | ✅ DONE | 4 top cards, punch clock, calendar |
| **M8** | Gemini AI Assistant integration | ✅ DONE | Live chat with tool grounding |
| **M8** | Privacy boundary on employee salaries | ✅ DONE | AI refuses salary disclosure to colleagues |
| **M9** | Company announcements | ✅ DONE | Real-time broadcast banner |
| **M9** | In-app notification center | ✅ DONE | Unread counter and notification tray |
| **M9** | Centralized immutable audit logs | ✅ DONE | Detailed event timeline with IP logs |

---

## 9. Quickstart & Deployment Guide

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Run the application (Vite + Express on Port 3000)
npm run dev
```

### Production Build
```bash
# 1. Build client bundle
npm run build

# 2. Run production server
npm start
```

### Resetting to Fresh Setup Mode (For Demos / Testing)
To demonstrate the first-run setup wizard to evaluators:
```bash
# Delete existing sqlite database
rm -f data/hcm.sqlite

# Restart server
npm run dev
```
Open `http://localhost:3000` — the app will detect the empty database and present the **First-Run Setup Screen** requesting Company Name and Admin credentials.
