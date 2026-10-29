# Saylani Hackathon — HCM Lite Project Presentation Deck & Pitch Script

---

## Slide 1: Title & Executive Summary
- **Project Name:** HCM Lite (Enterprise Human Capital Management & Biometric Automation)
- **Event:** Saylani Hackathon 2026
- **Architecture:** React 19 + Node.js 22 + Python 3 Microservice + SQLite
- **Presenter Pitch:**
  > "Honorable judges, welcome to HCM Lite. Scaling businesses in Pakistan struggle with fragmented HR tools, proxy attendance ("buddy punching"), and manual payroll errors. HCM Lite solves this with an enterprise-grade, privacy-first platform featuring real facial biometric vector verification, mathematical geofencing, Pakistani FBR 6-tier progressive tax calculation, and multi-tier role-based access control — all engineered with zero mock placeholders and zero pre-seeded dummy data."

---

## Slide 2: Problem Statement & Innovation
- **The Core Challenges:**
  1. **Proxy Clock-ins & Ghost Attendance:** Traditional card or password check-ins suffer from buddy punching.
  2. **Biometric Privacy Liabilities:** Storing employee facial photos on cloud servers violates modern data privacy standards.
  3. **Location Spoofing:** Employees punch in from home using fake GPS apps or web dev tools.
  4. **Complex Tax Compliance:** Computing Pakistani FBR tax slabs across prorated salaries with unapproved leaves is prone to human error.
- **Our Innovative Solution:**
  - Client-side neural feature extraction storing **only 128-float mathematical vectors** — zero facial images stored.
  - Check-out verifies facial identity against check-in vector using **Euclidean distance matching ($\le 0.55$)**.
  - **Haversine spherical trigonometry** location guard enforcing office proximity ($\le 150\text{m}$) and rejecting weak GPS ($\text{accuracy} > 100\text{m}$).

---

## Slide 3: Languages & Dual-Stack Architecture
- **Languages Used:**
  - **TypeScript / JavaScript:** Strict typing across React 19 frontend and Node.js backend.
  - **Python 3:** Computational microservice in `python_backend/app.py` implementing vector matching algorithms, geofence formulas, and FBR tax logic.
  - **SQL:** Pure SQL queries with strict referential integrity (`PRAGMA foreign_keys = ON;`).
  - **CSS:** Tailwind CSS v4 modern utility design system with native dark/light theme support.
- **Architectural Diagram:**
  ```
  [ React 19 SPA (Client) ] ──HTTP/REST──> [ Express Server (Port 3000) ] ──> [ SQLite: data/hcm.sqlite ]
                                           [ Python Microservice (app.py) ]
  ```

---

## Slide 4: Database Engine & Data Storage
- **Database Engine:** Embedded SQLite via `sql.js` (WebAssembly/Node) and Python `sqlite3`.
- **Data Storage Location:** Persisted locally on server disk at `/data/hcm.sqlite`.
- **Zero Pre-Loaded Dummy Data:**
  - The app begins with an empty database.
  - On first boot, the system detects an empty DB and routes straight to the **First-Run Setup Wizard**.
  - No dummy employees, no fake departments, no pre-seeded leave records — clean slate for real organizations.
- **ACID Transactions:**
  - Setup provisioning, payroll runs, and correction approvals execute within atomic database transactions (`db.transaction()`).

---

## Slide 5: Deployment & Production Hosting
- **Unified Port 3000:** The Node.js Express server serves both the RESTful API endpoints and the static production React SPA on port 3000.
- **Zero External DB Dependency:** Uses embedded SQLite, eliminating complex database setup, cloud VPC latency, or hosted DB bills.
- **Containerization Ready:** Multi-stage `Dockerfile` (`node:22-alpine` + `python:3.10-slim`) for one-command deployment on Docker, Google Cloud Run, AWS EC2, or VPS.
- **Security Headers & Secrets:** Environment variables strictly segregated in `.env` with client-safe `VITE_` prefixes.

---

## Slide 6: Biometric Facial Vector Matching (Zero Raw Photos)
- **Neural Model:** SSD MobileNet + 68 Facial Landmark Detector + 128-dimensional Neural Descriptor.
- **Privacy By Design:**
  - Camera captures video stream locally inside the user's browser.
  - Face landmarks are extracted into a **128-element floating point array** (e.g., `[-0.142, 0.089, 0.215, ...]`).
  - **No JPEG, PNG, or video frames are sent to or saved on the server.**
- **Check-Out Verification:**
  - Evening check-out scans the face and extracts a new vector.
  - The server calculates the Euclidean distance between check-in and check-out vectors:
    $$d = \sqrt{\sum_{i=1}^{128} (v_{\text{in}}[i] - v_{\text{out}}[i])^2}$$
  - **Threshold Rule:** If $d \le 0.55$, check-out is approved. If $d > 0.55$, check-out is **strictly rejected** (HTTP 403: "Face verification failed on check-out").

---

## Slide 7: Geofenced Location Enforcement & Auto-Detection
- **Setup GPS Auto-Detection:**
  - During First-Run Setup, the company owner can click **"📍 Detect Current Location"** to automatically populate office latitude and longitude via device GPS.
- **Mathematical Haversine Formula:**
  - Computes great-circle distance between office coordinates and punch coordinates:
    $$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$
    $$d = 2 R \arcsin(\sqrt{a})$$
- **Anti-Spoofing Rules:**
  - If GPS accuracy $> 100\text{m}$, punch is rejected (*"GPS accuracy too low. Try again outdoors."*).
  - If distance $>$ office radius (default $150\text{m}$), punch is rejected (*"You are Xm away from office. Allowed radius: 150m."*).

---

## Slide 8: Personal Security Questions & Strong Password Recovery
- **Personal Security Question:**
  - Configured during setup: *"What was the brand or model of your first mobile phone?"* (or personal questions like childhood city/pet).
- **Self-Service 2-Step Recovery Flow:**
  - Step 1: User enters email or Employee Code (e.g. `EMP001`).
  - Step 2: System fetches and displays their personal security question.
  - Step 3: User answers the question and supplies a new password.
  - Step 4: Answer is verified case-insensitively; upon match, password updates instantly.
- **Strong Password Enforcement:**
  - RegEx: `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=~/\[\]]).{8,}$`
  - Real-time warning: *"Use strong password: minimum 8 characters, including uppercase, lowercase, number, and special character."*

---

## Slide 9: Role-Based Access Control & Pakistani FBR Payroll
- **Three-Tier Access Separation:**
  1. **ADMIN:** Organization settings, HR account management, location radius, immutable audit logs.
  2. **HR MANAGER:** Employee directory, leave approval, daily attendance board, batch payroll calculation.
  3. **EMPLOYEE:** Daily punch-in/out, personal leave calendar, payslip downloads, correction inbox.
- **Horizontal Data Guard:** Server-enforced middleware ensures employees can only access their own records.
- **Pakistani FBR 6-Tier Tax Engine:**
  - 0% up to PKR 600,000/yr.
  - 5% exceeding 600k (PKR 600k – 1.2M).
  - PKR 30k + 15% exceeding 1.2M (PKR 1.2M – 2.2M).
  - PKR 180k + 25% exceeding 2.2M (PKR 2.2M – 3.2M).
  - PKR 430k + 30% exceeding 3.2M (PKR 3.2M – 4.1M).
  - PKR 700k + 35% exceeding 4.1M.
- **Unpaid Leave Proration:** Automatically computes deductions based on working days and unapproved absences.
- **Downloadable PDF Payslips:** Itemized tax, allowances, and net pay generated client-side using `jsPDF`.

---

## Slide 10: Live Demonstration Script for Judges
1. **First-Run Setup:** Open app on clean DB $\rightarrow$ First-Run Setup appears $\rightarrow$ Click *"📍 Detect Current Location"* $\rightarrow$ Set Admin credentials + Personal Security Question $\rightarrow$ Organization created with zero dummy clutter.
2. **HR Login & Department/Employee Registration:** Admin logs in $\rightarrow$ Creates Department & HR login $\rightarrow$ HR registers employee with custom salary $\rightarrow$ Temporary credentials generated.
3. **Biometric Face Vector Check-In:** Employee logs in $\rightarrow$ Opens Camera modal $\rightarrow$ Live face scan extracts 128-float vector $\rightarrow$ Geofence validates coordinates $\rightarrow$ Checked in successfully.
4. **Biometric Verification on Check-Out:** Employee checks out $\rightarrow$ System computes Euclidean distance against check-in vector $\rightarrow$ Approves only when identity matches ($\le 0.55$).
5. **Forgot Password Recovery:** Logout $\rightarrow$ Click *"Forgot password?"* $\rightarrow$ Enter email $\rightarrow$ Security question appears $\rightarrow$ Answer question $\rightarrow$ Strong password check validates new password $\rightarrow$ Instant auto-fill and sign in.
6. **Payroll & FBR Tax:** HR generates monthly payroll $\rightarrow$ FBR tax slab applied accurately $\rightarrow$ Download PDF payslip.
7. **Presentation & PDF Export:** Click *"Presentation & PDF"* in top navigation bar $\rightarrow$ View interactive slides $\rightarrow$ Click *"Download PDF Presentation"* to export the complete multi-page PDF document.
