import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, XCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface DialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface UIContextType {
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: DialogOptions) => void;
}

const UIContext = createContext<UIContextType | null>(null);

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<DialogOptions | null>(null);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const confirm = useCallback((options: DialogOptions) => {
    setDialog(options);
  }, []);

  const handleConfirm = () => {
    if (dialog) {
      dialog.onConfirm();
      setDialog(null);
    }
  };

  const handleCancel = () => {
    if (dialog) {
      if (dialog.onCancel) dialog.onCancel();
      setDialog(null);
    }
  };

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}
      
      {/* Toast Portal */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            let Icon = Info;
            let bgColor = 'bg-[#18181b] border-[#27272a] text-white';
            let iconColor = 'text-blue-400';
            
            if (t.type === 'success') {
              Icon = CheckCircle2;
              bgColor = 'bg-emerald-950 border-emerald-500/20 text-emerald-100 shadow-md';
              iconColor = 'text-emerald-400';
            } else if (t.type === 'error') {
              Icon = XCircle;
              bgColor = 'bg-red-950 border-red-500/20 text-red-100 shadow-md';
              iconColor = 'text-red-400';
            } else if (t.type === 'warning') {
              Icon = AlertCircle;
              bgColor = 'bg-amber-950 border-amber-500/20 text-amber-100 shadow-md';
              iconColor = 'text-amber-400';
            } else if (t.type === 'info') {
              Icon = Info;
              bgColor = 'bg-purple-950 border-purple-500/20 text-purple-100 shadow-md';
              iconColor = 'text-purple-400';
            }

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className={`pointer-events-auto flex items-center justify-between p-4 rounded-xl border ${bgColor} overflow-hidden`}
              >
                <div className="flex items-center space-x-3 flex-1">
                  <Icon className={`w-5 h-5 ${iconColor} shrink-0`} />
                  <p className="text-xs font-medium leading-relaxed">{t.message}</p>
                </div>
                <button
                  onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                  className="ml-3 p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Confirmation Dialog Portal */}
      <AnimatePresence>
        {dialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={handleCancel}
              className="absolute inset-0 bg-[#09090b]/80"
            />
            
            {/* Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="relative w-full max-w-md bg-[#0f0f13] border border-white/10 p-6 rounded-2xl shadow-xl z-10 flex flex-col text-left"
            >
              <h3 className="text-base font-semibold text-white mb-2">{dialog.title}</h3>
              <p className="text-xs text-white/60 mb-6 leading-relaxed">{dialog.message}</p>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/80 rounded-xl text-xs font-medium transition-colors border border-white/5"
                >
                  {dialog.cancelText || 'Hủy bỏ'}
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-md"
                >
                  {dialog.confirmText || 'Xác nhận'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </UIContext.Provider>
  );
}
