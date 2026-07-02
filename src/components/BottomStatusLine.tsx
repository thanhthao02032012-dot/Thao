import React, { useState, useEffect } from 'react';
import { 
  Hash, Cpu, Clock, Layers, ShieldCheck, ChevronRight, HardDrive, Loader2 
} from 'lucide-react';

interface BottomStatusLineProps {
  activeOffset: number | null;
  editedBytesCount: number;
  virtualFileSize: number;
  openTime: number; // Date.now() timestamp when opened
  isSaving?: boolean;
  saveProgressPercent?: number;
}

export default function BottomStatusLine({
  activeOffset,
  editedBytesCount,
  virtualFileSize,
  openTime,
  isSaving = false,
  saveProgressPercent = 0
}: BottomStatusLineProps) {
  const [elapsed, setElapsed] = useState('');
  const [estimatedRAM, setEstimatedRAM] = useState('0.0 KB');

  // Elapsed duration timer
  useEffect(() => {
    const updateTimer = () => {
      const diff = Math.floor((Date.now() - openTime) / 1000);
      const minutes = Math.floor(diff / 60);
      const seconds = diff % 60;
      setElapsed(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [openTime]);

  // RAM estimation logic: based on loaded buffer (typically 1MB) + patches metadata
  useEffect(() => {
    const baseBufferKB = 1024; // 1MB buffer typically
    const patchesMapKB = (editedBytesCount * 64) / 1024; // Estimation per map entry
    const totalKB = baseBufferKB + patchesMapKB;
    if (totalKB > 1024) {
      setEstimatedRAM(`${(totalKB / 1024).toFixed(2)} MB`);
    } else {
      setEstimatedRAM(`${totalKB.toFixed(1)} KB`);
    }
  }, [editedBytesCount]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + '' + sizes[i];
  };

  return (
    <div className="bg-[#0b0e17]/85  border-t border-white/5 py-2.5 px-4 md:px-6 flex flex-col md:flex-row md:items-center justify-between text-[11px] text-white/50 font-mono select-none shrink-0 z-30">
      
      {/* Saving progress bar mode */}
      {isSaving ? (
        <div className="flex-1 flex items-center space-x-3 text-purple-400 font-bold justify-center md:justify-start">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
          <span>Đang đóng gói file patch: {saveProgressPercent}%</span>
          <div className="flex-1 h-1.5 max-w-[200px] bg-white/5 rounded-full overflow-hidden border border-white/10 shrink-0">
            <div 
              className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-100" 
              style={{ width: `${saveProgressPercent}%` }}
            />
          </div>
        </div>
      ) : (
        /* Status details info blocks */
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 md:gap-6">
          {/* Active offset */}
          <div className="flex items-center space-x-1.5">
            <Hash className="w-3.5 h-3.5 text-purple-400" />
            <span>Offset:</span>
            <span className="text-white font-bold">
              {activeOffset !== null ? `0x${activeOffset.toString(16).toUpperCase()}` : 'N/A'}
            </span>
          </div>

          {/* Edited bytes count */}
          <div className="flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Đã sửa:</span>
            <span className="text-emerald-400 font-bold">{editedBytesCount} byte</span>
          </div>

          {/* Virtual File Size */}
          <div className="flex items-center space-x-1.5">
            <HardDrive className="w-3.5 h-3.5 text-blue-400" />
            <span>Kích thước:</span>
            <span className="text-white font-bold">{formatBytes(virtualFileSize)}</span>
          </div>
        </div>
      )}

      {/* Right details indicators */}
      <div className="flex items-center justify-center md:justify-end space-x-5 mt-2 md:mt-0 pt-2 md:pt-0 border-t border-white/5 md:border-t-0">
        {/* Estimated RAM */}
        <div className="flex items-center space-x-1.5">
          <Cpu className="w-3.5 h-3.5 text-yellow-400" />
          <span>RAM dùng:</span>
          <span className="text-white font-bold">{estimatedRAM}</span>
        </div>

        {/* Opened duration */}
        <div className="flex items-center space-x-1.5">
          <Clock className="w-3.5 h-3.5 text-pink-400" />
          <span>Thời gian mở:</span>
          <span className="text-white font-bold">{elapsed}</span>
        </div>
      </div>
    </div>
  );
}
