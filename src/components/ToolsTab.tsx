import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, Edit3, PenTool, Code, Cpu, Sliders, Eye, RefreshCw, 
  Battery, Zap, HelpCircle, Check, Sparkles, BookOpen
} from 'lucide-react';
import { useUI } from './UIProvider';
import BulkEditor from './BulkEditor';
import SignatureEditor from './SignatureEditor';
import ByteScripting from './ByteScripting';

interface ToolsTabProps {
  file: File;
  patches: Map<number, number>;
  setPatches: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  virtualFileSize: number;
  setVirtualFileSize: React.Dispatch<React.SetStateAction<number>>;
  onApplied?: () => void;
  // Settings overrides
  fontSize: number;
  setFontSize: (size: number) => void;
  itemsPerRow: number;
  setItemsPerRow: (items: number) => void;
  performanceMode: boolean;
  setPerformanceMode: (mode: boolean) => void;
  batterySaver: boolean;
  setBatterySaver: (save: boolean) => void;
  animateTabs: boolean;
  setAnimateTabs: (anim: boolean) => void;
}

export default function ToolsTab({
  file, patches, setPatches, virtualFileSize, setVirtualFileSize, onApplied,
  fontSize, setFontSize, itemsPerRow, setItemsPerRow,
  performanceMode, setPerformanceMode, batterySaver, setBatterySaver,
  animateTabs, setAnimateTabs
}: ToolsTabProps) {
  const { toast } = useUI();
  const [activeSubTool, setActiveSubTool] = useState<'settings' | 'scripting' | 'bulk' | 'signature'>('settings');

  const toolsList = [
    { id: 'settings', label: 'Cài đặt hệ thống', desc: 'Font size, Bytes/Dòng, Hiệu năng', icon: Settings },
    { id: 'scripting', label: 'Hex Bit Compiler', desc: 'Tự động hóa, XOR Crypt, Scripting', icon: Code },
    { id: 'bulk', label: 'Ghi đè hàng loạt', desc: 'Fill block, NOP Sled, thay thế', icon: Edit3 },
    { id: 'signature', label: 'Ký & Signatures', desc: 'Sửa file signature, Magic bytes', icon: PenTool }
  ] as const;

  return (
    <div className="flex flex-col lg:flex-row gap-6 text-left">
      {/* Sub-tools selection rail */}
      <div className="lg:w-80 shrink-0 space-y-2.5">
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-3 block mb-1">
          Hộp Công Cụ Cao Cấp
        </span>

        {toolsList.map((t) => {
          const Icon = t.icon;
          const isSelected = activeSubTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setActiveSubTool(t.id);
                if (navigator.vibrate) navigator.vibrate(8);
              }}
              className={`w-full p-4 rounded-3xl border transition-all flex items-start space-x-4 text-left ${
                isSelected
                  ? 'bg-gradient-to-tr from-purple-600/10 to-indigo-600/10 border-purple-500/40 text-purple-200 '
                  : 'bg-[#121829]/40 border-white/5 text-white/60 hover:bg-[#121829]/60 hover:border-white/10'
              }`}
            >
              <div className={`p-2 rounded-2xl ${isSelected ? 'bg-purple-600/20 text-purple-400' : 'bg-white/5 text-white/40'}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <span className={`text-xs font-bold block ${isSelected ? 'text-white' : 'text-white/80'}`}>{t.label}</span>
                <span className="text-[10px] text-white/40 mt-1 block leading-snug truncate">{t.desc}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Sub-tool workspace layout */}
      <div className="flex-1 bg-[#121829]/25 border border-white/5 rounded-3xl p-5 md:p-6 shadow-inner relative overflow-hidden min-h-[400px]">
        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/[0.01] blur-3xl rounded-full" />

        <AnimatePresence mode="wait">
          {activeSubTool === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div>
                <h3 className="text-sm font-bold text-white flex items-center">
                  <Settings className="w-4 h-4 text-purple-400 mr-2" />
                  Cài Đặt Hệ Thống & Trình Diễn
                </h3>
                <p className="text-xs text-white/50 mt-1">
                  Tinh chỉnh giao diện, tối ưu hiệu ứng đồ họa hoặc kích hoạt chế độ tiết kiệm năng lượng.
                </p>
              </div>

              {/* Settings selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Font size */}
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl space-y-3">
                  <div>
                    <span className="text-xs font-bold text-white/80 block">Kích thước chữ (Font Size)</span>
                    <span className="text-[10px] text-white/40 mt-0.5 block">Điều chỉnh cỡ chữ trong Hex Grid</span>
                  </div>
                  <div className="flex items-center space-x-3 pt-1">
                    {[11, 12, 13, 14].map((sz) => (
                      <button
                        key={sz}
                        onClick={() => setFontSize(sz)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors ${
                          fontSize === sz
                            ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                            : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        {sz}px
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bytes per row */}
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl space-y-3">
                  <div>
                    <span className="text-xs font-bold text-white/80 block">Số Byte Mỗi Dòng (Bytes/Row)</span>
                    <span className="text-[10px] text-white/40 mt-0.5 block">Bố cục hiển thị cột Hex Grid</span>
                  </div>
                  <div className="flex items-center space-x-3 pt-1">
                    {[8, 16, 24].map((bpr) => (
                      <button
                        key={bpr}
                        onClick={() => setItemsPerRow(bpr)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors ${
                          itemsPerRow === bpr
                            ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                            : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        {bpr} bytes
                      </button>
                    ))}
                  </div>
                </div>

                {/* Performance Mode */}
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white/80 flex items-center">
                      <Cpu className="w-4 h-4 text-emerald-400 mr-2" />
                      Chế độ hiệu năng cao (Performance Mode)
                    </span>
                    <span className="text-[10px] text-white/40 mt-1 block max-w-[200px] leading-relaxed">
                      Ưu tiên tốc độ render mượt, tắt một số hiệu ứng glassmorphism phức tạp.
                    </span>
                  </div>
                  <button
                    onClick={() => setPerformanceMode(!performanceMode)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${performanceMode ? 'bg-emerald-500' : 'bg-white/10'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow transition-transform ${performanceMode ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Battery Saver */}
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white/80 flex items-center">
                      <Battery className="w-4 h-4 text-blue-400 mr-2" />
                      Tiết kiệm Pin (Battery Saver)
                    </span>
                    <span className="text-[10px] text-white/40 mt-1 block max-w-[200px] leading-relaxed">
                      Giảm tần suất tính toán băm (MD5/SHA1) để tăng thời lượng sử dụng trên thiết bị di động.
                    </span>
                  </div>
                  <button
                    onClick={() => setBatterySaver(!batterySaver)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${batterySaver ? 'bg-blue-500' : 'bg-white/10'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow transition-transform ${batterySaver ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Animate Tabs */}
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl flex items-center justify-between col-span-1 sm:col-span-2">
                  <div>
                    <span className="text-xs font-bold text-white/80 flex items-center">
                      <Zap className="w-4 h-4 text-purple-400 mr-2 animate-bounce" />
                      Hiệu ứng chuyển Tab mượt mà (Spring Transitions)
                    </span>
                    <span className="text-[10px] text-white/40 mt-1 block leading-relaxed">
                      Sử dụng thư viện motion/react với cấu hình lò xo để tạo cảm giác vuốt cực kỳ cao cấp, mượt mà 60fps.
                    </span>
                  </div>
                  <button
                    onClick={() => setAnimateTabs(!animateTabs)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${animateTabs ? 'bg-purple-500' : 'bg-white/10'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow transition-transform ${animateTabs ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeSubTool === 'scripting' && (
            <motion.div
              key="scripting"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="h-full"
            >
              <ByteScripting
                file={file}
                patches={patches}
                setPatches={setPatches}
                virtualFileSize={virtualFileSize}
                onApplied={onApplied}
              />
            </motion.div>
          )}

          {activeSubTool === 'bulk' && (
            <motion.div
              key="bulk"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <BulkEditor
                patches={patches}
                setPatches={setPatches}
                fileSize={virtualFileSize}
                onApplied={onApplied || (() => {})}
              />
            </motion.div>
          )}

          {activeSubTool === 'signature' && (
            <motion.div
              key="signature"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <SignatureEditor
                patches={patches}
                setPatches={setPatches}
                virtualFileSize={virtualFileSize}
                setVirtualFileSize={setVirtualFileSize}
                onApplied={onApplied || (() => {})}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
