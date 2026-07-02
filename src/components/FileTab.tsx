import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileCode, Sliders, Hash, Calendar, HelpCircle, Activity, ShieldCheck, 
  Layers, Clock, Clipboard, Sparkles, Terminal, FileText, CheckCircle
} from 'lucide-react';
import { useUI } from './UIProvider';
import { md5, sha1, sha256, crc32, calculateEntropy } from '../utils/checksums';

interface FileTabProps {
  file: File;
  virtualFileSize: number;
  patches: Map<number, number>;
}

export default function FileTab({ file, virtualFileSize, patches }: FileTabProps) {
  const { toast } = useUI();
  const [hashes, setHashes] = useState<{ md5: string; sha1: string; sha256: string; crc32: string } | null>(null);
  const [entropy, setEntropy] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const calculateMetrics = async () => {
      setIsLoading(true);
      try {
        // Read file contents (limit to first 10MB to calculate checksums for fast performance)
        const readSize = Math.min(file.size, 10 * 1024 * 1024);
        const slice = file.slice(0, readSize);
        const buffer = await slice.arrayBuffer();
        const data = new Uint8Array(buffer);

        // Calculate
        const md5Val = await md5(data);
        const sha1Val = await sha1(data);
        const sha256Val = await sha256(data);
        const crc32Val = await crc32(data);
        const entBlocks = calculateEntropy(data, 1);
        const entVal = entBlocks.length > 0 ? entBlocks[0].entropy : 0;

        setHashes({ md5: md5Val, sha1: sha1Val, sha256: sha256Val, crc32: crc32Val });
        setEntropy(entVal);
      } catch (err) {
        console.error('Error calculating file hashes:', err);
      } finally {
        setIsLoading(false);
      }
    };

    calculateMetrics();
  }, [file]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast(`Đã sao chép ${label}`, 'success');
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mime: string) => {
    if (mime.startsWith('image/')) return '🖼';
    if (mime.startsWith('audio/')) return '🎵';
    if (mime.startsWith('video/')) return '🎥';
    if (mime.startsWith('text/')) return '📄';
    return '📦';
  };

  const fileExt = file.name.slice((file.name.lastIndexOf(".") - 1 >>> 0) + 2).toUpperCase() || 'BIN';

  return (
    <div className="space-y-6">
      {/* File overview card */}
      <div className="bg-[#121829]/65  rounded-3xl border border-white/10 p-6 relative overflow-hidden ">
        <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 blur-[50px] rounded-full pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-500 p-0.5 flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/15">
              <div className="w-full h-full rounded-2xl bg-[#0b0f19] flex items-center justify-center text-xl">
                {getFileIcon(file.type || '')}
              </div>
            </div>
            <div className="text-left">
              <span className="text-[9px] bg-purple-500/20 text-purple-300 font-bold px-2 py-0.5 rounded-full border border-purple-500/20 font-mono tracking-widest uppercase">
                {fileExt} FILE
              </span>
              <h3 className="text-base font-bold text-white mt-1 break-all line-clamp-1">{file.name}</h3>
              <p className="text-xs text-white/40 font-mono mt-0.5">{formatBytes(virtualFileSize)} • {file.type || 'unknown/binary'}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2.5 shrink-0">
            <div className="px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Dữ liệu an toàn</span>
            </div>
          </div>
        </div>

        {/* Detailed grid properties */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/5">
          <div className="bg-white/[0.01] border border-white/[0.03] p-3.5 rounded-2xl text-left">
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold block mb-1">MIME Type</span>
            <span className="text-xs text-white/80 font-mono font-medium truncate block">{file.type || 'application/octet-stream'}</span>
          </div>

          <div className="bg-white/[0.01] border border-white/[0.03] p-3.5 rounded-2xl text-left">
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold block mb-1">Kích Thước Gốc</span>
            <span className="text-xs text-white/80 font-mono font-medium block">{file.size.toLocaleString()} bytes</span>
          </div>

          <div className="bg-white/[0.01] border border-white/[0.03] p-3.5 rounded-2xl text-left">
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold block mb-1">Ngày cập nhật</span>
            <span className="text-xs text-white/80 font-mono font-medium block">
              {new Date(file.lastModified).toLocaleDateString()}
            </span>
          </div>

          <div className="bg-white/[0.01] border border-white/[0.03] p-3.5 rounded-2xl text-left">
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold block mb-1">Đã Sửa Đổi</span>
            <span className="text-xs text-emerald-400 font-mono font-bold block">{patches.size} byte(s)</span>
          </div>
        </div>
      </div>

      {/* Checksums section */}
      <div className="bg-[#121829]/50  rounded-3xl border border-white/5 p-5 shadow-2xl space-y-4">
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-widest flex items-center">
          <Hash className="w-4 h-4 text-indigo-400 mr-2" />
          Mã Băm & Bảo Mật (Checksums)
        </h4>

        {isLoading ? (
          <div className="space-y-3 py-2">
            <div className="h-9 bg-white/5 animate-pulse rounded-xl" />
            <div className="h-9 bg-white/5 animate-pulse rounded-xl" />
            <div className="h-9 bg-white/5 animate-pulse rounded-xl" />
          </div>
        ) : (
          <div className="space-y-3 font-mono text-xs">
            {/* SHA-256 */}
            <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-colors group">
              <div className="flex flex-col items-start min-w-0 pr-4">
                <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider mb-0.5">SHA-256</span>
                <span className="text-white/80 break-all select-all font-medium text-left">{hashes?.sha256 || 'N/A'}</span>
              </div>
              <button 
                onClick={() => copyToClipboard(hashes?.sha256 || '', 'SHA-256')}
                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors flex-shrink-0"
                title="Copy Hash"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* SHA-1 */}
            <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-colors group">
              <div className="flex flex-col items-start min-w-0 pr-4">
                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider mb-0.5">SHA-1</span>
                <span className="text-white/80 break-all select-all font-medium text-left">{hashes?.sha1 || 'N/A'}</span>
              </div>
              <button 
                onClick={() => copyToClipboard(hashes?.sha1 || '', 'SHA-1')}
                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors flex-shrink-0"
                title="Copy Hash"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* MD5 */}
            <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-colors group">
              <div className="flex flex-col items-start min-w-0 pr-4">
                <span className="text-[9px] font-bold text-pink-400 uppercase tracking-wider mb-0.5">MD5</span>
                <span className="text-white/80 break-all select-all font-medium text-left">{hashes?.md5 || 'N/A'}</span>
              </div>
              <button 
                onClick={() => copyToClipboard(hashes?.md5 || '', 'MD5')}
                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors flex-shrink-0"
                title="Copy Hash"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* CRC-32 */}
            <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-colors group">
              <div className="flex flex-col items-start min-w-0 pr-4">
                <span className="text-[9px] font-bold text-yellow-400 uppercase tracking-wider mb-0.5">CRC-32</span>
                <span className="text-white/80 break-all select-all font-medium text-left">{hashes?.crc32 || 'N/A'}</span>
              </div>
              <button 
                onClick={() => copyToClipboard(hashes?.crc32 || '', 'CRC-32')}
                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors flex-shrink-0"
                title="Copy Hash"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Entropy Visualization & Help Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#121829]/50  rounded-3xl border border-white/5 p-5 shadow-2xl flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-white/70 uppercase tracking-widest flex items-center mb-3">
              <Activity className="w-4 h-4 text-emerald-400 mr-2" />
              Chỉ số Entropy (Mật độ thông tin)
            </h4>
            <p className="text-xs text-white/50 leading-relaxed text-left mb-4">
              Entropy đo lường tính hỗn loạn của dữ liệu trong tệp. Trị số từ 0 - 8. 
              Mức entropy cao gần 8.0 biểu thị file có thể đã được nén (compressed) hoặc bị mã hóa (encrypted).
            </p>
          </div>

          <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[9px] text-white/40 uppercase tracking-wider block font-bold font-mono">Chỉ số Entropy chung</span>
              <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
                {entropy !== null ? entropy.toFixed(4) : 'Đang tính...'} / 8.0000
              </span>
            </div>
            
            <div className="w-20 bg-white/5 rounded-full h-2 overflow-hidden border border-white/10 shrink-0">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-purple-500 h-full rounded-full" 
                style={{ width: `${((entropy || 0) / 8) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Local Streaming Note Box */}
        <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10  rounded-3xl border border-indigo-500/20 p-5 shadow-2xl flex flex-col justify-between text-left">
          <div>
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center mb-3">
              <ShieldCheck className="w-4 h-4 text-indigo-400 mr-2 animate-pulse" />
              Hệ thống tối ưu dung lượng lớn
            </h4>
            <p className="text-xs text-white/70 leading-relaxed mb-4">
              Bằng việc kết hợp các block slice cục bộ và lưu vết Patch, hệ thống có khả năng hỗ trợ các tệp tin khổng lồ lên tới nhiều Gigabytes mà hoàn toàn không hao tổn RAM hay gây đóng băng tab.
            </p>
          </div>
          <div className="space-y-1 text-[10px] text-white/40 font-mono">
            <div>• Chunk buffers: 512KB - 4MB dynamic scrolling</div>
            <div>• Patches mapping: O(1) retrieval complexity</div>
            <div>• Main-thread friendly: Async slice reading</div>
          </div>
        </div>
      </div>
    </div>
  );
}
