import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bookmark, Trash2, Plus, Tag, HelpCircle, Sparkles, 
  ChevronRight, Calendar, ArrowUpRight, Check, Palette
} from 'lucide-react';
import { useUI } from './UIProvider';

interface BookmarkItem {
  id: string;
  offset: number;
  title: string;
  notes?: string;
  color: 'purple' | 'emerald' | 'blue' | 'yellow' | 'pink';
  timestamp: number;
}

interface BookmarksTabProps {
  bookmarks: BookmarkItem[];
  setBookmarks: React.Dispatch<React.SetStateAction<BookmarkItem[]>>;
  onJumpToOffset: (offset: number) => void;
  virtualFileSize: number;
}

export default function BookmarksTab({ bookmarks, setBookmarks, onJumpToOffset, virtualFileSize }: BookmarksTabProps) {
  const { toast } = useUI();
  const [title, setTitle] = useState('');
  const [offsetInput, setOffsetInput] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState<'purple' | 'emerald' | 'blue' | 'yellow' | 'pink'>('purple');

  const colors = {
    purple: { name: 'Tím', bg: 'bg-purple-500/10 border-purple-500/20 text-purple-400', hex: '#A855F7', glow: '' },
    emerald: { name: 'Xanh lá', bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', hex: '#10B981', glow: '' },
    blue: { name: 'Xanh dương', bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400', hex: '#3B82F6', glow: '' },
    yellow: { name: 'Vàng', bg: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400', hex: '#EAB308', glow: '' },
    pink: { name: 'Hồng', bg: 'bg-pink-500/10 border-pink-500/20 text-pink-400', hex: '#EC4899', glow: '' }
  };

  const handleAddBookmark = () => {
    if (!title.trim()) {
      toast('Vui lòng nhập tiêu đề bookmark!', 'warning');
      return;
    }

    let parsedOffset = 0;
    try {
      const cleanInput = offsetInput.trim().toLowerCase();
      if (cleanInput.startsWith('0x')) {
        parsedOffset = parseInt(cleanInput, 16);
      } else {
        parsedOffset = parseInt(cleanInput, 10);
      }

      if (isNaN(parsedOffset) || parsedOffset < 0 || parsedOffset >= virtualFileSize) {
        throw new Error('Offset vượt quá phạm vi file hoặc không hợp lệ');
      }
    } catch (err: any) {
      toast(err.message || 'Offset không hợp lệ', 'error');
      return;
    }

    const newBookmark: BookmarkItem = {
      id: `${Date.now()}`,
      offset: parsedOffset,
      title: title.trim(),
      notes: notes.trim() || undefined,
      color,
      timestamp: Date.now()
    };

    setBookmarks(prev => [newBookmark, ...prev]);
    setTitle('');
    setOffsetInput('');
    setNotes('');
    toast('Đã thêm bookmark thành công', 'success');
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleDeleteBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBookmarks(prev => prev.filter(b => b.id !== id));
    toast('Đã xóa bookmark', 'info');
    if (navigator.vibrate) navigator.vibrate(5);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
      {/* Create Bookmark form */}
      <div className="lg:col-span-5 bg-[#121829]/65  rounded-3xl border border-white/10 p-5 md:p-6  h-fit space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center">
            <Plus className="w-4 h-4 text-purple-400 mr-2" />
            Tạo Bookmark & Đánh dấu Offset
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Ghim nhanh các địa chỉ offset quan trọng để nhanh chóng quay lại phân tích hoặc chỉnh sửa sau này.
          </p>
        </div>

        {/* Inputs */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="text-white/40 block mb-1.5 font-bold uppercase tracking-wider">Tiêu Đề</label>
            <input
              type="text"
              placeholder="Ví dụ: Start of main header"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 text-white outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 block mb-1.5 font-bold uppercase tracking-wider">Offset Address</label>
              <input
                type="text"
                placeholder="Ví dụ: 0x100 hoặc 256"
                value={offsetInput}
                onChange={(e) => setOffsetInput(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 text-white font-mono outline-none focus:ring-1 focus:ring-purple-500/50"
              />
            </div>

            <div>
              <label className="text-white/40 block mb-1.5 font-bold uppercase tracking-wider">Chọn Màu Nhãn</label>
              <div className="flex items-center space-x-2 py-2">
                {Object.entries(colors).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setColor(key as any)}
                    className="w-6 h-6 rounded-full border flex items-center justify-center transition-transform hover:scale-115 active:scale-95"
                    style={{ backgroundColor: config.hex, borderColor: color === key ? '#ffffff' : 'transparent' }}
                  >
                    {color === key && <Check className="w-3 h-3 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-white/40 block mb-1.5 font-bold uppercase tracking-wider">Ghi chú (Tùy chọn)</label>
            <textarea
              placeholder="Mô tả cấu trúc hoặc byte ở vị trí này..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 text-white outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
            />
          </div>

          <button
            onClick={handleAddBookmark}
            className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 font-bold rounded-xl text-white text-xs transition-colors shadow-lg shadow-purple-600/15"
          >
            Thêm Bookmark
          </button>
        </div>
      </div>

      {/* Bookmark Cards list */}
      <div className="lg:col-span-7 bg-[#121829]/40  rounded-3xl border border-white/5 p-5 shadow-2xl min-h-[350px] flex flex-col justify-between">
        <div>
          <span className="text-xs font-bold text-white/50 uppercase tracking-widest block mb-4 border-b border-white/5 pb-3">
            Bookmarks đã lưu ({bookmarks.length})
          </span>

          {bookmarks.length === 0 ? (
            <div className="py-16 text-center text-white/20 flex flex-col items-center justify-center">
              <Bookmark className="w-10 h-10 mb-2 stroke-[1.5]" />
              <span className="text-xs">Chưa có Bookmark nào được đánh dấu.</span>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
              <AnimatePresence initial={false}>
                {bookmarks.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => {
                      onJumpToOffset(b.offset);
                      toast(`Đã nhảy tới bookmark offset 0x${b.offset.toString(16).toUpperCase()}`, 'success');
                      if (navigator.vibrate) navigator.vibrate(10);
                    }}
                    className="bg-[#121829]/50 border border-white/5 hover:border-white/10 p-3.5 rounded-2xl cursor-pointer transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-start space-x-3.5 min-w-0">
                      {/* Color Dot indicator */}
                      <div 
                        className={`w-3.5 h-3.5 rounded-full mt-0.5 border shrink-0 ${colors[b.color].bg} ${colors[b.color].glow}`}
                        style={{ backgroundColor: colors[b.color].hex }}
                      />
                      <div className="text-left min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{b.title}</h4>
                        {b.notes && <p className="text-[10px] text-white/50 mt-1 line-clamp-1">{b.notes}</p>}
                        <span className="text-[9px] text-white/30 font-mono mt-1.5 block">
                          Offset: <strong className="text-white/60">0x{b.offset.toString(16).toUpperCase()}</strong> • {new Date(b.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2.5">
                      <button
                        onClick={(e) => handleDeleteBookmark(b.id, e)}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete Bookmark"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex items-center text-[10px] text-purple-400 font-bold group-hover:translate-x-1 transition-transform">
                        <span>Jump</span>
                        <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Quick hint box */}
        <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl text-[10px] text-white/40 mt-4 text-left">
          <strong>Tip:</strong> Bạn cũng có thể tạo nhanh Bookmark trực tiếp ngay khi gõ giữ (long press) hoặc xem thuộc tính của một byte cụ thể trên Hex Grid!
        </div>
      </div>
    </div>
  );
}
