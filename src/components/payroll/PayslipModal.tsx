import React from 'react';
import { jsPDF } from 'jspdf';
import { X, Download, DollarSign, Calendar, User, Building, FileText, CheckCircle2 } from 'lucide-react';
import { Payslip } from '../../types';
import { api } from '../../services/api';

interface PayslipModalProps {
  payslip: Payslip | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({ payslip, isOpen, onClose }) => {
  if (!isOpen || !payslip) return null;

  const handleDownloadPdf = async () => {
    if (payslip.status === 'finalized' && payslip.payroll_run_id && payslip.employee_id) {
      try {
        await api.downloadPayslipPdf(
          payslip.payroll_run_id,
          payslip.employee_id,
          `Payslip_${payslip.employee_code || 'EMP'}_${payslip.month}.pdf`
        );
        return;
      } catch (e) {
        console.warn('Backend PDF endpoint error, falling back to client jsPDF:', e);
      }
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const primaryColor = '#4f46e5';
    const darkColor = '#0f172a';
    const grayColor = '#64748b';

    // Header Background
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 42, 'F');

    // Header Text
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(payslip.company_name || 'HCM LITE ENTERPRISE', 15, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(199, 210, 254); // indigo-200
    doc.text(`CONFIDENTIAL SALARY PAYSLIP - ${payslip.month}`, 15, 26);
    doc.text(`Status: ${payslip.status.toUpperCase()} | Generated: ${new Date().toLocaleDateString()}`, 15, 33);

    // Employee & Run Details Card
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240);
    doc.rect(15, 48, 180, 36, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('EMPLOYEE NAME', 20, 56);
    doc.text('EMPLOYEE CODE', 80, 56);
    doc.text('DEPARTMENT', 140, 56);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text(payslip.employee_name || 'N/A', 20, 62);
    doc.text(payslip.employee_code || 'N/A', 80, 62);
    doc.text(payslip.department_name || 'General', 140, 62);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('DESIGNATION', 20, 72);
    doc.text('WORKING DAYS', 80, 72);
    doc.text('DAYS ATTENDED', 140, 72);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text(payslip.designation || 'Staff', 20, 78);
    doc.text(`${payslip.working_days} Days`, 80, 78);
    doc.text(`${payslip.attended_days} Days`, 140, 78);

    // Earnings & Deductions Tables Header
    doc.setFillColor(79, 70, 229); // indigo-600
    doc.rect(15, 92, 88, 8, 'F');
    doc.rect(107, 92, 88, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('EARNINGS & ALLOWANCES', 20, 97.5);
    doc.text('DEDUCTIONS & TAX', 112, 97.5);

    // Earnings Items
    const earnings = [
      ['Basic Salary', `$${Number(payslip.basic_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
      ['HRA (40% of Basic)', `$${Number(payslip.hra).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
      ['Medical (10% of Basic)', `$${Number(payslip.medical).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
      ['Other Allowances', `$${Number(payslip.allowances).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
      ['Prorate Factor', `${Math.round(payslip.prorate_factor * 100)}%`],
    ];

    let currentY = 106;
    doc.setFontSize(9);
    earnings.forEach(([label, val]) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(label, 20, currentY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(val, 95, currentY, { align: 'right' });
      currentY += 8;
    });

    // Deductions Items
    const deductions = [
      [`Absent (${payslip.absent_days}d @ $${payslip.per_day_rate}/d)`, `$${Number(payslip.absent_deduction).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
      [`Unpaid Leave (${payslip.unpaid_leave_days}d)`, `$${Number(payslip.unpaid_leave_deduction).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
      [`Half Days (${payslip.half_days}d × 0.5)`, `$${Number(payslip.half_day_deduction).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
      ['Monthly Income Tax', `$${Number(payslip.monthly_tax).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
      ['Total Deductions', `$${Number(payslip.total_deductions + payslip.monthly_tax).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
    ];

    currentY = 106;
    deductions.forEach(([label, val]) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(label, 112, currentY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(185, 28, 28); // red-700
      doc.text(val, 187, currentY, { align: 'right' });
      currentY += 8;
    });

    // Summary Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(241, 245, 249);
    doc.rect(15, 154, 180, 28, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('TOTAL GROSS SALARY:', 22, 164);
    doc.text(`$${Number(payslip.gross).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 75, 164);

    doc.text('TOTAL DEDUCTIONS + TAX:', 22, 174);
    doc.setTextColor(185, 28, 28);
    doc.text(`$${Number(payslip.total_deductions + payslip.monthly_tax).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 75, 174);

    // NET SALARY HIGHLIGHT
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.rect(115, 158, 75, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text('NET SALARY PAYABLE', 152.5, 165, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`$${Number(payslip.net_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 152.5, 173, { align: 'center' });

    // Annual Tax Computation Slabs Note
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Annualized Gross: $${Number(payslip.annual_gross).toLocaleString()} | Annual Tax: $${Number(payslip.annual_tax).toLocaleString()} | Divided by 12 = $${Number(payslip.monthly_tax).toLocaleString()}/mo`, 15, 190);
    doc.text('Tax Slabs: 0-600k (0%), 600k-1.2M (5%), 1.2M-2.4M (30k+15%), 2.4M-3.6M (210k+25%), Above 3.6M (510k+35%)', 15, 195);
    doc.text('This payslip is a system-generated computer document and requires no physical signature.', 15, 200);

    doc.save(`Payslip_${payslip.employee_code || 'EMP'}_${payslip.month}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Payslip: {payslip.month}
                <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                  payslip.status === 'finalized'
                    ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                    : 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                }`}>
                  {payslip.status.toUpperCase()}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {payslip.company_name || 'HCM Lite'} • Employee ID: {payslip.employee_code || payslip.employee_id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Employee & Attendance Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-semibold">Employee</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{payslip.employee_name || 'N/A'}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-semibold">Department</span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{payslip.department_name || 'General'}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-semibold">Working Days</span>
              <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">{payslip.working_days} Days</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-semibold">Attended Days</span>
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{payslip.attended_days} Days</span>
            </div>
          </div>

          {/* Breakdown Tables Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Earnings */}
            <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">Earnings & Allowances</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Rate Breakdown</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 text-slate-600 dark:text-slate-300">
                  <span>Basic Salary</span>
                  <span className="font-semibold text-slate-900 dark:text-white font-mono">${Number(payslip.basic_salary).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600 dark:text-slate-300">
                  <span>HRA (40% of Basic)</span>
                  <span className="font-semibold text-slate-900 dark:text-white font-mono">${Number(payslip.hra).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600 dark:text-slate-300">
                  <span>Medical (10% of Basic)</span>
                  <span className="font-semibold text-slate-900 dark:text-white font-mono">${Number(payslip.medical).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600 dark:text-slate-300">
                  <span>Allowances</span>
                  <span className="font-semibold text-slate-900 dark:text-white font-mono">${Number(payslip.allowances).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600 dark:text-slate-300">
                  <span>Prorate Factor</span>
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300 font-mono">{Math.round(payslip.prorate_factor * 100)}%</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 font-bold text-sm text-indigo-700 dark:text-indigo-300">
                  <span>Gross Salary</span>
                  <span className="font-mono">${Number(payslip.gross).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">Deductions & Taxes</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Day Rate: ${payslip.per_day_rate}</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 text-slate-600 dark:text-slate-300">
                  <span>Absent ({payslip.absent_days} day(s))</span>
                  <span className="font-semibold text-rose-700 dark:text-rose-400 font-mono">-${Number(payslip.absent_deduction).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600 dark:text-slate-300">
                  <span>Unpaid Leave ({payslip.unpaid_leave_days} day(s))</span>
                  <span className="font-semibold text-rose-700 dark:text-rose-400 font-mono">-${Number(payslip.unpaid_leave_deduction).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600 dark:text-slate-300">
                  <span>Half Day ({payslip.half_days} day(s) × 0.5)</span>
                  <span className="font-semibold text-rose-700 dark:text-rose-400 font-mono">-${Number(payslip.half_day_deduction).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600 dark:text-slate-300">
                  <span>Monthly Income Tax</span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400 font-mono">-${Number(payslip.monthly_tax).toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 font-bold text-sm text-rose-700 dark:text-rose-400">
                  <span>Total Deductions</span>
                  <span className="font-mono">-${Number(payslip.total_deductions + payslip.monthly_tax).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Salary Banner */}
          <div className="bg-emerald-50 dark:bg-emerald-950/40 p-5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block">Net Salary Payable</span>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1 font-mono">
                ${Number(payslip.net_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-600 dark:text-slate-400">
                Prorated Gross (${payslip.gross}) − Deductions (${payslip.total_deductions}) − Tax (${payslip.monthly_tax})
              </span>
            </div>

            <button
              onClick={handleDownloadPdf}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
          </div>

          {/* Tax Slabs Explanation */}
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            <strong className="text-slate-900 dark:text-slate-200 font-semibold">Tax Computation Details:</strong> Annualized Gross = ${Number(payslip.annual_gross).toLocaleString()} (Monthly Gross × 12). Slabs applied: 0-600k (0%), 600k-1.2M (5%), 1.2M-2.4M (30k+15%), 2.4M-3.6M (210k+25%), Above 3.6M (510k+35%). Annual tax = ${Number(payslip.annual_tax).toLocaleString()} ÷ 12 = ${Number(payslip.monthly_tax).toLocaleString()}/month.
          </div>
        </div>
      </div>
    </div>
  );
};
