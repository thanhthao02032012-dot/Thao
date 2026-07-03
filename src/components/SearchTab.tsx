import React, { useState, useEffect, useRef } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, X, Loader2, Navigation, Clipboard, HelpCircle, AlertCircle, 
  ChevronRight, ArrowRight, Play, Square, Percent, Cpu
} from 'lucide-react';
import { useUI } from './UIProvider';
import { readAndPatchChunk } from '../utils/fileStream';
import { SearchBrain } from '../lib/SearchBrain';

interface SearchTabProps {
  file: File;
  patches: Map<number, number>;
  virtualFileSize: number;
  onJumpToOffset: (offset: number) => void;
}

export default function SearchTab({ file, patches, virtualFileSize, onJumpToOffset }: SearchTabProps) {
  const { toast } = useUI();
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'hex' | 'ascii' | 'utf8' | 'utf16'>('ascii');
  const [isSearching, setIsSearching] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [scannedBytes, setScannedBytes] = useState(0);
  const [results, setResults] = useState<number[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(1000);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ie_search_history') || '[]');
    } catch {
      return [];
    }
  });

  const abortFlagRef = useRef<boolean>(false);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortFlagRef.current = true;
    };
  }, []);

  const saveHistory = (q: string) => {
    const updated = [q, ...history.filter(h => h !== q)].slice(0, 10);
    setHistory(updated);
    localStorage.setItem('ie_search_history', JSON.stringify(updated));
  };

  const handleCancel = () => {
    abortFlagRef.current = true;
    setIsSearching(false);
    toast('Đã dừng tìm kiếm', 'info');
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleStartSearch = async () => {
    if (!query.trim()) {
      toast('Vui lòng nhập chuỗi hoặc byte cần tìm!', 'warning');
      return;
    }

    // Fallback to existing binary search logic if no local results
    let pattern: Uint8Array;
    try {
      if (searchType === 'hex') {
        const cleanHex = query.replace(/\s+/g, '');
        if (cleanHex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(cleanHex)) {
          throw new Error('Chuỗi Hex không hợp lệ (phải là các cặp ký tự 0-9, A-F)');
        }
        const bytes = [];
        for (let i = 0; i < cleanHex.length; i += 2) {
          bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
        }
        pattern = new Uint8Array(bytes);
      } else if (searchType === 'ascii' || searchType === 'utf8') {
        const encoder = new TextEncoder();
        pattern = encoder.encode(query);
      } else if (searchType === 'utf16') {
        const bytes = new Uint8Array(query.length * 2);
        for (let i = 0; i < query.length; i++) {
          const code = query.charCodeAt(i);
          bytes[i * 2] = code & 0xFF;
          bytes[i * 2 + 1] = (code >> 8) & 0xFF;
        }
        pattern = bytes;
      } else {
        throw new Error('Chưa chọn định dạng');
      }
    } catch (err: any) {
      toast(err.message || 'Lỗi phân tích cú pháp tìm kiếm', 'error');
      return;
    }

    if (pattern.length === 0) {
      toast('Mẫu tìm kiếm không hợp lệ', 'warning');
      return;
    }

    saveHistory(query);

    // Initialize search state
    setIsSearching(true);
    setResults([]);
    setProgressPercent(0);
    setScannedBytes(0);
    setActiveResultIndex(-1);
    abortFlagRef.current = false;

    if (navigator.vibrate) navigator.vibrate(15);

    const maxMatches = 10000000; // 10 million limit
    const CHUNK_SIZE = 512 * 1024; // 512KB slice size for fast & non-blocking execution
    const overlap = pattern.length - 1;
    let offset = 0;
    const foundOffsets: number[] = [];
    let lastUiUpdateTime = Date.now();
    
    // Incremental generator / loop yielding thread back to React
    const searchStep = async () => {
      if (abortFlagRef.current || offset >= virtualFileSize || foundOffsets.length >= maxMatches) {
        setIsSearching(false);
        setProgressPercent(100);
        setScannedBytes(virtualFileSize);
        setResults([...foundOffsets]); // Final update
        if (foundOffsets.length === 0) {
          toast('Không tìm thấy kết quả phù hợp', 'info');
        } else {
          toast(`Tìm kiếm hoàn tất! Tìm thấy ${foundOffsets.length} kết quả.`, 'success');
        }
        return;
      }

      const bytesToRead = Math.min(CHUNK_SIZE, virtualFileSize - offset);
      
      // Read & apply active patches offline
      const buffer = await readAndPatchChunk(file, offset, bytesToRead, patches, virtualFileSize);

      // Perform fast sub-buffer matching
      let matchCountThisChunk = 0;
      for (let i = 0; i <= buffer.length - pattern.length; i++) {
        let match = true;
        for (let j = 0; j < pattern.length; j++) {
          if (buffer[i + j] !== pattern[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          foundOffsets.push(offset + i);
          matchCountThisChunk++;
          if (foundOffsets.length >= maxMatches) {
            break;
          }
          i += pattern.length - 1; // Skip ahead
        }
      }

      // Update progress variables
      const nextOffset = offset + (CHUNK_SIZE - overlap);
      offset = nextOffset;
      setScannedBytes(Math.min(offset, virtualFileSize));
      setProgressPercent(Math.floor((Math.min(offset, virtualFileSize) / virtualFileSize) * 100));

      // Batch updates to avoid React component lag and GC pressure
      const now = Date.now();
      if (now - lastUiUpdateTime > 100) { // Update UI at most 10 times a second
        setResults([...foundOffsets]);
        lastUiUpdateTime = now;
      }

      // Yield execution cleanly to prevent browser frame drop
      requestAnimationFrame(() => {
        searchStep();
      });
    };

    // Trigger initial run step
    searchStep();
  };

  const remainingBytes = virtualFileSize - scannedBytes;
  const remainingMB = (remainingBytes / (1024 * 1024)).toFixed(1);

  const formatOffset = (off: number) => {
    return `0x${off.toString(16).toUpperCase()}`;
  };

  return (
    <div className="space-y-6 text-left">
      {/* Search Console Header and input controls */}
      <div className="bg-[#121829]/65  rounded-3xl border border-white/10 p-5 md:p-6  space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center">
            <Search className="w-4 h-4 text-purple-400 mr-2" />
            Trình tìm kiếm Hex & Văn Bản Non-blocking
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Duyệt tìm cụm từ hoặc chuỗi byte nhị phân cực nhanh mà không khóa luồng xử lý của trình duyệt, bảo đảm mượt mà 60fps.
          </p>
        </div>

        {/* Form controls */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 flex items-center">
            <input
              type="text"
              placeholder={searchType === 'hex' ? 'Ví dụ: 90 90 90 hoặc EB 1E' : 'Nhập văn bản cần tìm kiếm...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isSearching}
              className="bg-transparent border-none outline-none focus:ring-0 text-white placeholder-white/30 text-sm font-mono w-full"
              onKeyDown={(e) => e.key === 'Enter' && handleStartSearch()}
            />
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={searchType}
              onChange={(e: any) => setSearchType(e.target.value)}
              disabled={isSearching}
              className="bg-[#121829] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white/80 font-mono outline-none focus:ring-1 focus:ring-purple-500/50 cursor-pointer"
            >
              <option value="ascii">ASCII</option>
              <option value="utf8">UTF-8</option>
              <option value="utf16">UTF-16LE</option>
              <option value="hex">Hex Bytes</option>
            </select>

            {isSearching ? (
              <button
                onClick={handleCancel}
                className="flex items-center space-x-1.5 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 font-bold rounded-xl text-xs transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-red-400/20" />
                <span>Dừng</span>
              </button>
            ) : (
              <button
                onClick={handleStartSearch}
                className="flex items-center space-x-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-purple-600/15"
              >
                <Play className="w-3.5 h-3.5 fill-white/20" />
                <span>Tìm</span>
              </button>
            )}
          </div>
        </div>

        {/* History Tags */}
        {history.length > 0 && !isSearching && (
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="text-[10px] text-white/30 uppercase mr-2 self-center">Lịch sử:</span>
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => setQuery(h)}
                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-[10px] font-mono text-white/60 hover:text-white transition-colors"
              >
                {h}
              </button>
            ))}
          </div>
        )}

        {/* Progress Bar Shimmer details */}
        {isSearching && (
          <div className="space-y-2 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between text-xs text-white/60 font-mono">
              <span className="flex items-center text-purple-400 font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Đang quét file: {progressPercent}%
              </span>
              <span>Còn lại: {remainingMB} MB</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10 relative">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 rounded-full transition-all duration-100 "
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results grid container */}
      <div className="bg-[#121829]/40  rounded-3xl border border-white/5 p-5 shadow-2xl min-h-[300px] flex flex-col">
        <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
          <span className="text-xs font-bold text-white/50 uppercase tracking-widest">
            Danh sách kết quả ({results.length})
          </span>
          {results.length > 0 && (
            <span className="text-[10px] text-white/30 font-mono">
              Nhấp kết quả để nhảy offset (Jump to Offset)
            </span>
          )}
        </div>

        {results.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-white/20 text-center">
            <Cpu className="w-10 h-10 mb-2 stroke-[1.5]" />
            <span className="text-xs">Chưa có kết quả tìm kiếm nào.</span>
          </div>
        ) : (
          <div className="max-h-[400px] flex flex-col space-y-4">
            <VirtuosoGrid
              style={{ height: '400px' }}
              totalCount={Math.min(results.length, visibleLimit)}
              listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
              itemClassName="p-1"
              endReached={() => {
                if (results.length > visibleLimit) {
                  setVisibleLimit(prev => prev + 1000);
                }
              }}
              itemContent={(idx) => {
                const offset = results[idx];
                return (
                  <button
                    onClick={() => {
                      setActiveResultIndex(idx);
                      onJumpToOffset(offset);
                      toast(`Đã nhảy tới offset ${formatOffset(offset)}`, 'info');
                      if (navigator.vibrate) navigator.vibrate(10);
                    }}
                    className={`w-full p-3 rounded-2xl text-left border transition-all flex flex-col justify-between ${
                      activeResultIndex === idx 
                        ? 'bg-purple-600/20 border-purple-500 text-purple-200 ' 
                        : 'bg-white/[0.02] border-white/5 text-white/75 hover:bg-white/[0.04] hover:border-white/10'
                    }`}
                  >
                    <span className="text-[10px] text-white/30 font-mono">#{idx + 1}</span>
                    <span className="text-xs font-bold font-mono mt-1 text-white">{formatOffset(offset)}</span>
                    <div className="flex items-center text-[9px] text-purple-400 font-bold font-mono mt-1.5 uppercase">
                      <span>Jump To</span>
                      <ArrowRight className="w-2.5 h-2.5 ml-1" />
                    </div>
                  </button>
                );
              }}
            />
            {results.length > visibleLimit && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setVisibleLimit(prev => prev + 1000)}
                  className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold uppercase text-white/60 hover:text-white transition-all flex items-center gap-2"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Tải thêm kết quả ({visibleLimit} / {results.length})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
