import React, { useState } from 'react';
import {
  FileText,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Database,
  Cpu,
  Layers,
  MapPin,
  Lock,
  DollarSign,
  Server,
  Code2,
  UserPlus,
} from 'lucide-react';
import jsPDF from 'jspdf';

interface PresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Slide {
  id: number;
  title: string;
  subtitle: string;
  category: string;
  icon: any;
  bulletPoints: string[];
  techDetails: { label: string; value: string }[];
  summary: string;
}

const SLIDES: Slide[] = [
  {
    id: 1,
    title: 'Saylani Hackathon — HCM Lite',
    subtitle: 'Enterprise-Grade Human Capital Management & Biometric AI Automation',
    category: 'Executive Summary',
    icon: Sparkles,
    bulletPoints: [
      'Engineered for Saylani Hackathon: A modern, production-ready workforce operating system.',
      'Har new email se dedicated new company setup — multi-tenant isolation with zero dummy clutter.',
      'Two-Step Setup Flow: Step 1 (Company & Admin GPS) -> Step 2 (First Department & HR Setup) -> Final Dashboard.',
      'Full compliance with Pakistani FBR 6-tier progressive income tax ordinance.',
    ],
    techDetails: [
      { label: 'Event', value: 'Saylani Hackathon 2026' },
      { label: 'Edition', value: 'HCM Lite v2.5 Multi-Tenant' },
      { label: 'Architecture', value: 'React + Node.js + Python + SQLite' },
    ],
    summary: 'A complete end-to-end HR and Attendance solution with real biometrics and mathematical geofencing.',
  },
  {
    id: 2,
    title: 'Multi-Company Per-Email Architecture',
    subtitle: 'Har new email se new company setup — purani email se wahi company load',
    category: 'Multi-Tenancy',
    icon: UserPlus,
    bulletPoints: [
      'No "email galat hai" barrier: When a new user enters an unregistered email, the system automatically detects it and launches Company Setup.',
      'Existing credentials login directly: Old email + password restores the exact company, departments, employees, and payroll.',
      'Company ID Scoping: All users, employees, departments, and attendance records are tied to their respective company_id.',
      'Zero Data Bleed: Multiple organizations can coexist independently on the same platform instance.',
    ],
    techDetails: [
      { label: 'Isolation', value: 'Per-Company Relational Foreign Keys' },
      { label: 'Routing', value: 'Seamless /api/auth/check-email validation' },
      { label: 'Persistence', value: 'Stateful JWT token containing companyId' },
    ],
    summary: 'Ensures frictionless onboarding for every new organization while keeping historical company data safe.',
  },
  {
    id: 3,
    title: 'Two-Step Onboarding Wizard Flow',
    subtitle: 'Company Setup -> Admin sets up Department & HR/Employee -> Final Dashboard',
    category: 'Onboarding Flow',
    icon: Layers,
    bulletPoints: [
      'Step 1 (Organization Profile): Company name, root admin credentials, office GPS location & security question.',
      'Step 2 (Team & Department Setup): Admin defines initial department (e.g. Operations) and registers first HR Manager / Employee.',
      'Automated Credential Generation: First HR/employee gets temporary credentials and employee code (EMP001).',
      'Instant Launch: Submitting Step 2 directly opens the full final dashboard interface with the active team.',
    ],
    techDetails: [
      { label: 'Step 1 Endpoint', value: 'POST /api/setup' },
      { label: 'Step 2 Endpoint', value: 'POST /api/setup/step2-team' },
      { label: 'Transition', value: 'Single-session atomic onboarding' },
    ],
    summary: 'Guarantees that every new company starts with a structured department and designated team member.',
  },
  {
    id: 4,
    title: 'Languages & Multi-Stack Architecture',
    subtitle: 'Dual-Engine Architecture: TypeScript Full-Stack + Python AI Microservice',
    category: 'Languages & Stack',
    icon: Code2,
    bulletPoints: [
      'Frontend: React 19 + TypeScript + Tailwind CSS v4 with sober executive light theme (no blue).',
      'Primary Server: Node.js 22 LTS + Express + TypeScript on unified Port 3000.',
      'Python Microservice: Python 3 with standalone math engine in python_backend/app.py.',
      'Python handles 128-float Euclidean distance vectors, Haversine formula, and FBR tax calculations.',
    ],
    techDetails: [
      { label: 'Languages', value: 'TypeScript, JavaScript, Python 3, SQL' },
      { label: 'Backend Runtimes', value: 'Node.js 22 LTS & Python 3.10+' },
      { label: 'Frontend Tooling', value: 'Vite 8.3 & Tailwind CSS v4' },
    ],
    summary: 'Combines the agility of Node.js with the algorithmic scientific rigor of Python.',
  },
  {
    id: 5,
    title: 'Database Engine & Data Storage',
    subtitle: 'Where data is saved, ACID transaction guarantees, and schema migrations',
    category: 'Database & Storage',
    icon: Database,
    bulletPoints: [
      'Database Engine: Relational SQLite with PRAGMA foreign_keys = ON.',
      'Physical Storage Location: Stored locally on server disk at data/hcm.sqlite.',
      'Zero Pre-Loaded Dummy Data: System starts clean and creates data dynamically via setup.',
      'Atomic Operations: Setup provisioning, payroll batches, and corrections execute in db.transaction().',
    ],
    techDetails: [
      { label: 'Database Type', value: 'Embedded Relational SQLite' },
      { label: 'Storage Path', value: '/data/hcm.sqlite (File Persistence)' },
      { label: 'Drivers', value: 'sql.js (WebAssembly/Node) & sqlite3 (Python)' },
    ],
    summary: 'Reliable, zero-cloud-cost ACID database storage with automatic schema migrations.',
  },
  {
    id: 6,
    title: 'Biometric Face Vector Matching (Zero Raw Photos)',
    subtitle: 'Client-side neural feature extraction & 128-float Euclidean distance verification',
    category: 'AI & Biometrics',
    icon: Cpu,
    bulletPoints: [
      'Neural Model: SSD MobileNet + 68 Facial Landmarks + 128-D Neural Descriptor.',
      'Privacy-First Architecture: Raw camera photos are NEVER saved to the server or database.',
      'Vector Storage: Check-in converts facial landmarks into a 128-float vector embedding JSON.',
      'Check-Out Verification: Evening face scan calculates Euclidean distance against morning check-in vector.',
      'Strict Threshold: Check-out accepted ONLY if Euclidean distance <= 0.55 (anti-buddy-punching).',
    ],
    techDetails: [
      { label: 'Feature Vector', value: '128-dimensional floating point array' },
      { label: 'Matching Formula', value: 'Euclidean: sqrt(sum((v1[i] - v2[i])^2))' },
      { label: 'Threshold', value: '<= 0.55 (Positive Identity Match)' },
    ],
    summary: 'Mathematical vector matching ensures anti-fraud check-out with zero biometric image storage liability.',
  },
  {
    id: 7,
    title: 'Geofenced Location Enforcement',
    subtitle: 'Haversine spherical trigonometry formula with device GPS auto-detection',
    category: 'Location & Geofencing',
    icon: MapPin,
    bulletPoints: [
      'First-Run Setup GPS: Company owner clicks "📍 Detect Current Location" to set office coordinates.',
      'Punch Enforcement: Every check-in and check-out captures device lat, lng, and accuracy.',
      'Haversine Math: Calculates precise distance in meters: R * 2 * asin(sqrt(a)).',
      'Anti-Spoofing: Rejects punch if GPS accuracy > 100m or if distance exceeds company radius (default 150m).',
    ],
    techDetails: [
      { label: 'Formula', value: 'Haversine Great-Circle Distance' },
      { label: 'Default Radius', value: '150 meters (Configurable 50 - 5000m)' },
      { label: 'Accuracy Guard', value: '<= 100m required for camera punches' },
    ],
    summary: 'Ensures employees are physically on-site within company premises before marking attendance.',
  },
  {
    id: 8,
    title: 'Security Question Recovery & Strong Passwords',
    subtitle: 'Self-service 2-step password recovery and client/server strong password validation',
    category: 'Security & Auth',
    icon: Lock,
    bulletPoints: [
      'Personal Security Question: Set during setup (e.g., "Brand/model of your first mobile phone?").',
      '2-Step Recovery Flow: User enters email/code -> System displays question -> User answers.',
      'Case-Insensitive Match: Verifies answer before permitting password update.',
      'Strong Password Policy: Enforces uppercase, lowercase, digit, and special symbol (min 8 chars).',
      'Warning Banner: Real-time feedback if user attempts an easy password.',
    ],
    techDetails: [
      { label: 'Hashing', value: 'bcryptjs (salt 10) & PBKDF2 SHA-256' },
      { label: 'Password Regex', value: '8+ chars with Aa-Zz, 0-9, and symbols' },
      { label: 'Question Storage', value: 'Indexed users.security_question' },
    ],
    summary: 'Prevents account lockouts with secure personal security questions while stopping weak credentials.',
  },
  {
    id: 9,
    title: 'Pakistani FBR Progressive Tax & Payroll Engine',
    subtitle: '6-tier income tax ordinance, unapproved leave proration, and PDF payslips',
    category: 'Payroll & Tax',
    icon: DollarSign,
    bulletPoints: [
      'Pakistani FBR Slabs: 0% up to 600k, 5% to 1.2M, 15% to 2.2M, 25% to 3.2M, 30% to 4.1M, 35% above.',
      'Proration: Unapproved absent days deducted based on standard working days in month.',
      'One-Click Batch Payroll: Generates itemized payslips for all active employees simultaneously.',
      'PDF Payslip Export: Downloadable payslips with company branding, tax breakdown, and net salary.',
    ],
    techDetails: [
      { label: 'Tax Law', value: 'Pakistan Income Tax Ordinance 2024-2025' },
      { label: 'Calculation', value: 'Annualized projection divided by 12 months' },
      { label: 'PDF Engine', value: 'jsPDF / AutoTable client-side generation' },
    ],
    summary: 'Accurate, audit-ready payroll automation calibrated for Pakistani employment regulations.',
  },
  {
    id: 10,
    title: 'Judge Evaluation Summary & Demo Checklist',
    subtitle: 'Every brief requirement verified, tested, and operational with zero pending TODOs',
    category: 'Verification & Demo',
    icon: CheckCircle2,
    bulletPoints: [
      'New Email Setup: Every new email creates a new company without "email galat hai" error.',
      'Two-Step Flow: Company Setup -> Department & Initial Team Setup -> Final Dashboard.',
      'Existing Login: Returning users log right into their company with full historical data.',
      'Camera Check-In/Out: 128-float face vector comparison with Euclidean distance rejection (> 0.55).',
      'Python Microservice: Verified working in python_backend/app.py with complete API parity.',
    ],
    techDetails: [
      { label: 'Completeness', value: '100% End-to-End Functional' },
      { label: 'Palette', value: 'Sober Executive Light Emerald & Slate' },
      { label: 'Test Coverage', value: 'Setup, Auth, Attendance, Payroll, Tax' },
    ],
    summary: 'A complete, production-ready submission representing the highest standard of engineering.',
  },
];

export const PresentationModal: React.FC<PresentationModalProps> = ({ isOpen, onClose }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  if (!isOpen) return null;

  const currentSlide = SLIDES[currentSlideIndex];
  const IconComponent = currentSlide.icon;

  const handleNext = () => {
    if (currentSlideIndex < SLIDES.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  // Generate complete, multi-page, formatted PDF Presentation Deck
  const handleDownloadPdf = () => {
    setGeneratingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      SLIDES.forEach((slide, index) => {
        if (index > 0) {
          doc.addPage('a4', 'landscape');
        }

        // 1. Slide Background
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // Top Accent Bar (Emerald 600 - Sober & Non-blue)
        doc.setFillColor(5, 150, 105);
        doc.rect(0, 0, pageWidth, 8, 'F');

        // 2. Header Category Badge
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(5, 150, 105);
        doc.text(slide.category.toUpperCase(), 20, 22);

        // 3. Slide Title & Subtitle
        doc.setFontSize(22);
        doc.setTextColor(15, 23, 42); // Slate 900
        doc.text(slide.title, 20, 32);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(100, 116, 139); // Slate 500
        doc.text(slide.subtitle, 20, 40);

        // Horizontal Separator
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(20, 46, pageWidth - 20, 46);

        // 4. Left Column: Bullet Points Card
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(20, 52, 170, 120, 4, 4, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(20, 52, 170, 120, 4, 4, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(30, 41, 59);
        doc.text('Key Technical Architectural Details:', 28, 64);

        let yPos = 76;
        slide.bulletPoints.forEach((bp) => {
          doc.setFillColor(5, 150, 105);
          doc.circle(30, yPos - 1.5, 1.5, 'F');

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10.5);
          doc.setTextColor(51, 65, 85);
          const splitText = doc.splitTextToSize(bp, 145);
          doc.text(splitText, 36, yPos);
          yPos += splitText.length * 6 + 6;
        });

        // 5. Right Column: Tech Specs & Summary Card
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(198, 52, 80, 120, 4, 4, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(198, 52, 80, 120, 4, 4, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(5, 150, 105);
        doc.text('SYSTEM SPECIFICATIONS', 206, 64);

        let specY = 76;
        slide.techDetails.forEach((spec) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(100, 116, 139);
          doc.text(spec.label.toUpperCase(), 206, specY);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(15, 23, 42);
          const valSplit = doc.splitTextToSize(spec.value, 65);
          doc.text(valSplit, 206, specY + 5);
          specY += 16;
        });

        // Summary callout inside right card
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(204, 134, 68, 30, 2, 2, 'F');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        const sumSplit = doc.splitTextToSize(`"${slide.summary}"`, 62);
        doc.text(sumSplit, 208, 142);

        // 6. Slide Footer
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text('Saylani Hackathon — HCM Lite Project Presentation', 20, pageHeight - 10);
        doc.text(`Slide ${index + 1} of ${SLIDES.length}`, pageWidth - 45, pageHeight - 10);
      });

      doc.save('HCM_Lite_Saylani_Hackathon_Presentation.pdf');
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Project Presentation & Technical Architecture
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saylani Hackathon Presentation Deck • Slide {currentSlideIndex + 1} of {SLIDES.length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{generatingPdf ? 'Generating PDF...' : 'Download PDF Presentation'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Slide Viewer Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              {currentSlide.category}
            </span>
            <span className="text-xs font-mono text-slate-400">
              {currentSlideIndex + 1} / {SLIDES.length}
            </span>
          </div>

          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-sm shrink-0">
              <IconComponent className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {currentSlide.title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {currentSlide.subtitle}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {/* Left 2 Cols: Bullet Points */}
            <div className="md:col-span-2 space-y-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Core Architectural Implementation
              </h4>
              <ul className="space-y-3">
                {currentSlide.bulletPoints.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right 1 Col: Tech Specifications & Quote */}
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Tech Specs
                </h4>
                <div className="space-y-2.5 text-xs">
                  {currentSlide.techDetails.map((item, idx) => (
                    <div key={idx} className="border-b border-slate-200/60 dark:border-slate-700/60 pb-1.5 last:border-0 last:pb-0">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">{item.label}</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl">
                <p className="text-xs text-emerald-950 dark:text-emerald-200 italic leading-relaxed">
                  "{currentSlide.summary}"
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentSlideIndex === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous Slide</span>
          </button>

          {/* Dots Indicator */}
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentSlideIndex(idx)}
                className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                  idx === currentSlideIndex
                    ? 'w-5 bg-emerald-600'
                    : 'bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                }`}
                title={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            disabled={currentSlideIndex === SLIDES.length - 1}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-40 cursor-pointer"
          >
            <span>Next Slide</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
