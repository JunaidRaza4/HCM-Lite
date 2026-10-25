# 🏢 HCM Lite - Human Capital Management System

Modern, full-stack Human Capital Management (HCM) application designed for enterprise workforce administration, attendance tracking, statutory leave management, automated payroll computation, executive analytics, and an integrated AI assistant powered by Google Gemini.

---

## 🚀 Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React icons, jsPDF (for client-side PDF payslip export)
- **Backend**: Node.js, Express, `tsx`, JWT Authentication, `bcryptjs` for secure password hashing
- **Database**: SQLite (persisted locally via `sql.js` with transaction isolation & audit logging)
- **AI Engine**: Google Gemini API via the official `@google/genai` TypeScript SDK with function calling, structured extraction, and strict policy guardrails

---

## ✨ Features & Modules

### 1. ⚙️ First-Run Setup & Role-Based Access Control (RBAC)
- **Zero-Config First Run**: Automatically detects if the organization is uninitialized and launches the Setup Wizard.
- **Three Core Roles**:
  - 👑 **Administrator**: Full organizational authority, policy configuration, payroll finalization & locking, executive analytics, audit logs.
  - 🧑‍💼 **HR Manager**: Employee onboarding & roster, daily attendance board, leave review & approvals, attendance correction inbox, payroll draft generation.
  - 👤 **Employee**: Clock-in/out punch card, monthly attendance calendar, leave balance inspection & requests, correction submissions, payslip review with PDF download, and AI chat.
- **Security**: Mandatory password change prompt for temporary passwords or flagged first-time logins.

### 2. ⏱️ Attendance Management & Camera Face Check-In (M4 Bonus)
- **Digital Punch Card**: Real-time clock with office shift schedule (09:00 AM) and grace period (15 mins). Automatically marks check-ins after 09:15 as **Late**.
- **📷 Camera Face Attendance (Web-Only, 6-Step Flow)**:
  1. **Open Front Camera**: Live browser viewfinder via `navigator.mediaDevices.getUserMedia`.
  2. **Detect Single Face**: Uses `@vladmandic/face-api` (TinyFaceDetector, 68 Landmarks, FaceRecognitionNet). Exactly **ONE** face must be present. Rejects with clear message on 0 faces or 2+ faces in frame.
  3. **Liveness Motion Verification**: Prompts user to turn head slightly left/right. Compares landmark nose deviation relative to facial width to confirm a live human and reject printed photos/spoofs.
  4. **Acquire GPS Telemetry**: Fetches `lat`, `lng`, and `accuracy` via `navigator.geolocation`.
  5. **Server Verification (Zero-Photo Privacy)**: Transmits only mathematical face embeddings (descriptor vectors) and coordinates — **never stores or uploads user photos**. Server computes Haversine formula distance from the configured office coordinates. Rejects if distance $> 150$m or GPS accuracy $> 100$m. Always stamps server time.
  6. **Record Persistence**: Creates attendance record tagged with `source='camera'`, `face_verified=1`, and distance metrics.
  - **Graceful Fallback**: If camera permission is blocked or unavailable, seamlessly offers one-click standard web check-in.
- **Monthly Attendance Calendar**: Color-coded calendar showing Present (green), Late (amber), Absent (red), On Leave (blue), Weekend (gray), Missing Checkout (orange), and Half Day (purple). Clicking any date tile opens the Day Inspector with times and a one-click correction trigger.
- **Attendance Corrections**: Employees can submit time correction requests; HR/Admin review and approve/reject them in a dedicated inbox.

### 3. 🌴 Leave Management & Statutory Quotas
- **Configurable Leave Types**: Default statutory quotas (Annual: 14 days, Sick: 8 days, Casual: 10 days) or custom categories.
- **Live Balances**: Real-time Quota, Used, Pending, and Remaining balances.
- **Approval Workflow**: HR and Admin review requests with employee leave balance context and approve or reject with instant notification dispatch.

### 4. 💵 Payroll Lite (Module M6)
- **Salary Formula**:
  - $\text{Gross} = 1.5 \times \text{Basic Salary}$
  - $\text{HRA} = 40\% \text{ of Basic}$
  - $\text{Medical} = 10\% \text{ of Basic}$
  - $\text{Allowances} = \text{Remaining}$
- **Monthly Draft Runs**: HR creates draft payroll runs for any month (`YYYY-MM`).
- **Server-Side Computations**:
  - $\text{Per-Day Rate} = \text{Gross} \div \text{Working Days}$ (skips weekends and public holidays).
  - Deductions: 1 day per Absent day, 1 day per Unpaid leave day, 0.5 day per Half day.
  - Prorated for mid-month joiners or exits.
  - **Annual Tax Slabs**:
    - $0 - 600,000 \rightarrow 0\%$
    - $600\text{k} - 1,200,000 \rightarrow 5\%$
    - $1.2\text{M} - 2,400,000 \rightarrow 30,000 + 15\%$
    - $2.4\text{M} - 3,600,000 \rightarrow 210,000 + 25\%$
    - $\text{Above } 3,600,000 \rightarrow 510,000 + 35\%$
    - Monthly Tax = $\text{Annual Tax} \div 12$.
- **Admin Finalization & Locking**: ONLY Admin can finalize payroll runs. Finalized runs are permanently locked (returns `409 Conflict` if re-run is attempted).
- **PDF Payslips**: Employees view their finalized payslips and download crisp, formatted PDF documents with single-click PDF generation via `jsPDF`.

### 5. 📊 Dashboards & Analytics (Module M7)
- **Universal Attendance Rate Formula**:
  $$\text{Attendance Rate} = \frac{\text{present} + \text{late} + \text{missing\_checkout} + 0.5 \times \text{half\_day}}{\text{working\_day records} - \text{on\_leave days}} \times 100$$
- **HR Dashboard KPIs**: Headcount, Present today, On leave today, Late today, Pending approvals, 30-day attendance trend, Absenteeism by department, Leave utilization per type, and Top 5 late-comers this month.
- **Admin Dashboard KPIs**: Headcount, Attrition Rate, Payroll Cost (Gross **AND** Net), Average Salary, Headcount by Department, Payroll Cost by Department, and Security Audit feed.
- **Employee Dashboard KPIs**: Weekly hours worked vs 40h target (with visual progress bar), Late count this month, Leave balance per type, and Last finalized payslip amount.

### 6. 🤖 AI Assistant (Module M8)
- Accessible to all roles via floating panel.
- Backend routes: `POST /ai/chat` & `POST /api/ai/chat` using `@google/genai`.
- **Integrated Tools**: Uses the exact service functions as REST endpoints (`get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`).
- **Smart Leave Application**: Natural language input (e.g. *"I need Monday and Tuesday off for my sister's wedding"*) extracts structured JSON and renders a **pre-filled leave form** directly in chat for user confirmation.
- **Policy Q&A**: Answers strictly from grounded business rules; answers *"I don't know"* if a policy is not in the rules.
- **Guardrails**:
  - Rate limiting (~20 requests per user per hour).
  - 15-second timeout with friendly fallback message.
  - Strict security refusal if an employee asks for a colleague's salary.
  - Every response carries an "AI-generated" badge and is logged in `ai_logs`.

### 7. 📢 Comms & Notifications (Module M9)
- **Announcements**: Admin and HR post announcements displayed across all user dashboards.
- **In-App Notifications**: Bell icon with unread count in Navbar. Real-time notifications for:
  - Leave approved or rejected.
  - Attendance correction approved or rejected.
  - Payslip generated (when payroll is finalized).

---

## 🛠️ Kaise Run Karein (Local Setup)

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- npm or bun

### 2. Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd <repo-folder>

# Install dependencies
npm install
```

### 3. AI Key Kahan Lagaye (Environment Variables)
Create a `.env` file in the root directory (copied from `.env.example`):

```bash
cp .env.example .env
```

Add your Google Gemini API key inside `.env`:
```env
AI_API_KEY="YOUR_GEMINI_API_KEY_HERE"
GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"
PORT=3000
```
> **Security Note:** The API key is accessed strictly on the server side (`server/services/aiService.ts`). The `.env` file is included in `.gitignore` and must never be committed to public GitHub repositories.

### 4. Start Development Server
```bash
npm run dev
```
Open your browser at: **`http://localhost:3000`**

---

## 👤 Pehla Admin Kaise Banaye (First-Run Setup)

1. Open `http://localhost:3000` in your browser.
2. If no company exists in the database, the **First-Run Setup Wizard** will appear automatically.
3. Enter:
   - **Company Name** (e.g. Acme Corporation)
   - **Office Shift Start Time** (e.g. `09:00`)
   - **Grace Period** in minutes (e.g. `15`)
   - **Weekend Days** (e.g. `Saturday,Sunday`)
   - **Initial Administrator Name** (e.g. Admin User)
   - **Admin Email** (e.g. `admin@company.com`)
   - **Admin Password** (minimum 6 characters)
4. Click **Complete Setup**.
5. Log in with your new Administrator account. Default statutory leave types and standard departments are initialized automatically.

---

## 🧪 Testing Checklist (For Evaluators & Judges)

1. **Employee Flow**:
   - HR logs in $\rightarrow$ creates an employee (e.g. Basic Salary: \$6,000).
   - Log in as the Employee $\rightarrow$ punch in/out on the digital punch card $\rightarrow$ apply for leave.
2. **Leave Approval**:
   - HR logs in $\rightarrow$ reviews pending leave $\rightarrow$ clicks **Approve**.
   - Notice the employee receives an in-app notification bell update.
3. **Monthly Payroll Draft (M6)**:
   - HR navigates to **Payroll Lite** $\rightarrow$ selects month $\rightarrow$ clicks **Run Monthly Draft**.
   - Verify numbers: Gross = $1.5 \times 6,000 = \$9,000$. Deductions calculated per day.
4. **Admin Finalization & Lock**:
   - Admin logs in $\rightarrow$ reviews draft $\rightarrow$ clicks **Finalize & Lock Payroll**.
   - Run status changes to `FINALIZED`.
   - Attempting to re-run the same month correctly returns `409 Conflict`.
5. **Employee Payslip & PDF**:
   - Employee logs in $\rightarrow$ visits **My Payslips & PDF** $\rightarrow$ clicks **View & Download PDF** $\rightarrow$ receives a formatted PDF payslip.
6. **Analytics Matching (M7)**:
   - Admin & HR Analytics tabs show matching headcount, attendance trends, and payroll costs.
7. **AI Assistant Testing (M8)**:
   - Click floating **Ask AI Assistant** button.
   - Ask: *"How many active employees do we have?"* $\rightarrow$ returns headcount matching dashboard.
   - Ask: *"What is John's salary?"* $\rightarrow$ politely refuses and protects salary privacy.
   - Type: *"I need Monday and Tuesday off for my sister's wedding"* $\rightarrow$ pre-fills a leave form for confirmation.

---

## 🚢 Deployment Guide

### Deploying to Render
1. Create a new **Web Service** on Render connected to your GitHub repository.
2. Configure settings:
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. In **Environment Variables**:
   - Add `AI_API_KEY`: `<Your Gemini API Key>`
   - Add `NODE_ENV`: `production`
   - Add `PORT`: `3000`
4. Deploy service!
