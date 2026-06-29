import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutGrid, FileText, Image, AlignLeft, Info, Workflow, Search, Edit2, Sliders,
  Plus, X, Download, Grid, ArrowRight, CheckCircle, Cpu, ShieldCheck, Play, Trash2, FileCode, Sparkles
} from 'lucide-react';
import { useUI } from './UIProvider';
import { downloadPatchedFileStream } from '../utils/fileStream';
import { startAnalysisWorker, performDeepAnalysis, AnalysisResult } from '../utils/fileAnalyzer';

// Lazy-loaded sub-tabs to maximize speed and free up RAM
const OverviewTab = React.lazy(() => import('./OverviewTab'));
const ContentTab = React.lazy(() => import('./ContentTab'));
const MediaPreview = React.lazy(() => import('./MediaPreview'));
const StringsTab = React.lazy(() => import('./StringsTab'));
const MetadataTab = React.lazy(() => import('./MetadataTab'));
const StructureTab = React.lazy(() => import('./StructureTab'));
const SearchTab = React.lazy(() => import('./SearchTab'));
const SmartEditTab = React.lazy(() => import('./SmartEditTab'));
const HexEditor = React.lazy(() => import('./HexEditor'));

import BottomStatusLine from './BottomStatusLine';
import FloatingMenuFAB from './FloatingMenuFAB';
import DevPerformanceBoard from './DevPerformanceBoard';

interface WorkspaceProps {
  file: File;
  fileId?: string;
  onClose: () => void;
}

interface FileItem {
  id: string;
  name: string;
  file: File;
  patches: Map<number, number>;
  virtualFileSize: number;
  openTime: number;
}

export default function Workspace({ file, fileId = '', onClose }: WorkspaceProps) {
  const { toast } = useUI();
  
  // Navigation tabs selection
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'media' | 'strings' | 'metadata' | 'structure' | 'search' | 'edit' | 'advanced'>('edit');

  // Multi-file state array manager
  const [openFiles, setOpenFiles] = useState<FileItem[]>([
    { id: 'file_0', name: file.name, file, patches: new Map(), virtualFileSize: file.size, openTime: Date.now() }
  ]);
  const [activeFileId, setActiveFileId] = useState<string>('file_0');
  const [isTabGridViewOpen, setIsTabGridViewOpen] = useState(false);

  // Advanced mode unlock state
  const [isAdvancedUnlocked, setIsAdvancedUnlocked] = useState(false);

  // Mode: Auto, Easy, Advanced
  const [appMode, setAppMode] = useState<'easy' | 'advanced'>('easy');

  // Performance mode with persistence across reloads
  const [perfMode, setPerfMode] = useState<'lite' | 'balanced' | 'professional'>(() => {
    const saved = localStorage.getItem('ie_perf_mode') as any;
    if (saved) return saved;
    // Auto-detect based on file size
    if (file.size > 50 * 1024 * 1024) return 'lite'; // > 50MB
    return 'balanced';
  });

  // Watch file size and auto-throttle if needed
  useEffect(() => {
    if (file.size > 50 * 1024 * 1024 && perfMode !== 'lite') {
      setPerfMode('lite');
      toast('Tệp tin lớn > 50MB, đã tự động chuyển sang Chế độ Hiệu năng (Lite) để chống giật lag.', 'warning');
    }
  }, [file.size]);

  useEffect(() => {
    localStorage.setItem('ie_perf_mode', perfMode);
  }, [perfMode]);

  // Real-time progressive scan metrics (Chunk, Total, Speed)
  const [scanMetrics, setScanMetrics] = useState<any>({
    chunk: 0,
    totalChunks: 0,
    speed: 0
  });

  // Restore saved patches helper
  const getSavedPatchesForFile = (name: string, size: number): Map<number, number> => {
    try {
      const registryStr = localStorage.getItem('ie_file_patches_registry');
      if (registryStr) {
        const registry = JSON.parse(registryStr);
        const key = `${name}_${size}`;
        if (registry[key]) {
          return new Map(registry[key]);
        }
      }
    } catch (e) {
      console.error('Failed to restore patches:', e);
    }
    return new Map();
  };

  // Analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [showAnalysisSummary, setShowAnalysisSummary] = useState(true);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Analysis cache key record
  const [analysisCache, setAnalysisCache] = useState<Record<string, AnalysisResult>>({});

  // Active file details proxy helpers with robust safety guards to prevent white screen crashes
  const activeFileItem = openFiles.find(item => item.id === activeFileId) || openFiles[0] || {
    id: 'file_0',
    name: file.name,
    file,
    patches: new Map(),
    virtualFileSize: file.size,
    openTime: Date.now()
  };
  const activeFile = activeFileItem.file || file;
  const activePatches = activeFileItem.patches || new Map();
  const activeFileSize = activeFileItem.virtualFileSize || file.size;
  const activeOpenTime = activeFileItem.openTime || Date.now();

  // Propagation state for offsets jumps
  const [jumpToOffset, setJumpToOffset] = useState<number | null>(null);

  // Mounted tabs for instant switching (cache DOM)
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set([activeTab]));

  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // Save patches to localStorage whenever openFiles changes
  useEffect(() => {
    const patchRegistry: Record<string, [number, number][]> = {};
    openFiles.forEach(f => {
      if (f.patches && f.patches.size > 0) {
        const key = `${f.name}_${f.virtualFileSize}`;
        patchRegistry[key] = Array.from(f.patches.entries());
      }
    });
    localStorage.setItem('ie_file_patches_registry', JSON.stringify(patchRegistry));
  }, [openFiles]);

  // 1. Asynchronous File Analysis & Cache checking
  useEffect(() => {
    const fileCacheKey = `${activeFile.name}_${activeFile.size}_${activeFile.lastModified}`;
    const abortController = new AbortController();
    
    // Check if there are saved patches in localStorage to restore
    const restoredPatches = getSavedPatchesForFile(activeFile.name, activeFile.size);
    if (restoredPatches.size > 0) {
      setActivePatches(restoredPatches);
    }

    if (analysisCache[fileCacheKey]) {
      setAnalysisResult(analysisCache[fileCacheKey]);
      setIsAnalyzing(false);
      setAnalysisProgress(100);
      setAnalysisStatus('Done');
      setShowAnalysisSummary(false); // Direct access
      setScanMetrics({
        chunk: 1,
        totalChunks: 1,
        speed: 0
      });
      return;
    }

    const runAnalysis = async () => {
      setIsAnalyzing(true);
      setShowAnalysisSummary(false); // Do not block UI
      setAnalysisProgress(0);
      setAnalysisStatus('Initializing...');
      setScanMetrics({
        chunk: 0,
        totalChunks: 0,
        speed: 0
      });
      
      const worker = startAnalysisWorker(
        activeFile,
        (prog, status, metrics) => {
          setAnalysisProgress(prog);
          if (status) setAnalysisStatus(status);
          if (metrics) setScanMetrics(metrics);
        },
        (result) => {
          setAnalysisResult(result);
          setAnalysisCache(prev => ({ ...prev, [fileCacheKey]: result }));
          setIsAnalyzing(false);
          setAnalysisProgress(100);
          setAnalysisStatus('Done');
        },
        (error) => {
          console.error("Analysis failed:", error);
          toast("Không thể phân tích tệp tin", "error");
          setIsAnalyzing(false);
        },
        perfMode
      );

      abortController.signal.addEventListener('abort', () => {
        worker.terminate();
      });
    };

    runAnalysis();

    return () => {
      abortController.abort();
    };
  }, [activeFileId, activeFile, perfMode]);

  // Sync back new files if parent prop changes
  useEffect(() => {
    const exists = openFiles.some(f => f.file.name === file.name && f.file.size === file.size);
    if (!exists) {
      const newId = `file_${Date.now()}`;
      setOpenFiles(prev => [
        ...prev,
        { id: newId, name: file.name, file, patches: new Map(), virtualFileSize: file.size, openTime: Date.now() }
      ]);
      setActiveFileId(newId);
    }
  }, [file]);

  // Set local patches for the active file item
  const setActivePatches = (update: any) => {
    setOpenFiles(prev => prev.map(item => {
      if (item.id === activeFileId) {
        const nextPatches = typeof update === 'function' ? update(item.patches) : update;
        return { ...item, patches: nextPatches };
      }
      return item;
    }));
  };

  const setVirtualFileSize = (size: number) => {
    setOpenFiles(prev => prev.map(item => {
      if (item.id === activeFileId) {
        return { ...item, virtualFileSize: size };
      }
      return item;
    }));
  };

  const handleAddFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const newId = `file_${Date.now()}`;
    setOpenFiles(prev => [
      ...prev,
      { id: newId, name: selected.name, file: selected, patches: new Map(), virtualFileSize: selected.size, openTime: Date.now() }
    ]);
    setActiveFileId(newId);
    toast(`Đã tải thêm tệp: ${selected.name}`, 'success');
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleCloseFileTab = (idToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (openFiles.length === 1) {
      onClose();
      return;
    }
    const index = openFiles.findIndex(item => item.id === idToClose);
    const remaining = openFiles.filter(item => item.id !== idToClose);
    setOpenFiles(remaining);

    if (activeFileId === idToClose) {
      const nextActive = remaining[Math.max(0, index - 1)];
      setActiveFileId(nextActive.id);
    }
    toast('Đã đóng tab tệp tin', 'info');
    if (navigator.vibrate) navigator.vibrate(5);
  };

  // Callback to patch bytes at a specific index from high-level strings editing
  const handlePatchString = (offset: number, originalLen: number, newValue: string) => {
    const encoder = new TextEncoder();
    const encodedBytes = encoder.encode(newValue);
    
    setActivePatches((prevPatches: Map<number, number>) => {
      const nextPatches = new Map(prevPatches);
      
      // Write new characters
      for (let i = 0; i < encodedBytes.length; i++) {
        nextPatches.set(offset + i, encodedBytes[i]);
      }
      
      // Pad remainder of original length with null bytes to preserve file structure offsets
      if (encodedBytes.length < originalLen) {
        for (let i = encodedBytes.length; i < originalLen; i++) {
          nextPatches.set(offset + i, 0x00);
        }
      }
      
      return nextPatches;
    });
  };

  // Apply simple write/replace patch from simple editor tab
  const handleApplySimplePatch = (offset: number, hexString: string) => {
    const bytes: number[] = [];
    for (let i = 0; i < hexString.length; i += 2) {
      bytes.push(parseInt(hexString.substr(i, 2), 16));
    }

    setActivePatches((prevPatches: Map<number, number>) => {
      const nextPatches = new Map(prevPatches);
      for (let i = 0; i < bytes.length; i++) {
        nextPatches.set(offset + i, bytes[i]);
      }
      return nextPatches;
    });
  };

  // Apply range fill patch
  const handleApplyFillPatch = (offset: number, length: number, fillByte: number) => {
    setActivePatches((prevPatches: Map<number, number>) => {
      const nextPatches = new Map(prevPatches);
      for (let i = 0; i < length; i++) {
        nextPatches.set(offset + i, fillByte);
      }
      return nextPatches;
    });
  };

  // Apply entire text updates (ContentTab plain-text replacement)
  const handleSaveTextContent = (newBytes: Uint8Array) => {
    // Clear all old patches to ensure fresh plain-text stream
    const newPatches = new Map<number, number>();
    for (let i = 0; i < newBytes.length; i++) {
      newPatches.set(i, newBytes[i]);
    }
    
    setActivePatches(newPatches);
    setVirtualFileSize(newBytes.length);
    
    // Refresh the analysis result cache for this file
    const fileCacheKey = `${activeFile.name}_${activeFile.size}_${activeFile.lastModified}`;
    if (analysisResult) {
      const updatedResult: AnalysisResult = {
        ...analysisResult,
        textContent: new TextDecoder('utf-8').decode(newBytes),
        metadata: analysisResult.metadata.map(m => {
          if (m.key === 'size') {
            return { ...m, value: `${(newBytes.length / 1024).toFixed(2)} KB (${newBytes.length.toLocaleString()} bytes)` };
          }
          return m;
        })
      };
      setAnalysisResult(updatedResult);
      setAnalysisCache(prev => ({ ...prev, [fileCacheKey]: updatedResult }));
    }
  };

  // Jump to offset helper
  const handleJumpOffsetTrigger = () => {
    const target = prompt('Nhập địa chỉ Offset cần nhảy tới (ví dụ: 0x1A0 hoặc 512):');
    if (target === null) return;
    try {
      const clean = target.trim().toLowerCase();
      let parsed = 0;
      if (clean.startsWith('0x')) {
        parsed = parseInt(clean, 16);
      } else {
        parsed = parseInt(clean, 10);
      }
      if (isNaN(parsed) || parsed < 0 || parsed >= activeFileSize) {
        throw new Error('Offset nằm ngoài kích thước tệp tin');
      }
      setJumpToOffset(parsed);
      setIsAdvancedUnlocked(true);
      setActiveTab('advanced');
      toast(`Nhảy tới offset 0x${parsed.toString(16).toUpperCase()}`, 'success');
    } catch (err: any) {
      toast(err.message || 'Offset không hợp lệ', 'error');
    }
  };

  // Patched file exporter triggers
  const handleDownloadPatchedFile = async () => {
    toast('Đang nén patch và kết xuất tệp...', 'info');
    try {
      await downloadPatchedFileStream(activeFile, activePatches, activeFileSize, activeFile.name);
      toast('Tải xuống thành công!', 'success');
      if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
    } catch (err) {
      toast('Thao tác tải xuống thất bại', 'error');
    }
  };

  const navTabs = [
    { id: 'edit', label: 'Smart Editor', icon: Sparkles, modes: ['easy', 'advanced'] },
    { id: 'overview', label: 'Dashboard', icon: LayoutGrid, modes: ['easy', 'advanced'] },
    { id: 'content', label: 'Nội dung', icon: FileText, modes: ['easy', 'advanced'] },
    { id: 'media', label: 'Media', icon: Image, modes: ['easy', 'advanced'] },
    { id: 'search', label: 'Search', icon: Search, modes: ['easy', 'advanced'] },
    { id: 'metadata', label: 'Metadata', icon: Info, modes: ['easy', 'advanced'] },
    { id: 'structure', label: 'Structure', icon: Workflow, modes: ['advanced'] },
    { id: 'strings', label: 'Strings', icon: AlignLeft, modes: ['advanced'] },
    { id: 'advanced', label: 'Hex Editor', icon: Sliders, modes: ['advanced'] }
  ].filter(t => t.modes.includes(appMode));

  return (
    <div className="flex-1 min-h-screen bg-[#070b13] flex flex-col relative overflow-hidden font-sans">
      
      {/* Background glow neon effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-500/[0.04] blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/[0.04] blur-[160px] rounded-full pointer-events-none" />

      {/* Header bar */}
      <header className="bg-[#0b0f19]/80 backdrop-blur-xl border-b border-white/5 py-3 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-600/25">
            <Cpu className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-xs font-bold text-white tracking-wide uppercase">Intelligent File Editor</h1>
            <p className="text-[10px] text-purple-400 font-mono tracking-tight font-bold uppercase">Smart Engine v3.0</p>
          </div>
        </div>

        {/* Multi-file tabs */}
        <div className="hidden md:flex items-center space-x-2 bg-black/40 border border-white/5 p-1 rounded-xl max-w-lg overflow-x-auto">
          {openFiles.map((f) => (
            <div
              key={f.id}
              onClick={() => {
                setActiveFileId(f.id);
                if (navigator.vibrate) navigator.vibrate(5);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center space-x-2 shrink-0 ${
                activeFileId === f.id 
                  ? 'bg-purple-600/25 border border-purple-500/30 text-purple-200 shadow' 
                  : 'text-white/40 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span className="truncate max-w-[100px]">{f.name}</span>
              <button 
                onClick={(e) => handleCloseFileTab(f.id, e)}
                className="p-0.5 rounded hover:bg-white/10 text-white/40 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          
          <label className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white cursor-pointer transition-colors flex items-center shrink-0">
            <Plus className="w-3.5 h-3.5" />
            <input type="file" onChange={handleAddFile} className="hidden" />
          </label>
        </div>

        {/* Mobile top-right menu triggers */}
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => {
              setActiveTab('search');
              if (navigator.vibrate) navigator.vibrate(8);
            }}
            className="p-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/20 rounded-xl text-purple-400 transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
          
          <button 
            onClick={() => {
              setIsTabGridViewOpen(true);
              if (navigator.vibrate) navigator.vibrate(8);
            }}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white/80 transition-colors relative"
          >
            <Grid className="w-4 h-4" />
            {openFiles.length > 1 && (
              <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-purple-600 text-[9px] font-bold text-white flex items-center justify-center shadow">
                {openFiles.length}
              </span>
            )}
          </button>
          
          <button 
            onClick={onClose}
            className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold transition-all"
          >
            Đóng
          </button>
        </div>
      </header>

      {/* Main viewport block */}
      <main className="flex-1 overflow-hidden relative flex flex-col p-4 md:p-6 pb-28">
        <AnimatePresence mode="wait">
          
          {/* Initial Asynchronous Analysis Screen */}
          {showAnalysisSummary ? (
            <motion.div
              key="analysis_screen"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center max-w-xl mx-auto w-full text-center space-y-6 py-6"
            >
              {isAnalyzing ? (
                <div className="bg-[#121829]/60 border border-white/10 rounded-3xl p-8 w-full shadow-2xl space-y-6">
                  <div className="w-12 h-12 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto shadow-lg" />
                  <div className="space-y-2">
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">{analysisStatus || 'Đang phân tích cấu trúc file…'}</h3>
                    <p className="text-xs text-white/40">Quét chữ ký nhị phân, giải mã chuỗi ASCII và siêu dữ liệu tệp.</p>
                  </div>

                  {/* High performance progress bar */}
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-100"
                        style={{ width: `${analysisProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-mono text-purple-400 font-bold">{analysisProgress.toFixed(1)}% Hoàn tất</span>
                      {scanMetrics.totalChunks > 0 && (
                        <span className="text-[9px] font-mono text-white/30">
                          Chunk {scanMetrics.chunk} / {scanMetrics.totalChunks} • {scanMetrics.speed.toFixed(1)} MB/s
                        </span>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      // Abort logic is handled by the useEffect cleanup, but we can force it here
                      setIsAnalyzing(false);
                      setAnalysisResult(null);
                      toast("Đã hủy phân tích tệp tin", "info");
                    }}
                    className="px-6 py-2 bg-white/5 hover:bg-red-500/10 text-white/40 hover:text-red-400 border border-white/10 hover:border-red-500/20 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Hủy bỏ quá trình (Cancel)
                  </button>
                </div>
              ) : (
                <div className="bg-[#121829]/60 border border-white/10 rounded-3xl p-6 sm:p-8 w-full shadow-2xl space-y-6 text-left">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">✓ Đã phân tích hoàn tất!</h3>
                      <p className="text-[10px] text-white/40 font-mono">File ID: {activeFileId}</p>
                    </div>
                  </div>

                  {/* List of auto-detected contents */}
                  <div className="border-t border-white/5 pt-4 space-y-4">
                    <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider block">Các phần tử đã phát hiện:</span>
                    <div className="grid grid-cols-2 gap-2.5">
                      {analysisResult && Object.entries(analysisResult.detectedItems).map(([key, val]) => {
                        const labels: Record<string, string> = {
                          images: '• Hình ảnh (Media Preview)',
                          text: '• Văn bản (Plain Text)',
                          strings: '• Chuỗi ký tự (Strings)',
                          metadata: '• Siêu dữ liệu (Metadata)',
                          dates: '• Ngày tháng (Dates)',
                          urls: '• Địa chỉ URL (Endpoints)',
                          versions: '• Phiên bản (Version)',
                          header: '• Header nhận diện (Header)',
                          footer: '• Footer nhận diện (Footer)',
                          dataBlocks: '• Block dữ liệu (Data block)'
                        };
                        const displayLabel = labels[key] || key;
                        return (
                          <div 
                            key={key}
                            className={`px-3 py-2 border rounded-xl text-xs font-semibold ${
                              val 
                                ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-300' 
                                : 'bg-white/[0.01] border-white/5 text-white/20'
                            }`}
                          >
                            {displayLabel}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowAnalysisSummary(false);
                      setActiveTab('overview');
                      if (navigator.vibrate) navigator.vibrate(12);
                    }}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-purple-600/25 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <span>Khám phá và Chỉnh sửa tệp</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col overflow-y-auto hide-scrollbar">
              <React.Suspense fallback={
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Cpu className="w-5 h-5 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Đang tải phân hệ...</h4>
                    <p className="text-[10px] text-white/40">Giải nén module độc lập để tiết kiệm bộ nhớ RAM.</p>
                  </div>
                </div>
              }>
                {/* 2. Main Lazy Tab Router (Mounted tabs are cached in DOM for instant switching) */}
                {mountedTabs.has('overview') && (
                  <div className={activeTab === 'overview' ? 'block' : 'hidden'}>
                    <OverviewTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      analysis={analysisResult}
                      onNavigateTab={(tid: any) => {
                        setActiveTab(tid);
                        if (navigator.vibrate) navigator.vibrate(10);
                      }}
                      onUnlockAdvanced={() => setIsAdvancedUnlocked(true)}
                      isAdvancedUnlocked={isAdvancedUnlocked}
                      patches={activePatches}
                      onApplyPatch={(offset, val) => {
                        setActivePatches(prev => {
                          const next = new Map(prev);
                          next.set(offset, val);
                          return next;
                        });
                      }}
                      onClearPatches={() => setActivePatches(new Map())}
                      onImportPatches={(imported) => setActivePatches(imported)}
                      perfMode={perfMode}
                      onChangePerfMode={setPerfMode}
                      scanMetrics={scanMetrics}
                      appMode={appMode}
                      setAppMode={setAppMode}
                    />
                  </div>
                )}

                {mountedTabs.has('content') && (
                  <div className={activeTab === 'content' ? 'block' : 'hidden'}>
                    <ContentTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      isText={analysisResult?.isText || false}
                      initialTextContent={analysisResult?.textContent || ''}
                      onSaveContent={handleSaveTextContent}
                    />
                  </div>
                )}

                {mountedTabs.has('media') && (
                  <div className={activeTab === 'media' ? 'block' : 'hidden'}>
                    <div className="bg-[#121829]/40 border border-white/5 rounded-3xl p-5 md:p-6 shadow-2xl">
                      <h3 className="text-sm font-bold text-white mb-5 flex items-center">
                        <Image className="w-4 h-4 text-purple-400 mr-2" />
                        Bộ xem trước đa phương tiện (Media Preview)
                      </h3>
                      <MediaPreview file={activeFile} patches={activePatches} virtualFileSize={activeFileSize} />
                    </div>
                  </div>
                )}

                {mountedTabs.has('strings') && (
                  <div className={activeTab === 'strings' ? 'block' : 'hidden'}>
                    <StringsTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      onJumpToOffset={(off) => {
                        setJumpToOffset(off);
                        setIsAdvancedUnlocked(true);
                        setActiveTab('advanced');
                      }}
                      onPatchString={handlePatchString}
                    />
                  </div>
                )}

                {mountedTabs.has('metadata') && (
                  <div className={activeTab === 'metadata' ? 'block' : 'hidden'}>
                    <MetadataTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      analysis={analysisResult}
                      onUpdateMetadataString={handlePatchString}
                    />
                  </div>
                )}

                {mountedTabs.has('structure') && (
                  <div className={activeTab === 'structure' ? 'block' : 'hidden'}>
                    <StructureTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      analysis={analysisResult}
                      onJumpToOffset={(off) => {
                        setJumpToOffset(off);
                        setIsAdvancedUnlocked(true);
                        setActiveTab('advanced');
                      }}
                    />
                  </div>
                )}

                {mountedTabs.has('search') && (
                  <div className={activeTab === 'search' ? 'block' : 'hidden'}>
                    <SearchTab
                      file={activeFile}
                      patches={activePatches}
                      virtualFileSize={activeFileSize}
                      onJumpToOffset={(off) => {
                        setJumpToOffset(off);
                        setIsAdvancedUnlocked(true);
                        setActiveTab('advanced');
                      }}
                    />
                  </div>
                )}

                {mountedTabs.has('edit') && (
                  <div className={activeTab === 'edit' ? 'block' : 'hidden'}>
                    <SmartEditTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      analysis={analysisResult}
                      onApplyPatch={handleApplySimplePatch}
                      onNavigateTab={(tid: any) => {
                        setActiveTab(tid);
                        if (navigator.vibrate) navigator.vibrate(10);
                      }}
                      onJumpToOffset={(off) => {
                        setJumpToOffset(off);
                        setIsAdvancedUnlocked(true);
                      }}
                    />
                  </div>
                )}

                {mountedTabs.has('advanced') && (
                  <div className={activeTab === 'advanced' ? 'block h-full' : 'hidden'}>
                    <div className="flex-1 h-full min-h-[480px]">
                      {isAdvancedUnlocked ? (
                        <HexEditor
                          file={activeFile}
                          fileId={activeFileId}
                          onDataChange={() => {}}
                          jumpToOffset={jumpToOffset}
                          patches={activePatches}
                          setPatches={setActivePatches}
                          virtualFileSize={activeFileSize}
                          setVirtualFileSize={setVirtualFileSize}
                          initialActiveToolTab="search"
                          showToolsPanelProp={true}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto py-16 text-center space-y-5">
                          <div className="p-4 bg-purple-600/10 border border-purple-500/20 text-purple-400 rounded-3xl shadow-xl">
                            <Sliders className="w-10 h-10 animate-pulse" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-white">Chế độ nhà phát triển (Hex Mode)</h3>
                            <p className="text-xs text-white/50 mt-1.5 leading-relaxed">
                              Đây là phân vùng chỉnh sửa byte thô nâng cao. Nếu bạn không rành mã nhị phân, các tab trực quan bên cạnh đã cung cấp đầy đủ công cụ để sửa đổi tệp một cách thông minh và an toàn.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setIsAdvancedUnlocked(true);
                              if (navigator.vibrate) navigator.vibrate(15);
                            }}
                            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-purple-600/15"
                          >
                            Tôi đã hiểu, mở Hex Editor
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </React.Suspense>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Slide-up grid-view tab-manager drawer for mobile */}
      <AnimatePresence>
        {isTabGridViewOpen && (
          <>
            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40" onClick={() => setIsTabGridViewOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 20, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 max-h-[75vh] bg-[#0c1222] border-t border-white/15 rounded-t-[32px] p-6 z-50 flex flex-col overflow-hidden text-left pb-10 shadow-[0_-12px_40px_rgba(0,0,0,0.8)]"
            >
              <div className="w-12 h-1 bg-white/15 rounded-full mx-auto mb-4 shrink-0" onClick={() => setIsTabGridViewOpen(false)} />
              
              <div className="flex items-center justify-between mb-5 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center">
                    <Grid className="w-4.5 h-4.5 text-purple-400 mr-2" />
                    Quản lý Tab Tệp Tin ({openFiles.length})
                  </h3>
                  <p className="text-[10px] text-white/40 mt-0.5">Nhấp để chuyển tệp hoặc đóng tab vuốt ngang cực mượt.</p>
                </div>
                
                <label className="p-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-bold text-xs transition-colors cursor-pointer flex items-center space-x-1 shadow-lg shadow-purple-600/15">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Mở thêm</span>
                  <input type="file" onChange={handleAddFile} className="hidden" />
                </label>
              </div>

              {/* Grid content list of files */}
              <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3.5 pr-1">
                {openFiles.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setActiveFileId(item.id);
                      setIsTabGridViewOpen(false);
                      setShowAnalysisSummary(true); // Redo analysis screen for new file
                      if (navigator.vibrate) navigator.vibrate(10);
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between text-left relative overflow-hidden group ${
                      activeFileId === item.id 
                        ? 'bg-purple-600/10 border-purple-500 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                        : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3 min-w-0 pr-4">
                        <div className={`p-2 rounded-xl shrink-0 ${activeFileId === item.id ? 'bg-purple-600/25 text-purple-400' : 'bg-white/5 text-white/30'}`}>
                          <FileCode className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0 text-left">
                          <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                          <span className="text-[9px] text-white/40 font-mono mt-0.5 block">{(item.virtualFileSize / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleCloseFileTab(item.id, e)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-4 pt-2.5 border-t border-white/[0.03] flex items-center justify-between text-[10px] text-white/30 font-mono">
                      <span>Patches: <strong className="text-emerald-400 font-bold">{item.patches.size}</strong></span>
                      {activeFileId === item.id && (
                        <span className="text-purple-400 font-bold uppercase tracking-wider flex items-center text-[9px]">
                          Đang hoạt động <ArrowRight className="w-2.5 h-2.5 ml-1" />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Action Button fan menu for download, jump, reset */}
      <FloatingMenuFAB
        onDownload={handleDownloadPatchedFile}
        onUndo={() => toast('Hãy dùng nút Undo/Redo của tab Nâng cao', 'info')}
        onRedo={() => toast('Hãy dùng nút Undo/Redo của tab Nâng cao', 'info')}
        onJumpOffset={handleJumpOffsetTrigger}
        onBookmarks={() => {
          setActiveTab('overview');
          toast('Quay lại bảng Tổng quan', 'info');
        }}
        onExport={handleDownloadPatchedFile}
        canUndo={true}
        canRedo={true}
      />

      {/* Sticky Bottom Status bar */}
      <div className="fixed bottom-12 left-0 right-0 z-30 shrink-0">
        <BottomStatusLine
          activeOffset={jumpToOffset}
          editedBytesCount={activePatches.size}
          virtualFileSize={activeFileSize}
          openTime={activeOpenTime}
        />
      </div>

      {/* Premium iOS/Android-style bottom navigation bar dock */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#070b13]/90 backdrop-blur-2xl border-t border-white/5 py-1.5 px-4 flex items-center justify-around z-30 shrink-0 select-none pb-safe overflow-x-auto hide-scrollbar">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setShowAnalysisSummary(false); // Make sure when they change tabs, they exit the summary screen
                if (navigator.vibrate) navigator.vibrate(8);
              }}
              className="flex flex-col items-center justify-center py-1.5 px-2 relative transition-all active:scale-90 select-none cursor-pointer group min-w-[56px]"
            >
              <div className={`p-1.5 rounded-2xl transition-all ${
                isSelected 
                  ? 'bg-purple-600/10 text-purple-400 scale-105' 
                  : 'text-white/40 group-hover:text-white/80'
              }`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <span className={`text-[9px] font-bold mt-1 transition-all truncate ${
                isSelected 
                  ? 'text-purple-300 opacity-100 scale-105' 
                  : 'text-white/30 opacity-70 group-hover:opacity-100'
              }`}>
                {tab.label}
              </span>

              {/* Active navigation dot indicator */}
              {isSelected && (
                <motion.div 
                  layoutId="activeNavBubble"
                  className="absolute bottom-0 w-4 h-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                />
              )}
            </button>
          );
        })}
      </nav>
      <DevPerformanceBoard />
    </div>
  );
}
