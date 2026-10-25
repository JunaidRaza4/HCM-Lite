import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Bot, User, CheckCircle2, AlertCircle, RefreshCw, Calendar, ShieldCheck, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { SmartLeaveForm, LeaveType } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  isAiGenerated?: boolean;
  smartLeaveForm?: SmartLeaveForm | null;
  timestamp: string;
}

export const AiChatPanel: React.FC = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Hello ${user?.name || ''}! I am your HCM Lite AI Assistant. You can ask me about company policies (working hours, grace periods, quotas, tax slabs), your leave balances, attendance summaries, or say "I need Monday off for a wedding" to apply for leave!`,
      isAiGenerated: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Active smart leave form confirmation state
  const [leaveSubmitting, setLeaveSubmitting] = useState<string | null>(null);
  const [leaveSuccessId, setLeaveSuccessId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    // Load leave types for dropdown reference
    api.getLeaveTypes().then(setLeaveTypes).catch(() => {});
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);

    try {
      const res = await api.sendAiChat(text);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: res.reply,
        isAiGenerated: res.isAiGenerated ?? true,
        smartLeaveForm: res.smartLeaveForm || null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: err.message || 'I encountered an error processing your query. Please try again.',
        isAiGenerated: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSmartLeave = async (msgId: string, form: SmartLeaveForm) => {
    setLeaveSubmitting(msgId);
    try {
      // Calculate days count between start_date and end_date
      const start = new Date(form.start_date);
      const end = new Date(form.end_date);
      const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1);

      await api.submitLeave({
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.end_date,
        days_count: diffDays,
        reason: form.reason,
      });

      setLeaveSuccessId(msgId);
      // Append confirmation message in chat
      setMessages((prev) => [
        ...prev,
        {
          id: `leave-ok-${Date.now()}`,
          sender: 'assistant',
          text: `Your ${form.leave_type_name} request from ${form.start_date} to ${form.end_date} (${diffDays} days) has been submitted successfully for HR approval!`,
          isAiGenerated: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      alert(`Failed to submit leave: ${err.message}`);
    } finally {
      setLeaveSubmitting(null);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/30 transition-all transform hover:scale-105 cursor-pointer ring-2 ring-indigo-500/20"
      >
        <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
        <span className="text-sm font-bold">Ask AI Assistant</span>
      </button>

      {/* Slide-out Drawer / Chat Modal */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-full max-w-md sm:w-[420px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[580px] animate-in slide-in-from-bottom-5 duration-200 transition-colors">
          {/* Header */}
          <div className="px-5 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  HCM Lite Assistant
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                </h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Grounded with real DB tools & policies</span>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-50/60 dark:bg-slate-950/40">
            {messages.map((m) => {
              const isUser = m.sender === 'user';

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div
                    className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                      isUser
                        ? 'bg-indigo-600 text-white rounded-br-none shadow-xs'
                        : 'bg-white dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 rounded-bl-none shadow-xs'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>

                    {/* Pre-filled Smart Leave Form confirmation card */}
                    {m.smartLeaveForm && leaveSuccessId !== m.id && (
                      <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/40 space-y-2.5 text-xs shadow-2xs">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1.5">
                          <span className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            Pre-Filled Leave Form
                          </span>
                          <span className="text-[10px] text-amber-800 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 rounded-full">
                            Requires Confirmation
                          </span>
                        </div>

                        <div className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                          <div><strong className="text-slate-500 dark:text-slate-400">Type:</strong> {m.smartLeaveForm.leave_type_name}</div>
                          <div><strong className="text-slate-500 dark:text-slate-400">Dates:</strong> {m.smartLeaveForm.start_date} to {m.smartLeaveForm.end_date}</div>
                          <div><strong className="text-slate-500 dark:text-slate-400">Reason:</strong> {m.smartLeaveForm.reason}</div>
                        </div>

                        <button
                          onClick={() => handleConfirmSmartLeave(m.id, m.smartLeaveForm!)}
                          disabled={leaveSubmitting === m.id}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                        >
                          {leaveSubmitting === m.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Confirm & Submit Leave</span>
                        </button>
                      </div>
                    )}

                    {leaveSuccessId === m.id && (
                      <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Leave submitted!</span>
                      </div>
                    )}
                  </div>

                  {/* Footnote: AI-Generated label + timestamp */}
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 px-1">
                    {!isUser && m.isAiGenerated && (
                      <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium">
                        <Sparkles className="w-2.5 h-2.5" />
                        AI-grounded
                      </span>
                    )}
                    <span>{m.timestamp}</span>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 p-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                <span>AI assistant is querying tools...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Pills */}
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto text-[10px] whitespace-nowrap">
            <button
              onClick={() => handleSendMessage('What are our statutory leave quotas?')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors shadow-2xs cursor-pointer"
            >
              Leave Quotas?
            </button>
            <button
              onClick={() => handleSendMessage('What is the tax slab for 1,500,000 annual gross?')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors shadow-2xs cursor-pointer"
            >
              Tax Slabs?
            </button>
            <button
              onClick={() => handleSendMessage('Check my leave balance')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors shadow-2xs cursor-pointer"
            >
              My Leave Balance
            </button>
            <button
              onClick={() => handleSendMessage('I need Monday and Tuesday off for my sister’s wedding')}
              className="px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700/50 transition-colors font-medium shadow-2xs cursor-pointer"
            >
              Smart Leave Form
            </button>
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your question or leave request..."
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || loading}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
