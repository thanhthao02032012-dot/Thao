import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Download, Undo, Loader2, Navigation, CheckCircle } from 'lucide-react';
import { EditRecord } from '../types';
import { auth } from '../firebase';
import { incrementStat } from '../utils/stats';

interface HexEditorProps {
  file: File;
  fileId: string;
  onClose?: () => void;
  onDataChange?: (newData: Uint8Array) => void;
  jumpToOffset?: number | null;
}

const ROW_HEIGHT = 24;

export default function HexEditor({ file, fileId, onClose, onDataChange, jumpToOffset }: HexEditorProps) {
  // UI metrics and controls
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const [itemsPerRow, setItemsPerRow] = useState(16);
  const [isLoading, setIsLoading] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [version, setVersion] = useState(0); // Trigger visual updates

  // 1. Giới hạn tuyệt đối: Chỉ duy trì tối đa 100 dòng dữ liệu trong bộ nhớ tại bất kỳ thời điểm nào
  const loadedDataRef = useRef<Uint8Array | null>(null);
  const loadedStartRowRef = useRef<number>(0);

  // Edits and History (retained client-side for Undo support)
  const [history, setHistory] = useState<EditRecord[]>([]);
  const [selectedOffset, setSelectedOffset] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const pendingFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const lastScrollTopRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentScrollTopRef = useRef<number>(0);
  const isScrollingUpRef = useRef<boolean>(false);

  // Responsive items per row
  useEffect(() => {
    const handleResize = () => {
      setItemsPerRow(window.innerWidth < 768 ? 8 : 16);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Measure viewport height using ResizeObserver to ensure robust fluid behavior
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setViewportHeight(entry.contentRect.height || 500);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Total heights and rows
  const totalRows = Math.ceil(file.size / itemsPerRow);
  const scrollHeight = totalRows * ROW_HEIGHT;

  // Active virtual scroll limits
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
  const visibleRowsCount = Math.ceil(viewportHeight / ROW_HEIGHT);
  const endRow = Math.min(totalRows - 1, startRow + visibleRowsCount + 1);

  // Compute windowStartRow - centered around the viewport with 40 rows buffer above
  // 1. Chặn lỗi số âm (Boundary Check): Đảm bảo không bao giờ nhỏ hơn 0
  let calculatedWindowStartRow = Math.max(0, Math.min(totalRows - 100, startRow - 40));
  if (calculatedWindowStartRow < 0) {
    calculatedWindowStartRow = 0;
  }
  const windowStartRow = calculatedWindowStartRow;

  // High-performance direct sliding window fetch function
  const fetchWindowData = async (targetStartRow: number) => {
    if (!fileId) return;

    // Abort any previous pending requests immediately to avoid race conditions and network congestion
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    isFetchingRef.current = true;
    setIsLoading(true);

    // 1. Chặn lỗi số âm (Boundary Check)
    let safeStartRow = targetStartRow;
    if (safeStartRow < 0) {
      safeStartRow = 0;
    }

    let startOffset = safeStartRow * itemsPerRow;
    if (startOffset < 0) {
      startOffset = 0;
    }
    const length = 100 * itemsPerRow; // Exactly 100 rows
    const safeLength = Math.min(length, file.size - startOffset);

    if (safeLength <= 0) {
      isFetchingRef.current = false;
      setIsLoading(false);
      return;
    }

    // 2. Dọn rác bắt buộc: Phải có lệnh xóa sạch dữ liệu cũ (gán bằng rỗng/null) khỏi mảng lưu trữ ngay trước khi nạp dữ liệu mới
    if (loadedDataRef.current) {
      loadedDataRef.current = null; // Gán bằng rỗng/null để giải phóng RAM của trình duyệt ngay lập tức
    }
    setVersion(v => v + 1); // Trigger render of loading skeleton instantly

    try {
      const response = await fetch(`/api/file/${fileId}/chunk?offset=${startOffset}&length=${safeLength}`, {
        signal: controller.signal
      });
      if (!response.ok) throw new Error('Range fetch failed');

      const arrayBuffer = await response.arrayBuffer();
      
      // Save new sliding window slice
      loadedDataRef.current = new Uint8Array(arrayBuffer);
      loadedStartRowRef.current = safeStartRow;
      setVersion(v => v + 1);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[AbortController]: Stale fetch request was successfully aborted.');
      } else {
        console.error('[Sliding Window Fetch Error]:', err);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        isFetchingRef.current = false;
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  // Initial load
  useEffect(() => {
    if (fileId) {
      fetchWindowData(0);
    }
  }, [fileId, itemsPerRow]);

  // 4. Hãm phanh sự kiện: Chức năng hãm tốc độ cho thao tác cuộn
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    
    // 1. Chặn lỗi số âm (Boundary Check)
    if (currentScrollTop < 0) return;

    // Detect scroll direction for symmetrical cleanup
    const isScrollingUp = currentScrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = currentScrollTop;
    isScrollingUpRef.current = isScrollingUp;

    setScrollTop(currentScrollTop);
    currentScrollTopRef.current = currentScrollTop;

    const firstVisibleRow = Math.floor(currentScrollTop / ROW_HEIGHT);
    let targetStartRow = Math.max(0, Math.min(totalRows - 100, firstVisibleRow - 40));
    if (targetStartRow < 0) {
      targetStartRow = 0;
    }

    // Check if the current visible view is already fully covered by the loaded window
    const isDataLoaded = loadedDataRef.current &&
                         loadedStartRowRef.current <= firstVisibleRow &&
                         (loadedStartRowRef.current + 100) >= (firstVisibleRow + visibleRowsCount + 2);

    if (!isDataLoaded) {
      // Clear any pending debounce timeout
      if (pendingFetchTimeoutRef.current) {
        clearTimeout(pendingFetchTimeoutRef.current);
        pendingFetchTimeoutRef.current = null;
      }

      // Hard Debounce: Delay 120ms to allow smooth high-speed continuous scrolling without network lag
      pendingFetchTimeoutRef.current = setTimeout(() => {
        const latestScrollTop = currentScrollTopRef.current;
        const latestFirstVisibleRow = Math.floor(latestScrollTop / ROW_HEIGHT);
        let latestTargetStartRow = Math.max(0, Math.min(totalRows - 100, latestFirstVisibleRow - 40));
        if (latestTargetStartRow < 0) {
          latestTargetStartRow = 0;
        }

        // 2. Dọn dẹp đối xứng: Nếu đang cuộn ngược lên hoặc xuống, dọn dẹp vùng cũ trước để giải phóng bộ nhớ ngay lập tức
        if (loadedDataRef.current) {
          loadedDataRef.current = null;
          setVersion(v => v + 1);
        }

        fetchWindowData(latestTargetStartRow);
      }, 120);
    }
  };

  // Jump To Offset handler
  useEffect(() => {
    if (jumpToOffset !== undefined && jumpToOffset !== null) {
      scrollToOffset(jumpToOffset);
    }
  }, [jumpToOffset, itemsPerRow]);

  const scrollToOffset = (offset: number) => {
    if (offset < 0 || offset >= file.size || !fileId) return;
    const targetRow = Math.floor(offset / itemsPerRow);
    const targetScrollTop = targetRow * ROW_HEIGHT;

    if (containerRef.current) {
      containerRef.current.scrollTop = targetScrollTop;
    }
    setScrollTop(targetScrollTop);

    setSelectedOffset(offset);

    // Bypass throttle on explicit jump request to keep interface snappy
    const targetStartRow = Math.max(0, Math.min(totalRows - 100, targetRow - 40));
    fetchWindowData(targetStartRow).then(() => {
      const loadedData = loadedDataRef.current;
      const loadedStartRow = loadedStartRowRef.current;
      if (loadedData && targetRow >= loadedStartRow && targetRow < loadedStartRow + 100) {
        const dataIdx = (targetRow - loadedStartRow) * itemsPerRow + (offset % itemsPerRow);
        if (dataIdx < loadedData.length) {
          setEditValue(loadedData[dataIdx].toString(16).padStart(2, '0').toUpperCase());
        }
      }
    });
  };

  const handleByteEdit = async (offset: number, valueStr: string) => {
    const val = parseInt(valueStr, 16);
    if (isNaN(val) || val < 0 || val > 255 || !fileId) return;

    const targetRow = Math.floor(offset / itemsPerRow);
    let oldValue = 0;

    // Retrieve original value from our active RAM cache
    const loadedData = loadedDataRef.current;
    const loadedStartRow = loadedStartRowRef.current;
    if (loadedData && targetRow >= loadedStartRow && targetRow < loadedStartRow + 100) {
      const dataIdx = (targetRow - loadedStartRow) * itemsPerRow + (offset % itemsPerRow);
      if (dataIdx < loadedData.length) {
        oldValue = loadedData[dataIdx];
      }
    }

    if (oldValue === val) return;

    try {
      // Commit change directly-to-disk on server
      const editRes = await fetch('/api/file/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, offset, value: val })
      });

      if (!editRes.ok) throw new Error('Edit failed');

      // Update current RAM sliding-window cache directly
      if (loadedData && targetRow >= loadedStartRow && targetRow < loadedStartRow + 100) {
        const dataIdx = (targetRow - loadedStartRow) * itemsPerRow + (offset % itemsPerRow);
        if (dataIdx < loadedData.length) {
          loadedData[dataIdx] = val;
        }
      }

      setHistory(prev => [...prev, { offset, oldValue, newValue: val }]);
      setVersion(v => v + 1);

      // Keep parent informed for visual previews / analysis if within first 5MB
      if (onDataChange && offset < 5 * 1024 * 1024) {
        const sliceLimit = Math.min(5 * 1024 * 1024, file.size);
        const subRes = await fetch(`/api/file/${fileId}/chunk?offset=0&length=${sliceLimit}`);
        if (subRes.ok) {
          onDataChange(new Uint8Array(await subRes.arrayBuffer()));
        }
      }

      if (auth.currentUser) {
        incrementStat(auth.currentUser.uid, 'hexEdits');
      }
    } catch (err) {
      console.error('Error during byte edit:', err);
      alert('Không thể lưu chỉnh sửa bit/byte lên máy chủ!');
    }
  };

  const handleUndo = async () => {
    if (history.length === 0 || !fileId) return;
    const lastEdit = history[history.length - 1];

    try {
      // Revert value directly-to-disk on server
      const revertRes = await fetch('/api/file/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, offset: lastEdit.offset, value: lastEdit.oldValue })
      });

      if (revertRes.ok) {
        // Revert in our sliding window cache
        const targetRow = Math.floor(lastEdit.offset / itemsPerRow);
        const loadedData = loadedDataRef.current;
        const loadedStartRow = loadedStartRowRef.current;
        if (loadedData && targetRow >= loadedStartRow && targetRow < loadedStartRow + 100) {
          const dataIdx = (targetRow - loadedStartRow) * itemsPerRow + (lastEdit.offset % itemsPerRow);
          if (dataIdx < loadedData.length) {
            loadedData[dataIdx] = lastEdit.oldValue;
          }
        }

        setHistory(prev => prev.slice(0, -1));
        setVersion(v => v + 1);

        // Sync parent components
        if (onDataChange && lastEdit.offset < 5 * 1024 * 1024) {
          const sliceLimit = Math.min(5 * 1024 * 1024, file.size);
          const subRes = await fetch(`/api/file/${fileId}/chunk?offset=0&length=${sliceLimit}`);
          if (subRes.ok) {
            onDataChange(new Uint8Array(await subRes.arrayBuffer()));
          }
        }
      }
    } catch (err) {
      console.error('Undo failed', err);
    }
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jumpInput.trim()) return;

    let offset = 0;
    if (jumpInput.toLowerCase().startsWith('0x')) {
      offset = parseInt(jumpInput.slice(2), 16);
    } else {
      offset = parseInt(jumpInput, 10);
      if (isNaN(offset)) {
        offset = parseInt(jumpInput, 16);
      }
    }

    if (isNaN(offset) || offset < 0 || offset >= file.size) {
      alert(`Nhập offset hợp lệ từ 0 đến ${file.size - 1}`);
      return;
    }

    scrollToOffset(offset);
    setJumpInput('');
  };

  const handleDownload = () => {
    if (!fileId) return;
    const url = `/api/file/download?fileId=${fileId}&filename=${encodeURIComponent(file.name)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.replace(/\.[^/.]+$/, "") + "_edited" + (file.name.match(/\.[^/.]+$/)?.[0] || "");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const activeByteVal = useMemo(() => {
    if (selectedOffset === null) return 0;
    return parseInt(editValue || '00', 16) || 0;
  }, [selectedOffset, editValue, version]);

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Top Toolbar */}
      <div className="hidden lg:flex items-center justify-between p-4 border-b border-white/10 shrink-0">
        <div className="flex items-center space-x-4">
          <h2 className="font-semibold text-white truncate max-w-xs">{file.name}</h2>
          <span className="text-sm text-white/50 shrink-0">{file.size.toLocaleString()} bytes</span>
        </div>
        <div className="flex items-center space-x-4 shrink-0">
          <form onSubmit={handleJumpSubmit} className="flex items-center space-x-2">
            <span className="text-white/40 text-xs">Tìm offset:</span>
            <input
              type="text"
              placeholder="Ví dụ: 0x4F hoặc 127"
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              className="w-40 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs font-mono outline-none focus:ring-1 focus:ring-purple-500"
            />
            <button
              type="submit"
              className="p-1.5 bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white rounded-lg transition-all"
            >
              <Navigation className="w-3.5 h-3.5 transform rotate-45" />
            </button>
          </form>

          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex items-center px-3 py-1.5 text-sm font-medium text-white/70 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white disabled:opacity-50 transition-colors"
          >
            <Undo className="w-4 h-4 mr-2" />
            Hoàn tác
          </button>

          <button
            onClick={handleDownload}
            disabled={isLoading}
            className="flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Tải xuống
          </button>
          {onClose && (
            <button onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-white/70 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors">
              Đóng
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col relative bg-[#0d111a]/80 backdrop-blur-md rounded-2xl border border-white/5 m-2 lg:m-4">
        {/* Mobile Toolbar */}
        <div className="lg:hidden absolute bottom-0 left-0 right-0 p-2 bg-[#121827]/95 backdrop-blur-xl border-t border-white/10 flex items-center gap-2 z-20 shadow-2xl shrink-0">
          <form onSubmit={handleJumpSubmit} className="flex-1 flex items-center space-x-1">
            <input
              type="text"
              placeholder="Offset..."
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs font-mono outline-none"
            />
          </form>
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex items-center justify-center px-3 py-2 text-xs font-medium text-white/70 bg-white/5 border border-white/10 rounded-lg disabled:opacity-50"
          >
            <Undo className="w-3.5 h-3.5 mr-1" />
            Undo
          </button>
          <button
            onClick={handleDownload}
            disabled={isLoading}
            className="flex items-center justify-center px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
            Tải về
          </button>
        </div>

        {/* Header Legend */}
        <div className="p-4 pb-2 border-b border-white/10 shrink-0">
          <div className="flex text-white/40 font-mono text-[10px] sm:text-xs">
            <div className="w-24 shrink-0 font-semibold uppercase tracking-wider">Offset</div>
            <div className="flex-1 flex justify-start space-x-[11px] font-semibold uppercase tracking-wider pl-1">
              {Array.from({ length: itemsPerRow }).map((_, i) => (
                <div key={i} className="text-center w-[17px]">{i.toString(16).padStart(2, '0').toUpperCase()}</div>
              ))}
            </div>
            <div className="w-32 shrink-0 tracking-widest hidden md:block pl-6 font-semibold uppercase">ASCII</div>
          </div>
        </div>

        {/* Viewport scroll container with Virtualized DOM reuse */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto custom-scrollbar relative"
        >
          {/* Scrollbar Height-spacer */}
          <div style={{ height: `${scrollHeight}px`, width: '100%', pointerEvents: 'none' }} />

          {/* 3. Tái sử dụng giao diện: Cấm tuyệt đối tạo khung mới. Chỉ tạo đúng 100 khung hiển thị ban đầu */}
          <div className="absolute top-0 left-0 w-full pointer-events-auto select-none" style={{ height: `${scrollHeight}px` }}>
            {Array.from({ length: 100 }).map((_, i) => {
              const rowIndex = windowStartRow + i;

              // Hide rows that are outside the file length
              if (rowIndex >= totalRows) {
                return (
                  <div key={i} className="hidden" />
                );
              }

              const rowStartOffset = rowIndex * itemsPerRow;
              const top = rowIndex * ROW_HEIGHT;

              // Get data for this specific row from RAM sliding window
              let rowBytes: Uint8Array | null = null;
              const loadedData = loadedDataRef.current;
              const loadedStartRow = loadedStartRowRef.current;

              if (loadedData && rowIndex >= loadedStartRow && rowIndex < loadedStartRow + 100) {
                const dataIdx = (rowIndex - loadedStartRow) * itemsPerRow;
                if (dataIdx < loadedData.length) {
                  rowBytes = loadedData.subarray(dataIdx, dataIdx + itemsPerRow);
                }
              }

              return (
                <div
                  key={i} // STRICT REQUIREMENT: Keep static loop index to force DOM node reuse!
                  style={{
                    position: 'absolute',
                    top: `${top}px`,
                    left: 0,
                    width: '100%',
                    height: `${ROW_HEIGHT}px`,
                  }}
                  className="flex items-center text-xs font-mono hover:bg-white/5 px-4 border-b border-white/[0.02]"
                >
                  {/* Offset header label */}
                  <div className="w-24 text-white/40 select-none">
                    {rowStartOffset.toString(16).padStart(8, '0').toUpperCase()}
                  </div>

                  {/* Hex bytes */}
                  <div className="flex-1 flex justify-start space-x-[11px] pl-1">
                    {Array.from({ length: itemsPerRow }).map((_, c) => {
                      const offset = rowStartOffset + c;
                      const isSelected = selectedOffset === offset;
                      const hasByte = rowBytes && c < rowBytes.length;
                      const byteVal = hasByte ? rowBytes![c] : null;

                      let hexStr = '..';
                      let isZero = true;
                      if (byteVal !== null) {
                        hexStr = byteVal.toString(16).padStart(2, '0').toUpperCase();
                        isZero = byteVal === 0;
                      }

                      if (isSelected) {
                        return (
                          <input
                            key={c}
                            type="text"
                            value={editValue}
                            maxLength={2}
                            autoFocus
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                              setEditValue(val);
                              if (val.length === 2) {
                                handleByteEdit(offset, val);
                                setSelectedOffset(null);
                              }
                            }}
                            onBlur={() => {
                              handleByteEdit(offset, editValue);
                              setSelectedOffset(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleByteEdit(offset, editValue);
                                setSelectedOffset(null);
                              } else if (e.key === 'Escape') {
                                setSelectedOffset(null);
                              }
                            }}
                            className="bg-purple-600 text-white font-mono font-bold text-xs text-center border-none rounded shadow-2xl focus:outline-none focus:ring-2 focus:ring-purple-400 w-6 h-5 z-10"
                          />
                        );
                      }

                      return (
                        <span
                          key={c}
                          onClick={() => {
                            if (byteVal !== null) {
                              setSelectedOffset(offset);
                              setEditValue(hexStr);
                            }
                          }}
                          className={`cursor-pointer px-1 rounded transition-all text-center select-all inline-block w-6
                            ${isSelected ? 'bg-purple-600 text-white font-bold ring-2 ring-purple-400' : ''}
                            ${!isSelected && byteVal !== null ? (isZero ? 'text-white/20' : 'text-white/80 hover:text-white hover:bg-white/10') : ''}
                            ${byteVal === null ? 'text-white/10' : ''}
                          `}
                        >
                          {hexStr}
                        </span>
                      );
                    })}
                  </div>

                  {/* ASCII Characters */}
                  <div className="w-32 shrink-0 pl-6 border-l border-white/5 ml-4 hidden md:flex space-x-0.5">
                    {Array.from({ length: itemsPerRow }).map((_, c) => {
                      const offset = rowStartOffset + c;
                      const isSelected = selectedOffset === offset;
                      const hasByte = rowBytes && c < rowBytes.length;
                      const byteVal = hasByte ? rowBytes![c] : null;

                      let asciiChar = '.';
                      let isZero = true;
                      if (byteVal !== null) {
                        asciiChar = (byteVal >= 32 && byteVal <= 126) ? String.fromCharCode(byteVal) : '.';
                        isZero = byteVal === 0;
                      }

                      return (
                        <span
                          key={c}
                          className={`w-[10px] text-center select-all
                            ${isSelected ? 'text-purple-400 font-bold' : ''}
                            ${!isSelected && byteVal !== null ? (isZero ? 'text-white/10' : 'text-white/40') : ''}
                            ${byteVal === null ? 'text-white/10' : ''}
                          `}
                        >
                          {asciiChar}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active loader overlay */}
          {isLoading && (
            <div className="absolute top-4 right-4 bg-[#121827]/80 backdrop-blur-md text-white rounded-full px-3 py-1 flex items-center space-x-2 text-xs border border-purple-500/20 shadow-lg z-30 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
              <span>Đang đọc...</span>
            </div>
          )}

          {/* Immersive backdrop canvas loading state */}
          {!loadedDataRef.current && isLoading && (
            <div className="sticky top-0 left-0 w-full h-full bg-[#0d111a]/60 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 select-none pointer-events-none" style={{ height: viewportHeight }}>
              <div className="bg-[#121827]/95 border border-purple-500/30 rounded-xl px-6 py-4 flex flex-col items-center space-y-3 shadow-2xl">
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                <span className="text-sm font-medium text-white/95">Đang đồng bộ dữ liệu từ server...</span>
                <span className="text-[10px] text-white/40 font-mono">Offset: 0x{(windowStartRow * itemsPerRow).toString(16).toUpperCase()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Bit-level editor panel */}
        {selectedOffset !== null && (
          <div className="bg-[#121827]/90 backdrop-blur-md border-t border-white/10 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 pb-20 lg:pb-4 shadow-2xl shrink-0 z-10 relative">
            <div className="flex items-center space-x-4 w-full sm:w-auto justify-between sm:justify-start">
              <span className="text-sm font-semibold text-white flex items-center">
                <CheckCircle className="w-4 h-4 text-purple-400 mr-2 animate-pulse" />
                Chỉnh sửa Bit
              </span>
              <span className="text-xs text-purple-400 font-mono bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
                0x{selectedOffset.toString(16).toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-center gap-1.5 w-full sm:w-auto">
              {Array.from({ length: 8 }).map((_, bitIndex) => {
                const shift = 7 - bitIndex;
                const bitVal = (activeByteVal >> shift) & 1;
                return (
                  <button
                    key={bitIndex}
                    onClick={() => {
                      const newByte = activeByteVal ^ (1 << shift);
                      handleByteEdit(selectedOffset!, newByte.toString(16));
                      if (auth.currentUser) {
                        incrementStat(auth.currentUser.uid, 'bitEdits');
                      }
                    }}
                    className={`flex-1 sm:w-8 h-8 rounded flex items-center justify-center font-mono text-sm font-semibold transition-all
                      ${bitVal ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {bitVal}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footnotes status bar */}
        <div className={`p-3 border-t border-white/10 bg-black/30 flex items-center justify-between shrink-0 text-xs text-white/40 ${selectedOffset !== null ? 'hidden lg:flex' : 'mb-14 lg:mb-0'}`}>
          <div>
            Hiển thị offset: <span className="font-mono font-semibold text-purple-400">0x{(startRow * itemsPerRow).toString(16).toUpperCase()}</span> - <span className="font-mono font-semibold text-purple-400">0x{Math.min(file.size, endRow * itemsPerRow).toString(16).toUpperCase()}</span>
          </div>
          <div>
            Dung lượng: <span className="font-semibold text-white/60">{file.size.toLocaleString()} bytes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
