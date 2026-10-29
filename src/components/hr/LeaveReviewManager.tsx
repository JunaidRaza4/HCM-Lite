import React, { useEffect, useState } from 'react';
import { Umbrella, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { LeaveRequest } from '../../types';
import { api } from '../../services/api';

export const LeaveReviewManager: React.FC = () => {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [reviewModal, setReviewModal] = useState<{
    id: number;
    status: 'approved' | 'rejected';
    employeeName: string;
    leaveType: string;
  } | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.getLeaves();
      setRequests(res.requests);
    } catch (err) {
      console.error('Failed to load leave requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleOpenReview = (req: LeaveRequest, status: 'approved' | 'rejected') => {
    setReviewModal({
      id: req.id,
      status,
      employeeName: req.employee_name || 'Employee',
      leaveType: req.leave_type_name || 'Leave',
    });
    setReviewComment('');
    setCommentError(null);
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModal) return;

    if (!reviewComment.trim()) {
      setCommentError('Review note/comment is mandatory when approving or rejecting a leave request.');
      return;
    }

    setProcessingId(reviewModal.id);
    try {
      await api.updateLeaveStatus(reviewModal.id, reviewModal.status, reviewComment.trim());
      setReviewModal(null);
      setReviewComment('');
      fetchRequests();
    } catch (err: any) {
      setCommentError(err.message || 'Error updating leave status');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
            <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
            <XCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            Pending Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-base">Employee Leave Requests</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Review, approve, or reject employee leave applications</p>
        </div>
        <button
          onClick={fetchRequests}
          disabled={loading}
          className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Leave Type</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No leave requests on file.
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white">{req.employee_name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{req.employee_code}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {req.department_name || '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-medium text-indigo-600 dark:text-indigo-400">
                      {req.leave_type_name}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      <div>{req.start_date} to {req.end_date}</div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{req.days_count} day(s)</span>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-600 dark:text-slate-300">
                      {req.reason || <span className="italic text-slate-400">None provided</span>}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getStatusBadge(req.status)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {req.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenReview(req, 'approved')}
                            disabled={processingId === req.id}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleOpenReview(req, 'rejected')}
                            disabled={processingId === req.id}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:hover:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className="text-right">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Reviewed by {req.reviewer_name || 'Manager'}
                          </div>
                          {req.admin_comment && (
                            <div className="text-[10px] text-slate-400 italic">
                              "{req.admin_comment}"
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MANDATORY REVIEW COMMENT MODAL */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              {reviewModal.status === 'approved' ? 'Approve Leave Request' : 'Reject Leave Request'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {reviewModal.employeeName} — {reviewModal.leaveType}
            </p>

            {commentError && (
              <div className="mb-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 p-2.5 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{commentError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Manager / Review Note * (Mandatory)
                </label>
                <textarea
                  required
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => {
                    setReviewComment(e.target.value);
                    setCommentError(null);
                  }}
                  placeholder={
                    reviewModal.status === 'approved'
                      ? 'e.g. Approved. Have sufficient coverage during these dates.'
                      : 'e.g. Rejected due to critical project release deadlines during this week.'
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReviewModal(null)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingId !== null}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg text-white shadow-xs cursor-pointer ${
                    reviewModal.status === 'approved'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {processingId ? 'Saving...' : `Confirm ${reviewModal.status === 'approved' ? 'Approval' : 'Rejection'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
