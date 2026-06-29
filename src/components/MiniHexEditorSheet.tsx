import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Copy, Clipboard, PenTool, Bookmark, FileText, ChevronUp, Layers, HelpCircle
} from 'lucide-react';
import { useUI } from './UIProvider';

interface MiniHexEditorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  offset: number | null;
  byteValue: number | null; // 0-255 byte value
  onReplaceByte: (offset: number, newValue: number) => void;
  onFillRange: (offset: number, length: number, fillValue: number) => void;
  onAddBookmark: (offset: number, title: string) => void;
}

export default function MiniHexEditorSheet({
  isOpen, onClose, offset, byteValue, onReplaceByte, onFillRange, onAddBookmark
}: MiniHexEditorSheetProps) {
  const { toast } = useState(() => {
    // Quick fallback helper
    return {
      toast: (msg: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
        // Fallback or use standard browser/context triggers
      }
    };
  })[0];
  const { toast: uiToast } = useUI();

  const [hexInput, setHexInput] = useState('');
  const [fillLength, setFillLength] = useState('16');
  const [fillValInput, setFillValInput] = useState('00');
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [activeSheetTab, setActiveSheetTab] = useState<'inspect' | 'replace' | 'fill' | 'bookmark'>('inspect');

  // Trigger state bindings on offset change
  useEffect(() => {
    if (byteValue !== null) {
      setHexInput(byteValue.toString(16).padStart(2, '0').toUpperCase());
    }
  }, [byteValue, offset]);

  if (offset === null || byteValue === null) return null;

  // Binary conversions
  const hexStr = byteValue.toString(16).padStart(2, '0').toUpperCase();
  const decStr = byteValue.toString(10);
  const binStr = byteValue.toString(2).padStart(8, '0');
  const asciiChar = (byteValue >= 32 && byteValue <= 126) ? String.fromCharCode(byteValue) : '.';
  const unicodeChar = String.fromCharCode(byteValue);
  
  // Signed vs Unsigned (8-bit)
  const unsignedVal = byteValue;
  const signedVal = byteValue > 127 ? byteValue - 256 : byteValue;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    uiToast(`Đã sao chép ${label}: ${text}`, 'success');
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleApplyReplace = () => {
    try {
      const val = parseInt(hexInput, 16);
      if (isNaN(val) || val < 0 || val > 255) {
        throw new Error('Giá trị Byte phải ở dạng hex từ 00 đến FF');
      }
      onReplaceByte(offset, val);
      uiToast(`Đã lưu thay đổi tại offset 0x${offset.toString(16).toUpperCase()}`, 'success');
      onClose();
    } catch (err: any) {
      uiToast(err.message || 'Lỗi áp dụng byte', 'error');
    }
  };

  const handleApplyFill = () => {
    try {
      const len = parseInt(fillLength, 10);
      const fillByte = parseInt(fillValInput, 16);

      if (isNaN(len) || len <= 0) throw new Error('Chiều dài mảng điền không hợp lệ');
      if (isNaN(fillByte) || fillByte < 0 || fillByte > 255) throw new Error('Byte điền không hợp lệ');

      onFillRange(offset, len, fillByte);
      uiToast(`Đã lấp đầy ${len} byte từ offset 0x${offset.toString(16).toUpperCase()}`, 'success');
      onClose();
    } catch (err: any) {
      uiToast(err.message || 'Thao tác thất bại', 'error');
    }
  };

  const handleApplyBookmark = () => {
    if (!bookmarkTitle.trim()) {
      uiToast('Vui lòng nhập tiêu đề bookmark!', 'warning');
      return;
    }
    onAddBookmark(offset, bookmarkTitle.trim());
    uiToast(`Đã thêm bookmark tại offset 0x${offset.toString(16).toUpperCase()}`, 'success');
    setBookmarkTitle('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Transparent Backdrop backdrop overlay */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" 
            onClick={onClose}
          />

          {/* Actual slide-up Sheet UI */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 20, stiffness: 220 }}
            className="fixed bottom-0 left-0 right-0 max-h-[85vh] bg-[#0c1222] border-t border-white/10 rounded-t-[32px] shadow-[0_-12px_40px_rgba(0,0,0,0.8)] z-50 p-6 flex flex-col overflow-hidden text-left font-sans select-none pb-8"
          >
            {/* Grab handle indicator */}
            <div className="w-12 h-1 bg-white/15 rounded-full mx-auto mb-4 shrink-0" onClick={onClose} />

            {/* Title and close button */}
            <div className="flex items-center justify-between mb-5 shrink-0">
              <div>
                <span className="text-[10px] text-purple-400 font-bold font-mono">
                  Offset: 0x{offset.toString(16).toUpperCase()} ({offset})
                </span>
                <h3 className="text-sm font-bold text-white mt-1">Trình Vá Nhanh Mini (Byte Inspector)</h3>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 rounded-xl bg-white/5 text-white/50 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick action mini sub-tabs selection */}
            <div className="flex bg-white/5 rounded-xl p-1 shrink-0 mb-5 gap-1 text-[11px] font-bold uppercase tracking-wider">
              {[
                { id: 'inspect', label: 'Xem giá trị' },
                { id: 'replace', label: 'Ghi đè' },
                { id: 'fill', label: 'Fill block' },
                { id: 'bookmark', label: 'Bookmark' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveSheetTab(tab.id as any);
                    if (navigator.vibrate) navigator.vibrate(5);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-center transition-colors ${
                    activeSheetTab === tab.id 
                      ? 'bg-purple-600 text-white' 
                      : 'text-white/40 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Interactive sheet body */}
            <div className="flex-1 overflow-y-auto max-h-[50vh] pr-1 scrollbar-thin scrollbar-thumb-white/10">
              <AnimatePresence mode="wait">
                {/* 1. Inspect Grid */}
                {activeSheetTab === 'inspect' && (
                  <motion.div
                    key="inspect"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="grid grid-cols-2 gap-3.5"
                  >
                    {[
                      { label: 'HEX', val: hexStr, copyVal: hexStr },
                      { label: 'DEC (Unsigned)', val: decStr, copyVal: decStr },
                      { label: 'DEC (Signed)', val: String(signedVal), copyVal: String(signedVal) },
                      { label: 'BINARY', val: binStr, copyVal: binStr },
                      { label: 'ASCII Char', val: asciiChar, copyVal: asciiChar },
                      { label: 'Unicode Char', val: unicodeChar, copyVal: unicodeChar }
                    ].map((item, idx) => (
                      <div 
                        key={idx} 
                        className="bg-white/[0.02] border border-white/5 p-3 rounded-2xl flex items-center justify-between hover:bg-white/[0.04] transition-all group"
                      >
                        <div className="text-left">
                          <span className="text-[9px] text-white/30 uppercase font-bold tracking-wider block font-mono">{item.label}</span>
                          <span className="text-xs font-mono font-bold text-white mt-1 block">{item.val}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(item.copyVal, item.label)}
                          className="p-1.5 rounded-lg bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white"
                          title="Copy"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}

                {/* 2. Direct Replace Input */}
                {activeSheetTab === 'replace' && (
                  <motion.div
                    key="replace"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-4"
                  >
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl text-xs space-y-3">
                      <div>
                        <span className="font-bold text-white/80 block">Nhập Byte Mới (Hex 00-FF)</span>
                        <span className="text-[10px] text-white/40 mt-1 block">Nhập 2 ký tự Hex biểu diễn giá trị cần ghi đè vào offset.</span>
                      </div>
                      
                      <div className="flex items-center space-x-3 pt-1">
                        <input
                          type="text"
                          value={hexInput}
                          onChange={(e) => setHexInput(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                          maxLength={2}
                          className="w-16 bg-[#121829] border border-white/10 rounded-xl px-3 py-2 text-center text-sm font-bold font-mono text-white outline-none focus:ring-1 focus:ring-purple-500/50"
                        />
                        <span className="text-white/30 font-mono text-xs">DEC: {parseInt(hexInput || '00', 16) || 0}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleApplyReplace}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-purple-600/15"
                    >
                      Xác Nhận Vá Byte
                    </button>
                  </motion.div>
                )}

                {/* 3. Fill Block */}
                {activeSheetTab === 'fill' && (
                  <motion.div
                    key="fill"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-4"
                  >
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl text-xs space-y-4">
                      <div>
                        <span className="font-bold text-white/80 block font-sans">Lấp Đầy Đoạn Vùng Nhớ</span>
                        <span className="text-[10px] text-white/40 mt-1 block font-sans">Ghi đè mảng byte tuần tự bắt đầu từ offset hiện tại.</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3.5">
                        <div>
                          <label className="text-[10px] text-white/40 block mb-1 font-bold uppercase tracking-wider font-mono">Độ Dài (Bytes)</label>
                          <input
                            type="number"
                            value={fillLength}
                            onChange={(e) => setFillLength(e.target.value)}
                            className="w-full bg-[#121829] border border-white/10 rounded-xl px-3 py-2 text-sm font-bold font-mono text-white outline-none focus:ring-1 focus:ring-purple-500/50"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-white/40 block mb-1 font-bold uppercase tracking-wider font-mono">Byte Ghi Đè (Hex)</label>
                          <input
                            type="text"
                            value={fillValInput}
                            onChange={(e) => setFillValInput(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                            maxLength={2}
                            className="w-full bg-[#121829] border border-white/10 rounded-xl px-3 py-2 text-sm font-bold font-mono text-white outline-none focus:ring-1 focus:ring-purple-500/50"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleApplyFill}
                      className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-purple-600/15"
                    >
                      Xác Nhận Fill Block
                    </button>
                  </motion.div>
                )}

                {/* 4. Fast Bookmark */}
                {activeSheetTab === 'bookmark' && (
                  <motion.div
                    key="bookmark"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-4"
                  >
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl text-xs space-y-3">
                      <div>
                        <span className="font-bold text-white/80 block font-sans">Đánh dấu nhanh vị trí này</span>
                        <span className="text-[10px] text-white/40 mt-1 block font-sans">Lưu địa chỉ 0x{offset.toString(16).toUpperCase()} vào danh sách bookmark.</span>
                      </div>

                      <div>
                        <label className="text-[10px] text-white/40 block mb-1 font-bold uppercase tracking-wider font-sans">Tên Bookmark</label>
                        <input
                          type="text"
                          placeholder="Ví dụ: Magic number của APK"
                          value={bookmarkTitle}
                          onChange={(e) => setBookmarkTitle(e.target.value)}
                          className="w-full bg-[#121829] border border-white/10 rounded-xl px-3.5 py-2.5 text-white outline-none focus:ring-1 focus:ring-purple-500/50"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleApplyBookmark}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-emerald-600/15"
                    >
                      Thêm Vào Danh Sách Bookmark
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
