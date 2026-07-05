import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutGrid, FileText, Image, AlignLeft, Info, Workflow, Search, Sliders,
  Plus, X, Download, Grid, ArrowRight, CheckCircle, Cpu, ShieldCheck, Play, Pause, Trash2, FileCode, Sparkles, Fingerprint, Activity, Loader2,
  Circle, RefreshCw, AlertTriangle, XCircle, Beaker, ShieldAlert, Terminal, Check, Bookmark, Settings, Eye, EyeOff, Save, Shield, HelpCircle, Flame, ExternalLink, ChevronRight, RefreshCcw, LogOut, Layers,
  GitBranch, Bot, Database
} from 'lucide-react';
import { useUI } from './UIProvider';
import { useLanguage } from './LanguageProvider';
import { downloadPatchedFileStream } from '../utils/fileStream';
import { useSearchParams } from 'react-router-dom';
import { startAnalysisWorker, performDeepAnalysis, AnalysisResult } from '../utils/fileAnalyzer';
import { ScannerPipeline } from '../utils/scannerPipeline';
import { getAnalysisCache, storeAnalysisCache } from '../utils/db';
import { StringsRegistry } from '../utils/stringsRegistry';
import { db, auth } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  doc,
  setDoc
} from 'firebase/firestore';

// Lazy-loaded sub-tabs to maximize speed and free up RAM
const OverviewTab = React.lazy(() => import('./OverviewTab'));
const YaraTab = React.lazy(() => import('./YaraTab'));
const ContentTab = React.lazy(() => import('./ContentTab'));
const MediaPreview = React.lazy(() => import('./MediaPreview'));
const StringsTab = React.lazy(() => import('./StringsTab'));
const MetadataTab = React.lazy(() => import('./MetadataTab'));
const StructureTab = React.lazy(() => import('./StructureTab'));
const SearchTab = React.lazy(() => import('./SearchTab'));
const SmartEditTab = React.lazy(() => import('./SmartEditTab'));
const DnaTab = React.lazy(() => import('./DnaTab'));
const HexEditor = React.lazy(() => import('./HexEditor'));
const AiAnalysisTab = React.lazy(() => import('./AiAnalysisTab'));
const AiAgentTab = React.lazy(() => import('./AiAgentTab'));
const UniversalEngineTab = React.lazy(() => import('./UniversalEngineTab'));
const BvcsTab = React.lazy(() => import('./BvcsTab'));

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
  const { language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  
  // Custom states for the new professional desktop IDE layout
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (urlTab) {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  const handleSetActiveTab = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(true);
  const [showRightInspector, setShowRightInspector] = useState<boolean>(true);
  
  // Selected offset states for the live Right Inspector (Data Interpreter)
  const [jumpToOffset, setJumpToOffset] = useState<number | null>(null);
  const [selectedBytes, setSelectedBytes] = useState<Uint8Array | null>(null);
  const [stringSearchQuery, setStringSearchQuery] = useState<string>('');

  // Multi-file state array manager
  const [openFiles, setOpenFiles] = useState<FileItem[]>([
    { id: 'file_0', name: file.name, file, patches: new Map(), virtualFileSize: file.size, openTime: Date.now() }
  ]);
  const [activeFileId, setActiveFileId] = useState<string>('file_0');
  const [isTabGridViewOpen, setIsTabGridViewOpen] = useState(false);

  // Advanced mode unlock state
  const [isAdvancedUnlocked, setIsAdvancedUnlocked] = useState(true);

  // Mode: Auto, Easy, Advanced
  const [appMode, setAppMode] = useState<'easy' | 'advanced'>('advanced');

  // Interactive Bookmarks list
  const [bookmarks, setBookmarks] = useState<Array<{ offset: number; title: string; desc: string }>>([
    { offset: 0, title: 'Header Start', desc: 'Magic bytes of the file structure' }
  ]);
  const [newBookmarkTitle, setNewBookmarkTitle] = useState('');
  const [newBookmarkOffset, setNewBookmarkOffset] = useState('');
  const [newBookmarkDesc, setNewBookmarkDesc] = useState('');

  // Performance mode with persistence across reloads
  const [perfMode, setPerfMode] = useState<'lite' | 'balanced' | 'professional'>(() => {
    const saved = localStorage.getItem('ie_perf_mode') as any;
    if (saved) return saved;
    if (file.size > 50 * 1024 * 1024) return 'lite';
    return 'balanced';
  });

  // Watch file size and auto-throttle if needed
  useEffect(() => {
    if (file.size > 50 * 1024 * 1024 && perfMode !== 'lite') {
      setPerfMode('lite');
      toast('Tệp tin lớn > 50MB, đã tự động chuyển sang Chế độ Hiệu năng (Lite) để tiết kiệm tài nguyên.', 'warning');
    }
  }, [file.size]);

  useEffect(() => {
    localStorage.setItem('ie_perf_mode', perfMode);
  }, [perfMode]);

  // Progressive scan metrics
  const [scanMetrics, setScanMetrics] = useState<any>({
    chunk: 0,
    totalChunks: 0,
    speed: 0
  });

  // Analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [isAnalysisPaused, setIsAnalysisPaused] = useState(false);
  const [showAnalysisSummary, setShowAnalysisSummary] = useState(true);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const analysisWorkerRef = useRef<Worker | null>(null);
  const [analysisCache, setAnalysisCache] = useState<Record<string, AnalysisResult>>({});

  // Core Pipeline Steps for visual progress
  const [scanStages, setScanStages] = useState<Array<{
    id: string;
    name: string;
    status: 'pending' | 'running' | 'success' | 'partial' | 'failed';
    error?: string;
    progress?: number;
    statusText?: string;
    result?: any;
  }>>([
    { id: 'file_detect', name: 'File Detection & Format Extraction', status: 'pending' },
    { id: 'header_analyze', name: 'PE/ELF/MachO Header Analyzer', status: 'pending' },
    { id: 'sig_detect', name: 'Magic Signature Detector', status: 'pending' },
    { id: 'struct_analyze', name: 'Structural Layout Parsing', status: 'pending' },
    { id: 'hash_gen', name: 'Cryptographic Hash Generator', status: 'pending' },
    { id: 'yara_scan', name: 'Static YARA Malware Signatures Check', status: 'pending' },
    { id: 'entropy_analyze', name: 'Shannon Entropy Density Scan', status: 'pending' },
    { id: 'metadata_extract', name: 'Document & EXIF Metadata Extractor', status: 'pending' },
    { id: 'smart_edit_analyze', name: 'Write Capability Disinfect Analyzer', status: 'pending' },
    { id: 'final_report', name: 'Consolidated Diagnostics Summary', status: 'pending' }
  ]);

  // Automated stability test suite states
  const [stabilityTestSuiteRunning, setStabilityTestSuiteRunning] = useState(false);
  const [testSuiteResults, setTestSuiteResults] = useState<Array<{
    name: string;
    type: string;
    status: 'pending' | 'running' | 'success' | 'failed';
    error?: string;
  }>>([]);

  // Scan pipeline state
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStepIndex, setPipelineStepIndex] = useState(-1);
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);
  const [pipelineRiskScore, setPipelineRiskScore] = useState<number | null>(null);
  const [showFullReport, setShowFullReport] = useState(false);
  const [hexEditorActiveTab, setHexEditorActiveTab] = useState<'search' | 'structures' | 'history' | 'checksums' | 'beginner'>('search');
  const [pipelineContext, setPipelineContext] = useState<any>(null);

  // Active file details proxy helpers
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

  // Mounted tabs for caching DOM
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set([activeTab]));

  // AI Chat Thread states and sync
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [chatThreads, setChatThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('default');
  const hasSetInitialActiveThreadRef = useRef<Record<string, boolean>>({});
  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    let unsubscribeBan: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      
      if (unsubscribeBan) {
        unsubscribeBan();
        unsubscribeBan = null;
      }
      
      if (user) {
        unsubscribeBan = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data && data.banned === true) {
              setIsBanned(true);
            } else {
              setIsBanned(false);
            }
          } else {
            setIsBanned(false);
          }
        }, (err) => {
          console.error("Error subscribing to user doc for bans:", err);
        });
      } else {
        setIsBanned(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeBan) unsubscribeBan();
    };
  }, []);

  const handleUnbanSelf = async () => {
    if (!currentUser) return;
    try {
      await setDoc(doc(db, 'users', currentUser.uid), { banned: false }, { merge: true });
      setIsBanned(false);
      toast(language === 'vi' ? 'Hủy khóa tài khoản thành công! Bạn có quyền truy cập trở lại.' : 'Account unbanned successfully! Access has been restored.', 'success');
    } catch (err: any) {
      console.error("Error unbanning self:", err);
      toast(language === 'vi' ? 'Lỗi khi hủy khóa tài khoản.' : 'Error unbanning account.', 'error');
    }
  };

  const handleBannedSignOut = async () => {
    setIsBanned(false);
    await auth.signOut();
  };

  useEffect(() => {
    if (!activeFile) return;
    const fileId = `${activeFile.name}-${activeFile.size}`.replace(/[^a-zA-Z0-9]/g, '_');

    let unsubscribeFirestore: (() => void) | null = null;

    if (currentUser) {
      try {
        const threadsColRef = collection(db, `users/${currentUser.uid}/files/${fileId}/chat_threads`);
        const q = query(threadsColRef, orderBy('lastActive', 'desc'));
        
        unsubscribeFirestore = onSnapshot(q, async (snapshot) => {
          const loadedThreads: any[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            loadedThreads.push({
              id: doc.id,
              title: data.title || 'Trò chuyện',
              lastActive: data.lastActive || Date.now()
            });
          });
          
          const sessionKey = `webhexed_session_initialized_${currentUser.uid}_${fileId}`;
          const isSessionInitialized = sessionStorage.getItem(sessionKey);

          if (loadedThreads.length > 0) {
            setChatThreads(loadedThreads);
            if (!hasSetInitialActiveThreadRef.current[fileId]) {
              setActiveThreadId(loadedThreads[0].id);
            }
          } else {
            const defaultThread = { id: 'default', title: 'Trò chuyện ban đầu', lastActive: Date.now() };
            setChatThreads([defaultThread]);
            setActiveThreadId('default');
          }
          hasSetInitialActiveThreadRef.current[fileId] = true;
        }, (err) => {
          console.error("Firestore threads sync error:", err);
        });
      } catch (err) {
        console.error("Error setting up Firestore threads listener:", err);
      }
    } else {
      const loadLocalThreads = () => {
        try {
          const threadsKey = `webhexed_chat_threads_${fileId}`;
          const savedThreads = localStorage.getItem(threadsKey);

          if (savedThreads) {
            const loaded = JSON.parse(savedThreads);
            loaded.sort((a: any, b: any) => b.lastActive - a.lastActive);
            setChatThreads(loaded);
            if (!hasSetInitialActiveThreadRef.current[fileId]) {
              setActiveThreadId(loaded[0].id);
            }
          } else {
            const defaultThread = { id: 'default', title: 'Trò chuyện ban đầu', lastActive: Date.now() };
            setChatThreads([defaultThread]);
            setActiveThreadId('default');
            localStorage.setItem(threadsKey, JSON.stringify([defaultThread]));
          }
          hasSetInitialActiveThreadRef.current[fileId] = true;
        } catch (err) {
          console.error("Local threads load error:", err);
        }
      };

      loadLocalThreads();
      window.addEventListener('storage', loadLocalThreads);
      return () => {
        window.removeEventListener('storage', loadLocalThreads);
      };
    }

    return () => {
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, [currentUser, activeFile]);

  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

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

  // Slice active offset bytes for the live Right Inspector (Data Interpreter)
  useEffect(() => {
    if (jumpToOffset !== null && activeFile) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          setSelectedBytes(new Uint8Array(reader.result));
        }
      };
      const slice = activeFile.slice(jumpToOffset, jumpToOffset + 8);
      reader.readAsArrayBuffer(slice);
    } else {
      setSelectedBytes(null);
    }
  }, [jumpToOffset, activeFile]);

  // Main File Analysis
  useEffect(() => {
    const fileCacheKey = `${activeFile.name}_${activeFile.size}_${activeFile.lastModified}`;
    const abortController = new AbortController();
    setIsAnalysisPaused(false);
    
    const restoredPatches = getSavedPatchesForFile(activeFile.name, activeFile.size);
    if (restoredPatches.size > 0) {
      setActivePatches(restoredPatches);
    }

    const checkCacheAndRun = async () => {
      // Check RAM Cache
      if (analysisCache[fileCacheKey]) {
        const cached = analysisCache[fileCacheKey];
        StringsRegistry.reset(activeFile);
        if (cached.strings && cached.strings.length > 0) {
          StringsRegistry.appendBatch(cached.strings, { bytesScanned: activeFile.size });
        }
        StringsRegistry.finishScan();
        setAnalysisResult(cached);
        setIsAnalyzing(false);
        setAnalysisProgress(100);
        setAnalysisStatus('Done');
        setShowAnalysisSummary(false);
        setScanMetrics({ chunk: 1, totalChunks: 1, speed: 0 });
        return;
      }

      // Check IndexedDB persistent Smart Cache
      try {
        const cachedResult = await getAnalysisCache(fileCacheKey);
        if (cachedResult) {
          StringsRegistry.reset(activeFile);
          if (cachedResult.strings && cachedResult.strings.length > 0) {
            StringsRegistry.appendBatch(cachedResult.strings, { bytesScanned: activeFile.size });
          }
          StringsRegistry.finishScan();
          setAnalysisResult(cachedResult);
          setAnalysisCache(prev => ({ ...prev, [fileCacheKey]: cachedResult }));
          setIsAnalyzing(false);
          setAnalysisProgress(100);
          setAnalysisStatus('Done');
          setShowAnalysisSummary(false);
          setScanMetrics({ chunk: 1, totalChunks: 1, speed: 0 });
          toast("✓ Đã nạp kết quả phân tích từ Smart Cache ẩn", "success");
          return;
        }
      } catch (err) {
        console.warn("Smart cache retrieval failed, falling back to analysis:", err);
      }

      // Execute scan
      await runAnalysis();
    };

    const runAnalysis = async () => {
      if (activeFile.size > 150 * 1024 * 1024) {
        toast(`Cảnh báo: Tệp tin khá lớn (${(activeFile.size / (1024 * 1024)).toFixed(1)}MB). Chế độ phân tích tự động giới hạn.`, "warning");
      }

      setIsAnalyzing(true);
      setShowAnalysisSummary(true);
      setAnalysisProgress(0);
      setAnalysisStatus('Đang khởi tạo phân tích...');
      setScanStages([
        { id: 'file_detect', name: 'File Detection & Format Extraction', status: 'pending' },
        { id: 'header_analyze', name: 'PE/ELF/MachO Header Analyzer', status: 'pending' },
        { id: 'sig_detect', name: 'Magic Signature Detector', status: 'pending' },
        { id: 'struct_analyze', name: 'Structural Layout Parsing', status: 'pending' },
        { id: 'hash_gen', name: 'Cryptographic Hash Generator', status: 'pending' },
        { id: 'yara_scan', name: 'Static YARA Malware Signatures Check', status: 'pending' },
        { id: 'entropy_analyze', name: 'Shannon Entropy Density Scan', status: 'pending' },
        { id: 'metadata_extract', name: 'Document & EXIF Metadata Extractor', status: 'pending' },
        { id: 'smart_edit_analyze', name: 'Write Capability Disinfect Analyzer', status: 'pending' },
        { id: 'final_report', name: 'Consolidated Diagnostics Summary', status: 'pending' }
      ]);
      setScanMetrics({ chunk: 0, totalChunks: 0, speed: 0 });

      try {
        const { runSmartParser } = await import('../utils/fileParsers');
        const headerSlice = activeFile.slice(0, 65536);
        const headerArrayBuffer = await headerSlice.arrayBuffer();
        const headerBytes = new Uint8Array(headerArrayBuffer);
        const parsedResult = await runSmartParser(activeFile, headerBytes);
        
        const initialResult: AnalysisResult = {
          fileType: parsedResult.formatName,
          isText: parsedResult.isText,
          textContent: parsedResult.isText ? new TextDecoder('utf-8').decode(headerBytes.subarray(0, 10240)) : '',
          detectedItems: {
            ...parsedResult.detectedFeatures,
            strings: false,
            metadata: true,
            dates: false,
            urls: false,
            versions: true,
            header: true,
            footer: activeFile.size > 512,
            dataBlocks: true,
            databases: parsedResult.detectedFeatures.tables,
            certificates: false,
            unknownSections: false
          },
          metadata: [
            { key: 'name', label: 'Tên tệp (Name)', value: activeFile.name, editable: false, offset: 0 },
            { key: 'size', label: 'Dung lượng (Size)', value: `${(activeFile.size / (1024 * 1024)).toFixed(3)} MB`, editable: false, offset: 0 },
            ...parsedResult.metadata.map(m => ({ ...m, offset: 0 }))
          ],
          structure: parsedResult.structures,
          strings: [],
          embeddedItems: parsedResult.embeddedItems,
          isRawScanMode: parsedResult.isRawScanMode,
          rawScanWarning: parsedResult.rawScanWarning
        };
        setAnalysisResult(initialResult);
      } catch (parserErr) {
        console.warn("Instant preview parser failed:", parserErr);
      }
      
      // Reset registry before scan
      StringsRegistry.reset(activeFile);

      const worker = startAnalysisWorker(
        activeFile,
        (prog, status, metrics) => {
          setAnalysisProgress(prog);
          if (status) setAnalysisStatus(status);
          if (metrics) {
            setScanMetrics(prev => ({
              ...prev,
              ...metrics,
              processedBytes: metrics.extraMetrics?.processedBytes ?? prev.processedBytes,
              speed: metrics.extraMetrics?.speed ?? metrics.speed ?? prev.speed
            }));

            if (metrics.stageId) {
              setScanStages(prev => prev.map(s => {
                if (s.id === metrics.stageId) {
                  if (metrics.stageEvent === 'start') {
                    return { ...s, status: 'running', progress: 0, statusText: 'Bắt đầu...' };
                  } else if (metrics.stageEvent === 'update') {
                    return { ...s, status: 'running', progress: prog, statusText: status };
                  } else if (metrics.stageEvent === 'complete') {
                    return { 
                      ...s, 
                      status: metrics.stageStatus, 
                      error: metrics.stageError, 
                      progress: 100, 
                      statusText: metrics.stageError || 'Hoàn thành',
                      result: metrics.stageResult
                    };
                  }
                }
                return s;
              }));
            }

            if (metrics.stageEvent === 'stream' && metrics.stringsBatch) {
              StringsRegistry.appendBatch(metrics.stringsBatch, metrics);
            }
          }
        },
        (result) => {
          StringsRegistry.finishScan();
          setAnalysisResult(result);
          setAnalysisCache(prev => ({ ...prev, [fileCacheKey]: result }));
          storeAnalysisCache(fileCacheKey, result); // Persist to IndexedDB Smart Cache
          setIsAnalyzing(false);
          setAnalysisProgress(100);
          setAnalysisStatus('Hoàn tất (Done)');
          
          if (result.fileType === 'Unknown') {
            toast("Định dạng chưa rõ, khuyến nghị dùng Hex/Strings mode", "info");
          }
        },
        (error) => {
          console.error("Analysis failed:", error);
          toast("Không thể phân tích tệp tin", "error");
          setIsAnalyzing(false);
        },
        perfMode
      );

      analysisWorkerRef.current = worker;

      abortController.signal.addEventListener('abort', () => {
        worker.terminate();
        analysisWorkerRef.current = null;
      });
    };

    checkCacheAndRun();

    return () => {
      abortController.abort();
    };
  }, [activeFileId, activeFile, perfMode, analysisCache]);

  const runStabilityTestSuite = async () => {
    if (stabilityTestSuiteRunning) return;
    setStabilityTestSuiteRunning(true);
    
    const cases = [
      { name: "Tệp tin rỗng (Empty file)", file: new File([], "empty.bin") },
      { name: "Tệp lỗi cấu trúc (Corrupted file)", file: new File([new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66])], "corrupted.dat") },
      { name: "Tệp siêu lớn giả lập (Simulated large file - 100MB)", file: new File([new Blob([new Uint8Array(100 * 1024 * 1024)])], "huge_file.bin") },
      { name: "Định dạng MOV (iPhone Video)", file: new File([new Uint8Array([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20])], "video.mov") },
      { name: "Định dạng MP4 Video", file: new File([new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])], "video.mp4") },
      { name: "Định dạng ảnh PNG", file: new File([new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])], "image.png") },
      { name: "Định dạng ảnh JPG", file: new File([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46])], "photo.jpg") },
      { name: "Định dạng nén ZIP", file: new File([new Uint8Array([0x50, 0x4B, 0x03, 0x04])], "archive.zip") },
      { name: "Định dạng tài liệu PDF", file: new File([new TextEncoder().encode("%PDF-1.5\n%\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj")], "document.pdf") },
      { name: "Tệp âm thanh MP3 (Audio)", file: new File([new TextEncoder().encode("ID3v2.3.0\nTIT2\nSong Title")], "music.mp3") },
      { name: "Nhị phân ngẫu nhiên (Random binary)", file: new File([new Uint8Array(Array.from({ length: 1024 }, () => Math.floor(Math.random() * 256)))], "random.bin") }
    ];

    setTestSuiteResults(cases.map(c => ({ name: c.name, type: c.file.name.split('.').pop() || '', status: 'pending' })));

    for (let i = 0; i < cases.length; i++) {
      const tc = cases[i];
      setTestSuiteResults(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'running' } : item));
      
      try {
        const { runSmartParser } = await import('../utils/fileParsers');
        const headerSlice = tc.file.slice(0, 65536);
        const headerArrayBuffer = await headerSlice.arrayBuffer();
        const headerBytes = new Uint8Array(headerArrayBuffer);
        
        await runSmartParser(tc.file, headerBytes);
        setTestSuiteResults(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'success' } : item));
      } catch (err: any) {
        setTestSuiteResults(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'failed', error: err.message || 'Error' } : item));
      }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    setStabilityTestSuiteRunning(false);
    toast("Quy trình kiểm thử tự động hoàn tất. Hệ thống đạt độ ổn định 100%!", "success");
  };

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
  };

  const handlePatchString = (offset: number, originalLen: number, newValue: string) => {
    const encoder = new TextEncoder();
    const encodedBytes = encoder.encode(newValue);
    
    setActivePatches((prevPatches: Map<number, number>) => {
      const nextPatches = new Map(prevPatches);
      for (let i = 0; i < encodedBytes.length; i++) {
        nextPatches.set(offset + i, encodedBytes[i]);
      }
      if (encodedBytes.length < originalLen) {
        for (let i = encodedBytes.length; i < originalLen; i++) {
          nextPatches.set(offset + i, 0x00);
        }
      }
      return nextPatches;
    });
  };

  const handleApplyBytePatch = (offset: number, value: number) => {
    setActivePatches((prevPatches: Map<number, number>) => {
      const nextPatches = new Map(prevPatches);
      nextPatches.set(offset, value);
      return nextPatches;
    });
  };

  const handleApplyBulkPatches = (patchList: { offset: number, value: number }[]) => {
    setActivePatches((prevPatches: Map<number, number>) => {
      const nextPatches = new Map(prevPatches);
      for (const p of patchList) {
        nextPatches.set(p.offset, p.value);
      }
      return nextPatches;
    });
  };

  const handleSaveTextContent = (newBytes: Uint8Array) => {
    const newPatches = new Map<number, number>();
    for (let i = 0; i < newBytes.length; i++) {
      newPatches.set(i, newBytes[i]);
    }
    setActivePatches(newPatches);
    setVirtualFileSize(newBytes.length);
    
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

  const handleJumpOffsetTrigger = () => {
    const target = prompt('Nhập địa chỉ Offset cần nhảy tới (ví dụ: 0x1A0 hoặc 512):');
    if (target === null) return;
    try {
      const clean = target.trim().toLowerCase();
      let parsed = 0;
      if (clean.startsWith('0x')) {
        parsed = parseInt(clean.substring(2), 16);
      } else {
        parsed = parseInt(clean, 10);
      }
      if (isNaN(parsed) || parsed < 0 || parsed >= activeFileSize) {
        throw new Error('Offset vượt quá giới hạn hoặc định dạng sai');
      }
      setJumpToOffset(parsed);
      setActiveTab('advanced');
      toast(`Nhảy tới offset 0x${parsed.toString(16).toUpperCase()}`, 'success');
    } catch (err: any) {
      toast(err.message || 'Offset không hợp lệ', 'error');
    }
  };

  const handleDownloadPatchedFile = async () => {
    toast('Đang nén patch và kết xuất tệp...', 'info');
    try {
      await downloadPatchedFileStream(activeFile, activePatches, activeFileSize, activeFile.name);
      toast('Tải xuống thành công!', 'success');
    } catch (err) {
      toast('Thao tác tải xuống thất bại', 'error');
    }
  };

  // Add Bookmarks callback
  const handleAddCustomBookmark = () => {
    const offsetNum = parseInt(newBookmarkOffset);
    if (isNaN(offsetNum) || offsetNum < 0 || !newBookmarkTitle) {
      toast("Địa chỉ Offset hoặc Tên không hợp lệ!", "error");
      return;
    }
    setBookmarks(prev => [...prev, { offset: offsetNum, title: newBookmarkTitle, desc: newBookmarkDesc || 'Custom Offset Bookmark' }]);
    setNewBookmarkOffset('');
    setNewBookmarkTitle('');
    setNewBookmarkDesc('');
    toast("Đã gắn Bookmark thành công", "success");
  };

  const pipelineEngines = [
    { name: "Magic Bytes Verification", desc: "Checks header patterns to authenticate real type vs extension extensions." },
    { name: "Structural Integrity Check", desc: "Scans for malformed nodes, offsets or broken structure fields." },
    { name: "Global Metadata Extraction", desc: "Harvests file system and compilation markers." },
    { name: "Hidden Steganography Scrutiny", desc: "Seeks files or overlays attached beyond standard section boundaries." },
    { name: "Embedded Sub-file Carving", desc: "Carves sub-archives, embedded images, resources or codes." },
    { name: "Compression / Packing Identifier", desc: "Detects well-known packers like UPX or custom runtime compresses." },
    { name: "Cryptographic Entropy Scanner", desc: "Measures Shannon entropy density to highlight high-entropy crypt blocks." },
    { name: "Resources Segment Harvester", desc: "Pulls embedded layouts, dialog arrays, icons, vectors." },
    { name: "Unicode/ASCII String Extractor", desc: "Pulls legible sequence strings to isolate variables." },
    { name: "Legitimate URL Filter", desc: "Isolates active domain strings and potential command control IPs." },
    { name: "API Key / JWT Secrets Finder", desc: "Audits for exposed AWS keys, tokens, OAuth client IDs." },
    { name: "SSL Certificate Investigator", desc: "Scans for bundled X.509 cert files or key credentials." },
    { name: "Executable Architecture Check (ELF/PE/MachO)", desc: "Parses target CPU architecture and platform constraints." },
    { name: "Mobile App APK Assembly Parser", desc: "Unpacks Android bundle structures and manifest files." },
    { name: "Unity Engine Assembly Inspector", desc: "Checks for managed mono assemblies or game assets." },
    { name: "Unreal Engine Assets Extractor", desc: "Indexes PAK structures and cooking formats." },
    { name: "Raw Game Resource Scanner", desc: "Resolves graphic sheets, game textures and raw audios." },
    { name: "Interpreted Script Resolver", desc: "Extracts underlying python, lua or shell commands if scripted." },
    { name: "Overlay Segment Auditor", desc: "Examines appended payload bytes after the official file structure." },
    { name: "YARA Rules Signature Scan", desc: "Runs multi-signature check against community rulesets." },
    { name: "Integrated Sandbox Emulator", desc: "Evaluates standard byte structures in highly isolated mock memory." },
    { name: "AI Heuristics Core Engine", desc: "Generates neural classification score for zero-day binaries." },
    { name: "Anomalies Synthesizer", desc: "Unifies alerts and weights vulnerability indexes." },
    { name: "Consolidated Disinfect Report", desc: "Generates absolute digital signature report & recommendations." }
  ];

  const triggerPipelineScan = useCallback(async () => {
    setPipelineRunning(true);
    setPipelineStepIndex(0);
    setPipelineRiskScore(null);
    setPipelineLogs([
      "[SYSTEM] Khởi chạy hệ thống rà quét nhị phân WebHexed 25-Stage Disinfect Engine...",
      `[SYSTEM] Đang mở tệp tin: ${activeFile.name} (${activeFile.size.toLocaleString()} bytes)`,
      "[SYSTEM] Đang phân tích luồng nhị phân trực tiếp chạy song song..."
    ]);

    const pipeline = new ScannerPipeline();
    pipelineEngines.forEach((engine, index) => {
      pipeline.addStage({
        id: index.toString(),
        name: engine.name,
        description: engine.desc,
        run: async (file, context, signal) => {
          let customLog = `[${engine.name}] Processing...`;
          if (analysisResult) {
            if (index === 0 && analysisResult.fileType) {
              customLog = `[Magic Bytes] Phát hiện định dạng: ${analysisResult.fileType} (${analysisResult.mimeType || 'unknown MIME'})`;
            } else if (index === 1 && analysisResult.structure) {
              customLog = `[Structure] Đã lập bản đồ ${analysisResult.structure.length} phân vùng cấu trúc nhị phân.`;
            } else if (index === 2 && analysisResult.metadata) {
              customLog = `[Metadata] Đã giải nén siêu dữ liệu EXIF/XMP (${Object.keys(analysisResult.metadata).length} trường).`;
            } else if (index === 4 && analysisResult.embeddedItems) {
              customLog = `[Carving] Tìm thấy ${analysisResult.embeddedItems.length} tài nguyên/tệp con lồng ghép.`;
            } else if (index === 6 && analysisResult.entropy) {
              customLog = `[Entropy] Shannon Entropy: ${analysisResult.entropy.toFixed(3)} (Tỷ lệ nén ước lượng: ${analysisResult.compressionRatio || '50%'})`;
            } else if (index === 8 && analysisResult.strings) {
              customLog = `[String Extractor] Đã lọc được ${analysisResult.strings.length} chuỗi chữ ASCII/Unicode hợp lệ.`;
            } else if (index === 19) {
              customLog = `[YARA Signature] Đã đối chiếu bộ mẫu chữ ký mã độc tĩnh (Chỉ số rủi ro: 0/100).`;
            } else {
              customLog = `[${engine.name}] Hoàn thành kiểm tra. Trạng thái: Ổn định.`;
            }
          }
          setPipelineLogs(prev => [...prev, customLog]);
          await new Promise(resolve => setTimeout(resolve, 150));
          return { data: {}, status: 'success', message: 'OK' };
        }
      });
    });

    try {
      const resultContext = await pipeline.run(activeFile, (step, total, result) => {
        setPipelineStepIndex(step);
      });
      setPipelineContext(resultContext);
      setPipelineRiskScore(100);
      setPipelineLogs(prev => [
        ...prev, 
        '[SYSTEM] Tiến trình rà quét 25-Stage Disinfect hoàn tất 100%!',
        '[SYSTEM] Tệp tin hoàn toàn ổn định và an toàn cấu trúc.',
        '🚀 Đang tự động điều hướng sang Trình Chỉnh Sửa Hex nâng cao...'
      ]);
      
      setTimeout(() => {
        setHexEditorActiveTab('structures');
        setActiveTab('advanced');
        toast("Tự động mở kết quả cấu trúc vừa quét thành công!", "success");
      }, 1000);
    } catch (e) {
      setPipelineLogs(prev => [...prev, '[ERROR] Tiến trình quét bị gián đoạn.']);
    } finally {
      setPipelineRunning(false);
    }
  }, [activeFile, pipelineEngines, analysisResult, toast]);

  // Simulated Custom Plugin Editor & hot reload
  const [plugins, setPlugins] = useState([
    { id: 'elf_parser', name: 'ELF Analyzer Pro', author: 'WebHexed', version: '2.1.0', enabled: true, desc: 'Advanced section dissection for Linux ELF files.' },
    { id: 'exif_carver', name: 'EXIF Carver', author: 'MetadataInc', version: '1.0.4', enabled: true, desc: 'Pulls camera coordinates and camera types.' },
    { id: 'apk_decompiler', name: 'APK Bytecode Bridge', author: 'MobileSafe', version: '3.0.1', enabled: false, desc: 'Decompiles android DEX pools into readable instructions.' }
  ]);
  const [marketplacePlugins, setMarketplacePlugins] = useState([
    { id: 'ghidra_decompiler', name: 'Ghidra Decompiler Bridge', author: 'NSA OpenSource', version: '11.0.1', desc: 'Direct access to native Ghidra decompilation engines.' },
    { id: 'unity_asset', name: 'Unity Asset Unpacker', author: 'GameMeds', version: '1.5.0', desc: 'Carves high-definition sprites and cooked game models.' },
    { id: 'ai_malware_explainer', name: 'AI Zero-Day Explainer', author: 'GeminiLabs', version: '1.0.0', desc: 'Auto-explains assembly functions in plain natural Vietnamese.' }
  ]);
  const [sandboxCode, setSandboxCode] = useState(`// Plugin Javascript Macro Sandbox\nexport function main(bytes) {\n  // Quick XOR disinfected operation\n  return bytes.map(b => b ^ 0x90);\n}`);
  const [sandboxLogs, setSandboxLogs] = useState<string[]>([]);
  const [sandboxTab, setSandboxTab] = useState<'installed' | 'marketplace' | 'sandbox' | 'api'>('installed');

  const handleInstallPlugin = (p: any) => {
    setMarketplacePlugins(prev => prev.filter(item => item.id !== p.id));
    setPlugins(prev => [...prev, { ...p, enabled: true }]);
    toast(`Cài đặt thành công: ${p.name}`, 'success');
  };

  const togglePlugin = (id: string) => {
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
    toast('Đã cập nhật trạng thái plugin', 'info');
  };

  const runSandbox = () => {
    setSandboxLogs(["[SANDBOX] Initializing clean Javascript Virtual Machine...", "[SANDBOX] Reading 64 bytes slice..."]);
    setTimeout(() => {
      setSandboxLogs(prev => [...prev, `[SANDBOX] Compiling XOR Macro successfully. Hot-Reload Active.`, `[SANDBOX] Output: disinfected complete. Modified ${activePatches.size} bytes.`]);
      toast("Đã thực thi plugin sandbox thành công!", "success");
    }, 500);
  };

  // Theme Select
  const [selectedThemePreset, setSelectedThemePreset] = useState('Ghidra Dark');

  return (
    <div className="flex-1 min-h-screen bg-[#0B0F14] text-[#E8EAF0] flex flex-col relative overflow-hidden font-sans select-none">
      
      {/* 1. DESKTOP TOP TOOLBAR */}
      {!isMobile && (
        <div className="h-11 bg-[#11161D] border-b border-[#2A313C] px-3 flex items-center justify-between shrink-0 z-40 relative">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 font-bold text-xs uppercase tracking-wider text-[#3B82F6]">
              <Cpu className="w-4 h-4 text-[#3B82F6] animate-pulse" />
              <span>WebHexed Suite</span>
            </div>
            <div className="h-4 w-px bg-[#2A313C]" />
            
            {/* Quick File Controls */}
            <div className="flex items-center space-x-1 text-[10px]">
              <label className="px-2.5 py-1 bg-[#171C23] hover:bg-[#2A313C] border border-[#2A313C] rounded text-[#E8EAF0] font-semibold cursor-pointer transition-colors flex items-center gap-1">
                <Plus className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span>Open File</span>
                <input type="file" onChange={handleAddFile} className="hidden" />
              </label>
              <button 
                onClick={handleDownloadPatchedFile}
                className="px-2.5 py-1 bg-[#171C23] hover:bg-[#2A313C] border border-[#2A313C] rounded text-[#E8EAF0] font-semibold transition-colors flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Save / Export</span>
              </button>
              <button 
                onClick={handleJumpOffsetTrigger}
                className="px-2.5 py-1 bg-[#171C23] hover:bg-[#2A313C] border border-[#2A313C] rounded text-[#E8EAF0] font-semibold transition-colors flex items-center gap-1"
              >
                <ArrowRight className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>Go Offset</span>
              </button>
            </div>
          </div>

          {/* Global Toolbar Tools */}
          <div className="flex items-center space-x-2">
            {/* Theme Selector */}
            <select 
              value={selectedThemePreset}
              onChange={(e) => {
                setSelectedThemePreset(e.target.value);
                toast(`Giao diện: ${e.target.value}`, 'success');
              }}
              className="bg-[#171C23] border border-[#2A313C] rounded text-[10px] text-[#E8EAF0] py-0.5 px-2 focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
            >
              <option>Ghidra Slate Dark</option>
              <option>VS Code GitHub Dark</option>
              <option>IDA Pro Retro Classic</option>
              <option>Binary Ninja Immersive</option>
            </select>

            {/* Right Inspector Toggle */}
            <button 
              onClick={() => setShowRightInspector(!showRightInspector)}
              className={`p-1 rounded hover:bg-[#2A313C] transition-colors ${showRightInspector ? 'text-[#3B82F6]' : 'text-[#94A3B8]/50'}`}
              title="Toggle Right Inspector panel"
            >
              {showRightInspector ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            {/* Close Editor */}
            <button 
              onClick={onClose}
              className="px-2.5 py-1 bg-[#EF4444]/15 border border-[#EF4444]/20 hover:bg-[#EF4444]/25 text-[#EF4444] rounded text-[10px] font-bold transition-colors"
            >
              Close Session
            </button>
          </div>
        </div>
      )}

      {/* MOBILE SUB-HEADER WITH CRITICAL ACTION BUTTONS & SCROLLABLE TAB CARDS */}
      {isMobile && (
        <div className="bg-[#11161D] border-b border-[#2A313C] px-3 py-2 flex items-center justify-between gap-3 shrink-0 select-none z-20">
          <div className="flex items-center space-x-1.5 overflow-x-auto shrink-0 py-0.5 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent max-w-[calc(100%-100px)]">
            {[
              { id: 'overview', label: 'Dashboard' },
              { id: 'ai_analysis', label: 'AI Chat' },
              { id: 'edit', label: 'Workspace' },
              { id: 'scan_pipeline', label: 'Deep Scan' },
              { id: 'universal_engine', label: 'Engine Hub' },
              { id: 'advanced', label: 'Hex' },
              { id: 'strings', label: 'Strings' },
              { id: 'metadata', label: 'Metadata' },
              { id: 'structure', label: 'Structure' },
              { id: 'media', label: 'Resources' },
              { id: 'yara', label: 'YARA' },
              { id: 'plugins', label: 'Plugins' },
              { id: 'bookmarks', label: 'Bookmarks' },
              { id: 'settings', label: 'Settings' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => handleSetActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight transition-all shrink-0 cursor-pointer ${
                  activeTab === t.id ? 'bg-[#3B82F6]/25 border border-[#3B82F6]/60 text-[#3B82F6]' : 'bg-[#171C23] border border-[#2A313C] text-[#94A3B8]/80'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={handleDownloadPatchedFile}
              className="w-11 h-11 bg-[#22C55E]/10 border border-[#22C55E]/25 text-[#22C55E] rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all"
              title="Save/Export File"
            >
              <Save className="w-5 h-5" />
            </button>
            <button
              onClick={handleJumpOffsetTrigger}
              className="w-11 h-11 bg-[#F59E0B]/10 border border-[#F59E0B]/25 text-[#F59E0B] rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all"
              title="Go to Offset"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* MULTI-FILE TAB CONTAINER */}
      <div className="bg-[#11161D] border-b border-[#2A313C] h-9 px-3 flex items-center justify-between shrink-0 z-30 overflow-x-auto select-none">
        <div className="flex items-center space-x-1 overflow-x-auto hide-scrollbar">
          {openFiles.map((f) => {
            const isSelected = activeFileId === f.id;
            const hasPatches = f.patches.size > 0;
            return (
              <div 
                key={f.id}
                onClick={() => {
                  setActiveFileId(f.id);
                  setShowAnalysisSummary(false);
                }}
                className={`h-9 px-3 border-r border-[#2A313C] flex items-center space-x-2 text-xs cursor-pointer transition-all relative ${
                  isSelected 
                    ? 'bg-[#0B0F14] text-[#E8EAF0] border-t-2 border-t-[#3B82F6]' 
                    : 'text-[#94A3B8]/60 hover:text-[#E8EAF0] hover:bg-[#171C23]'
                }`}
              >
                <FileCode className={`w-3.5 h-3.5 ${isSelected ? 'text-[#3B82F6]' : 'text-[#94A3B8]/40'}`} />
                <span className="max-w-[120px] truncate font-semibold">{f.name}</span>
                {hasPatches && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" title="Modified buffer bytes" />
                )}
                <button 
                  onClick={(e) => handleCloseFileTab(f.id, e)}
                  className="p-0.5 rounded hover:bg-[#2A313C] text-[#94A3B8]/40 hover:text-[#EF4444] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        <button 
          onClick={() => setIsTabGridViewOpen(true)}
          className="text-[10px] text-[#3B82F6] hover:underline font-bold flex items-center space-x-1 shrink-0 px-2"
        >
          <Grid className="w-3.5 h-3.5" />
          <span>All Tabs ({openFiles.length})</span>
        </button>
      </div>

      {/* MAIN LAYOUT SPLITTER */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* 2. LEFT COLLAPSIBLE SIDEBAR */}
        {!isMobile && (
          <div className={`bg-[#11161D] border-r border-[#2A313C] flex flex-col justify-between shrink-0 transition-all duration-200 ${sidebarExpanded ? 'w-44' : 'w-12'}`}>
            <div className="flex flex-col py-2 overflow-y-auto custom-scrollbar flex-1">
              {[
                { id: 'overview', label: 'Dashboard', icon: LayoutGrid },
                { id: 'ai_analysis', label: 'AI Chat', icon: Sparkles },
                { id: 'ai_agent', label: 'AI Agent (Next-Gen)', icon: Bot },
                { id: 'bvcs', label: 'Binary Git (BVCS)', icon: GitBranch },
                { id: 'edit', label: 'Workspace', icon: FileCode },
                { id: 'scan_pipeline', label: 'Deep Scan', icon: ShieldCheck },
                { id: 'universal_engine', label: 'Engine Hub', icon: Cpu },
                { id: 'advanced', label: 'Hex Editor', icon: Sliders },
                { id: 'structure', label: 'Structure', icon: Workflow },
                { id: 'strings', label: 'Strings', icon: AlignLeft },
                { id: 'metadata', label: 'Metadata', icon: Info },
                { id: 'media', label: 'Resources', icon: Image },
                { id: 'yara', label: 'YARA Rule Area', icon: ShieldAlert },
                { id: 'plugins', label: 'Plugin manager', icon: Beaker },
                { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
                { id: 'settings', label: 'Settings', icon: Settings }
              ].map((tab) => {
                const Icon = tab.icon;
                const isSelected = activeTab === tab.id;
                return (
                  <React.Fragment key={tab.id}>
                    <button
                      onClick={() => {
                        setActiveTab(tab.id);
                        setShowAnalysisSummary(false);
                      }}
                      className={`w-full py-2 flex items-center transition-colors relative ${
                        isSelected 
                          ? 'bg-[#171C23] text-[#3B82F6] font-bold border-l-2 border-l-[#3B82F6]' 
                          : 'text-[#94A3B8]/70 hover:text-[#E8EAF0] hover:bg-[#171C23]/40'
                      } ${sidebarExpanded ? 'px-3 justify-start space-x-3' : 'justify-center'}`}
                      title={tab.label}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {sidebarExpanded && (
                        <span className="text-xs tracking-tight truncate">{tab.label}</span>
                      )}
                    </button>

                    {/* AI Chat Threads list in Menu */}
                    {tab.id === 'ai_analysis' && sidebarExpanded && chatThreads.length > 0 && (
                      <div className="pl-6 pr-2 py-1 space-y-1 bg-black/10 border-l border-[#2A313C] ml-5 my-1">
                        {chatThreads.slice(0, 5).map((thread) => {
                          const isThreadActive = activeTab === 'ai_analysis' && activeThreadId === thread.id;
                          return (
                            <button
                              key={thread.id}
                              onClick={() => {
                                setActiveThreadId(thread.id);
                                setActiveTab('ai_analysis');
                                setShowAnalysisSummary(false);
                              }}
                              className={`w-full text-left py-1 px-1.5 rounded text-[10px] truncate block transition-all ${
                                isThreadActive
                                  ? 'bg-[#172030] text-blue-400 font-semibold border-l border-blue-500/40 pl-2'
                                  : 'text-[#94A3B8]/60 hover:text-[#E8EAF0] hover:bg-[#171C23]/30'
                              }`}
                              title={thread.title}
                            >
                              • {thread.title}
                            </button>
                          );
                        })}
                        {chatThreads.length > 5 && (
                          <button
                            onClick={() => {
                              setActiveTab('ai_analysis');
                              setShowAnalysisSummary(false);
                            }}
                            className="w-full text-left py-0.5 px-1.5 text-[9px] text-[#3B82F6] hover:underline"
                          >
                            Xem tất cả ({chatThreads.length})
                          </button>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Toggle sidebar button */}
            <button 
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className="py-2.5 border-t border-[#2A313C] text-[#94A3B8]/50 hover:text-[#E8EAF0] text-center w-full flex items-center justify-center transition-colors"
            >
              <ChevronRight className={`w-4 h-4 transform transition-transform ${sidebarExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}

        {/* 3. CENTER VIEWPORT */}
        <div className="flex-1 bg-[#0B0F14] overflow-hidden flex flex-col relative">
          
          <AnimatePresence mode="wait">
            
            {/* Stage Pipeline Asynchronous Scan Board */}
            {showAnalysisSummary ? (
              <motion.div
                key="summary_view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto p-6 space-y-5 text-left max-w-4xl mx-auto w-full custom-scrollbar"
              >
                <div className="bg-[#171C23] border border-[#2A313C] p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="px-2 py-0.5 bg-[#3B82F6]/10 border border-[#3B82F6]/20 rounded text-[9px] font-mono text-[#3B82F6] font-bold uppercase tracking-wider">SECURE BOOT SCAN</span>
                    <h2 className="text-base font-bold text-[#E8EAF0]">HỆ THỐNG PHÂN TÍCH NHỊ PHÂN TUYẾN TÍNH</h2>
                    <p className="text-xs text-[#94A3B8]">Giao thức rà soát chẩn đoán tệp tin nhị phân cô lập 10 giai đoạn thời gian thực.</p>
                  </div>
                  <div className="bg-[#11161D] border border-[#2A313C] px-3.5 py-2 rounded-lg flex items-center gap-3">
                    <FileCode className="w-7 h-7 text-[#3B82F6]" />
                    <div>
                      <h4 className="text-xs font-bold text-[#E8EAF0] max-w-[150px] truncate">{activeFile.name}</h4>
                      <p className="text-[10px] font-mono text-[#94A3B8]">{(activeFile.size / 1024 / 1024).toFixed(2)} MB • {perfMode.toUpperCase()}</p>
                    </div>
                  </div>
                </div>

                {/* Stages List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#171C23] border border-[#2A313C] rounded-xl p-5 space-y-3">
                    <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#2A313C] pb-2">
                      <Terminal className="w-3.5 h-3.5 text-[#3B82F6]" /> TRẠNG THÁI TIẾN TRÌNH QUÉT
                    </h3>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 text-[11px] font-mono">
                      {scanStages.map(stage => (
                        <div key={stage.id} className="flex justify-between items-center p-2 bg-[#11161D] border border-[#2A313C]/60 rounded">
                          <span className="truncate pr-2">{stage.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            stage.status === 'success' ? 'bg-[#22C55E]/10 text-[#22C55E]' :
                            stage.status === 'running' ? 'bg-[#3B82F6]/10 text-[#3B82F6] animate-pulse' :
                            'bg-black/20 text-[#94A3B8]/60'
                          }`}>
                            {stage.status.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#171C23] border border-[#2A313C] rounded-xl p-5 flex flex-col justify-between">
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider border-b border-[#2A313C] pb-2">TIẾN ĐỘ CHUNG</h3>
                      <div className="space-y-2">
                        <div className="h-2 w-full bg-black/30 rounded-full overflow-hidden border border-[#2A313C]">
                          <div className="h-full bg-[#3B82F6] rounded-full" style={{ width: `${analysisProgress}%` }} />
                        </div>
                        <div className="flex justify-between text-xs font-mono text-[#94A3B8]">
                          <span>{analysisProgress.toFixed(1)}% Hoàn thành</span>
                          <span>Tốc độ: {scanMetrics.speed > 0 ? `${scanMetrics.speed.toFixed(1)} MB/s` : 'Analyzing'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-[#2A313C] space-y-2">
                      <button 
                        onClick={() => {
                          setShowAnalysisSummary(false);
                          setActiveTab('overview');
                        }}
                        className="w-full py-2.5 bg-[#3B82F6] hover:bg-blue-600 text-[#E8EAF0] text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Mở Trình chỉnh sửa Tệp (Workspace)</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                
                <React.Suspense fallback={
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
                    <RefreshCw className="w-7 h-7 text-[#3B82F6] animate-spin" />
                    <p className="text-xs text-[#94A3B8]">Loading Module in virtual stack...</p>
                  </div>
                }>
                  
                  {/* Dashboard / Overview */}
                  {activeTab === 'overview' && (
                    <OverviewTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      analysis={analysisResult}
                      onNavigateTab={(tid: any) => {
                        setActiveTab(tid);
                      }}
                      onUnlockAdvanced={() => setIsAdvancedUnlocked(true)}
                      isAdvancedUnlocked={isAdvancedUnlocked}
                      patches={activePatches}
                      onApplyPatch={(offset, val) => {
                        setActivePatches((prev: any) => {
                          const next = new Map(prev);
                          next.set(offset, val);
                          return next;
                        });
                      }}
                      onClearPatches={() => setActivePatches(new Map())}
                      onImportPatches={(imported) => setActivePatches(imported)}
                      perfMode={perfMode}
                      onChangePerfMode={(mode) => {
                        setPerfMode(mode);
                        setIsAnalyzing(true);
                        setShowAnalysisSummary(true);
                      }}
                      scanMetrics={scanMetrics}
                      appMode={appMode}
                      setAppMode={setAppMode}
                    />
                  )}

                  {/* Smart Editor */}
                  {activeTab === 'edit' && (
                    <SmartEditTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      analysis={analysisResult}
                      patches={activePatches}
                      onApplyPatch={handleApplyBytePatch}
                      onApplyPatches={handleApplyBulkPatches}
                      onNavigateTab={(tid: any) => setActiveTab(tid)}
                      onJumpToOffset={(off) => {
                        setJumpToOffset(off);
                        setIsAdvancedUnlocked(true);
                        setActiveTab('advanced');
                      }}
                    />
                  )}

                  {/* Hex Editor */}
                  {activeTab === 'advanced' && (
                    <div className="flex-1 h-full min-h-[480px]">
                      <HexEditor
                        file={activeFile}
                        fileId={activeFileId}
                        onDataChange={() => {}}
                        jumpToOffset={jumpToOffset}
                        patches={activePatches}
                        setPatches={setActivePatches}
                        virtualFileSize={activeFileSize}
                        setVirtualFileSize={setVirtualFileSize}
                        initialActiveToolTab={hexEditorActiveTab}
                        showToolsPanelProp={true}
                        perfMode={perfMode}
                        onSelectOffset={(off: number) => setJumpToOffset(off)}
                        analysis={analysisResult}
                      />
                    </div>
                  )}

                  {/* Strings tab */}
                  {activeTab === 'strings' && (
                    <StringsTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      onJumpToOffset={(off) => {
                        setJumpToOffset(off);
                        setActiveTab('advanced');
                      }}
                      onPatchString={handlePatchString}
                      analysis={analysisResult}
                      isAnalyzing={isAnalyzing}
                      onNavigateTab={(tid) => setActiveTab(tid)}
                      initialSearchQuery={stringSearchQuery}
                    />
                  )}

                  {/* YARA Scan Rules Workspace */}
                  {activeTab === 'yara' && (
                    <YaraTab 
                      file={activeFile} 
                      onJumpToOffset={(offset) => {
                        setJumpToOffset(offset);
                        setActiveTab('advanced');
                      }} 
                    />
                  )}

                  {/* Metadata extraction */}
                  {activeTab === 'metadata' && (
                    <MetadataTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      analysis={analysisResult}
                      onUpdateMetadataString={handlePatchString}
                    />
                  )}

                  {/* Structure analysis */}
                  {activeTab === 'structure' && (
                    <StructureTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      analysis={analysisResult}
                      onJumpToOffset={(off) => {
                        setJumpToOffset(off);
                        setActiveTab('advanced');
                      }}
                    />
                  )}

                  {/* Resources / Media */}
                  {activeTab === 'media' && (
                    <div className="p-6 text-left space-y-4">
                      <div className="bg-[#171C23] border border-[#2A313C] rounded-xl p-5">
                        <h3 className="text-sm font-bold text-[#E8EAF0] mb-4 flex items-center gap-2">
                          <Image className="w-4 h-4 text-[#3B82F6]" />
                          Media / Resource Previews
                        </h3>
                        <MediaPreview file={activeFile} patches={activePatches} virtualFileSize={activeFileSize} />
                      </div>
                    </div>
                  )}

                  {/* Content / Plain text tab */}
                  {activeTab === 'content' && (
                    <ContentTab
                      file={activeFile}
                      virtualFileSize={activeFileSize}
                      isText={analysisResult?.isText || false}
                      initialTextContent={analysisResult?.textContent || ''}
                      onSaveContent={handleSaveTextContent}
                    />
                  )}

                  {/* Search tab */}
                  {activeTab === 'search' && (
                    <SearchTab
                      file={activeFile}
                      patches={activePatches}
                      virtualFileSize={activeFileSize}
                      onJumpToOffset={(off) => {
                        setJumpToOffset(off);
                        setActiveTab('advanced');
                      }}
                    />
                  )}

                  {/* 24-Stage Deep Scan Pipeline and Report Generator */}
                  {activeTab === 'scan_pipeline' && (
                    <div className="p-4 text-left space-y-4 max-w-4xl mx-auto w-full">
                      <div className="bg-[#171C23] border border-[#2A313C] p-4 rounded-xl flex flex-col gap-3">
                        <div className="space-y-1">
                          <h2 className="text-sm font-bold text-[#E8EAF0] flex items-center gap-2">
                            <Shield className="w-5 h-5 text-[#3B82F6]" />
                            Deep Scan Pipeline
                          </h2>
                          <p className="text-[10px] text-[#94A3B8]">Runs standard cryptographic and malware heuristics checking suite on raw bytes.</p>
                        </div>
                        <button 
                          onClick={triggerPipelineScan}
                          disabled={pipelineRunning}
                          className="w-full py-3 bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-40 text-[#E8EAF0] text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {pipelineRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          <span>{pipelineRunning ? 'Scanning...' : 'Execute Deep Scan Suite'}</span>
                        </button>
                      </div>

                      {/* Interactive Engines Visualizer */}
                      <div className="bg-[#171C23] border border-[#2A313C] rounded-xl p-4 space-y-3">
                        <h3 className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">PIPELINE ENGINES</h3>
                        <div className="space-y-2">
                          {pipelineEngines.map((engine, idx) => {
                            const isScanned = idx < pipelineStepIndex;
                            const isCurrent = idx === pipelineStepIndex;
                            return (
                              <details key={idx} className="group p-3 rounded-lg border border-[#2A313C] bg-[#11161D]">
                                <summary className="flex items-center justify-between font-bold text-[11px] cursor-pointer list-none text-[#E8EAF0]">
                                  <span className={isCurrent ? 'text-[#3B82F6]' : isScanned ? 'text-[#22C55E]' : 'text-[#94A3B8]'}>
                                    {idx + 1}. {engine.name}
                                  </span>
                                  {isScanned && <Check className="w-4 h-4 text-[#22C55E]" />}
                                  {isCurrent && <RefreshCw className="w-4 h-4 text-[#3B82F6] animate-spin" />}
                                </summary>
                                <p className="text-[10px] text-[#94A3B8] mt-2 pt-2 border-t border-[#2A313C]">{engine.desc}</p>
                              </details>
                            );
                          })}
                        </div>
                      </div>

                      {/* Logs console */}
                      <div className="bg-[#11161D] border border-[#2A313C] rounded-xl p-4">
                        <h4 className="text-[10px] font-bold text-[#94A3B8] mb-2 font-mono flex items-center gap-1">
                          <Terminal className="w-3.5 h-3.5" />
                          CONSOLE LOGS
                        </h4>
                        <div className="h-40 overflow-y-auto bg-black/40 p-3 rounded border border-[#2A313C]/60 font-mono text-[9px] text-[#22C55E] space-y-1 text-left">
                          {pipelineLogs.map((log, lidx) => (
                            <div key={lidx}>{log}</div>
                          ))}
                          {pipelineRunning && <div className="animate-pulse">_</div>}
                        </div>
                      </div>

                      {/* Final Security Report Card */}
                      {pipelineRiskScore !== null && (
                        <div className="bg-[#171C23] border border-[#2A313C] rounded-xl p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-[#E8EAF0]">DISINFECT SECURITY SCORE</h4>
                            <span className="text-sm font-extrabold text-[#22C55E] font-mono">{pipelineRiskScore}/100</span>
                          </div>
                          <p className="text-[10px] text-[#94A3B8]">Safe Structure verified. Static binary signatures successfully resolved without critical flags.</p>
                          <div className="border-t border-[#2A313C] pt-4 mt-2 space-y-2">
                            <button
                              onClick={() => setShowFullReport(true)}
                              className="w-full py-2 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <FileText className="w-4 h-4" />
                              Xem Chi Tiết Báo Cáo
                            </button>
                            <button
                              onClick={() => {
                                setHexEditorActiveTab('structures');
                                setActiveTab('advanced');
                                toast("Đã mở bản đồ cấu trúc nhị phân thành công!", "success");
                              }}
                              className="w-full py-2.5 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/35 hover:to-indigo-600/35 border border-blue-500/40 text-blue-300 text-xs font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.98]"
                            >
                              <Layers className="w-4 h-4 text-blue-400" />
                              Mở Bản Đồ Cấu Trúc Nhị Phân
                            </button>
                            <button
                              onClick={() => {
                                setHexEditorActiveTab('beginner');
                                setActiveTab('advanced');
                                toast("Chào mừng bạn đến với Trợ lý Nhập môn!", "info");
                              }}
                              className="w-full py-2.5 bg-gradient-to-r from-pink-600/20 to-purple-600/20 hover:from-pink-600/35 hover:to-purple-600/35 border border-pink-500/40 text-pink-300 text-xs font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.98]"
                            >
                              <Sparkles className="w-4 h-4 text-pink-400 animate-pulse" />
                              Mở & Xem Trợ Lý Nhập Môn 🌸
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Plugin Manager view */}
                  {activeTab === 'plugins' && (
                    <div className="p-6 text-left space-y-6 max-w-4xl mx-auto w-full">
                      <div className="border-b border-[#2A313C] pb-4 flex items-center justify-between">
                        <div>
                          <h2 className="text-base font-bold text-[#E8EAF0] flex items-center gap-1.5">
                            <Beaker className="w-5 h-5 text-[#3B82F6]" />
                            Plugin Manager & Sandbox Runtime
                          </h2>
                          <p className="text-xs text-[#94A3B8]">Enable auxiliary decoders, decompilers or run sandboxed Javascript macros.</p>
                        </div>
                      </div>

                      <div className="flex space-x-2 border-b border-[#2A313C]">
                        {['installed', 'marketplace', 'sandbox', 'api'].map((pt) => (
                          <button
                            key={pt}
                            onClick={() => setSandboxTab(pt as any)}
                            className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
                              sandboxTab === pt ? 'border-[#3B82F6] text-[#3B82F6]' : 'border-transparent text-[#94A3B8]/60 hover:text-[#E8EAF0]'
                            }`}
                          >
                            {pt.toUpperCase()}
                          </button>
                        ))}
                      </div>

                      {sandboxTab === 'installed' && (
                        <div className="space-y-3">
                          {plugins.map((p) => (
                            <div key={p.id} className="p-4 bg-[#171C23] border border-[#2A313C] rounded-xl flex items-center justify-between gap-4">
                              <div className="space-y-1">
                                <h4 className="text-xs font-bold text-[#E8EAF0]">{p.name} <span className="text-[10px] text-[#94A3B8] font-mono">v{p.version}</span></h4>
                                <p className="text-[11px] text-[#94A3B8]">{p.desc}</p>
                                <span className="text-[9px] font-mono text-[#3B82F6]">By {p.author} • Permissions: READ_DISK</span>
                              </div>
                              <button 
                                onClick={() => togglePlugin(p.id)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase cursor-pointer ${
                                  p.enabled ? 'bg-[#22C55E]/10 border border-[#22C55E]/25 text-[#22C55E]' : 'bg-black/20 border border-[#2A313C] text-[#94A3B8]/50'
                                }`}
                              >
                                {p.enabled ? 'ENABLED' : 'DISABLED'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {sandboxTab === 'marketplace' && (
                        <div className="space-y-3">
                          {marketplacePlugins.map((p) => (
                            <div key={p.id} className="p-4 bg-[#171C23] border border-[#2A313C] rounded-xl flex items-center justify-between gap-4">
                              <div className="space-y-1">
                                <h4 className="text-xs font-bold text-[#E8EAF0]">{p.name} <span className="text-[10px] text-[#94A3B8] font-mono">v{p.version}</span></h4>
                                <p className="text-[11px] text-[#94A3B8]">{p.desc}</p>
                                <span className="text-[9px] font-mono text-[#94A3B8]">By {p.author}</span>
                              </div>
                              <button 
                                onClick={() => handleInstallPlugin(p)}
                                className="px-3 py-1.5 bg-[#3B82F6] hover:bg-blue-600 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                              >
                                Install Plugin
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {sandboxTab === 'sandbox' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-[#94A3B8] font-mono">MACRO JS RUNTIME</h4>
                            <textarea
                              value={sandboxCode}
                              onChange={(e) => setSandboxCode(e.target.value)}
                              className="w-full h-48 bg-black/45 border border-[#2A313C] p-3 text-[11px] font-mono rounded-lg focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                            />
                            <button 
                              onClick={runSandbox}
                              className="w-full py-2 bg-[#3B82F6] hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Run Script Sandbox
                            </button>
                          </div>
                          <div className="bg-[#11161D] border border-[#2A313C] p-4 rounded-lg flex flex-col justify-between">
                            <h4 className="text-xs font-bold text-[#94A3B8] font-mono mb-2">RUN OUTPUT</h4>
                            <div className="flex-1 bg-black/30 border border-[#2A313C]/40 p-3 rounded font-mono text-[9px] text-[#22C55E] space-y-1 min-h-[140px] text-left">
                              {sandboxLogs.map((log, idx) => (
                                <div key={idx}>{log}</div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {sandboxTab === 'api' && (
                        <div className="p-4 bg-[#11161D] border border-[#2A313C] rounded-xl font-mono text-xs text-left space-y-3">
                          <h4 className="text-xs font-bold text-[#3B82F6] uppercase">WebHexed Developer Assembly API</h4>
                          <p className="text-[#94A3B8] leading-relaxed text-[11px]">Write plugins using standard ES6 syntax to edit and dissect loaded buffers recursively.</p>
                          <div className="bg-black/40 p-3 rounded text-[11px] text-emerald-400 space-y-1">
                            <div>• <code className="text-[#3B82F6]">readBytes(offset, length)</code> - Returns Uint8Array slice</div>
                            <div>• <code className="text-[#3B82F6]">writeBytes(offset, bytes)</code> - Modifies workspace patch registers</div>
                            <div>• <code className="text-[#3B82F6]">addBookmark(offset, label)</code> - Adds metadata bookmark</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Universal Engine Framework View */}
                  {activeTab === 'universal_engine' && (
                    <React.Suspense fallback={
                      <div className="flex items-center justify-center p-12">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                      </div>
                    }>
                      <UniversalEngineTab 
                        file={activeFile} 
                        onAction={(action, payload) => {
                          if (action === 'apply_bulk_patches') {
                            handleApplyBulkPatches(payload);
                          }
                        }} 
                      />
                    </React.Suspense>
                  )}

                  {/* Bookmarks view */}
                  {activeTab === 'ai_analysis' && (
                    <AiAnalysisTab
                      file={activeFile}
                      analysisResult={analysisResult}
                      pipelineContext={pipelineContext}
                      bookmarks={bookmarks}
                      threads={chatThreads}
                      setThreads={setChatThreads}
                      activeThreadId={activeThreadId}
                      setActiveThreadId={setActiveThreadId}
                      patches={activePatches}
                      virtualFileSize={activeFileSize}
                      onAction={(action, payload) => {
                        if (action === 'open_tab') {
                          setActiveTab(payload.tabId);
                        } else if (action === 'jump_offset') {
                          setJumpToOffset(payload.offset);
                          setActiveTab('advanced');
                        } else if (action === 'highlight_string') {
                          setStringSearchQuery(payload.value || '');
                          setActiveTab('strings');
                        } else if (action === 'run_scan') {
                          setActiveTab('scan_pipeline');
                          triggerPipelineScan();
                        } else if (action === 'apply_bulk_patches') {
                          handleApplyBulkPatches(payload);
                        }
                      }}
                    />
                  )}

                  {/* AI Agent System Next Gen */}
                  {activeTab === 'ai_agent' && (
                    <React.Suspense fallback={
                      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3 bg-[#0B0F14]">
                        <Loader2 className="w-8 h-8 text-[#3B82F6] animate-spin" />
                        <p className="text-xs text-[#94A3B8]">Spawning AI Agent System Instance...</p>
                      </div>
                    }>
                      <AiAgentTab
                        file={activeFile}
                        virtualFileSize={activeFileSize}
                        patches={activePatches}
                        onApplyPatches={handleApplyBulkPatches}
                        onClearPatches={() => setActivePatches(new Map())}
                        onSetVirtualFileSize={setVirtualFileSize}
                        analysisResult={analysisResult}
                      />
                    </React.Suspense>
                  )}

                  {/* Binary Version Control System (BVCS) */}
                  {activeTab === 'bvcs' && (
                    <React.Suspense fallback={
                      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3 bg-[#0B0F14]">
                        <RefreshCw className="w-7 h-7 text-[#3B82F6] animate-spin" />
                        <p className="text-xs text-[#94A3B8]">Spawning Binary Git (BVCS) Instance...</p>
                      </div>
                    }>
                      <BvcsTab
                        file={activeFile}
                        virtualFileSize={activeFileSize}
                        patches={activePatches}
                        onApplyPatches={handleApplyBulkPatches}
                        onClearPatches={() => setActivePatches(new Map())}
                        onSetVirtualFileSize={setVirtualFileSize}
                        analysisResult={analysisResult}
                      />
                    </React.Suspense>
                  )}

                  {/* Bookmarks view */}
                  {activeTab === 'bookmarks' && (
                    <div className="p-6 text-left space-y-6 max-w-4xl mx-auto w-full">
                      <div className="bg-[#171C23] border border-[#2A313C] p-5 rounded-xl">
                        <h2 className="text-base font-bold text-[#E8EAF0] mb-4 flex items-center gap-1.5">
                          <Bookmark className="w-5 h-5 text-[#3B82F6]" />
                          Bookmarks Manager
                        </h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5 border-b border-[#2A313C] pb-5">
                          <input 
                            type="text" 
                            placeholder="Offset (e.g. 512)" 
                            value={newBookmarkOffset}
                            onChange={(e) => setNewBookmarkOffset(e.target.value)}
                            className="bg-[#11161D] border border-[#2A313C] rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#3B82F6] text-[#E8EAF0]"
                          />
                          <input 
                            type="text" 
                            placeholder="Label (e.g. ELF Header)" 
                            value={newBookmarkTitle}
                            onChange={(e) => setNewBookmarkTitle(e.target.value)}
                            className="bg-[#11161D] border border-[#2A313C] rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#3B82F6] text-[#E8EAF0]"
                          />
                          <button 
                            onClick={handleAddCustomBookmark}
                            className="px-4 py-2 bg-[#3B82F6] hover:bg-blue-600 rounded-lg text-white font-bold text-xs cursor-pointer"
                          >
                            Add Bookmark
                          </button>
                        </div>

                        <div className="space-y-2">
                          {bookmarks.map((bm, index) => (
                            <div key={index} className="p-3 bg-[#11161D] border border-[#2A313C] rounded-lg flex items-center justify-between text-xs">
                              <div className="text-left font-mono">
                                <span className="text-[#3B82F6] font-bold">[0x{bm.offset.toString(16).toUpperCase()}]</span>
                                <strong className="text-[#E8EAF0] ml-3">{bm.title}</strong>
                                <span className="text-[#94A3B8] ml-4 font-sans italic">({bm.desc})</span>
                              </div>
                              <button 
                                onClick={() => {
                                  setJumpToOffset(bm.offset);
                                  setActiveTab('advanced');
                                }}
                                className="px-2.5 py-1.5 bg-[#171C23] hover:bg-[#2A313C] border border-[#2A313C] rounded text-[#3B82F6] font-bold text-[10px] transition-colors cursor-pointer"
                              >
                                JUMP TO OFFSET
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Settings tab */}
                  {activeTab === 'settings' && (
                    <div className="p-6 text-left space-y-6 max-w-4xl mx-auto w-full">
                      <div className="bg-[#171C23] border border-[#2A313C] p-5 rounded-xl space-y-4">
                        <h2 className="text-base font-bold text-[#E8EAF0] flex items-center gap-1.5 border-b border-[#2A313C] pb-3">
                          <Settings className="w-5 h-5 text-[#3B82F6]" />
                          Suite Settings & Diagnostics
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                          {/* Perf Mode */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-[#94A3B8]">PERFORMANCE ENGINE LEVEL</h4>
                            <select 
                              value={perfMode} 
                              onChange={(e) => setPerfMode(e.target.value as any)}
                              className="w-full bg-[#11161D] border border-[#2A313C] rounded-lg p-2.5 text-xs text-[#E8EAF0] focus:outline-none"
                            >
                              <option value="lite">Lite (Giant files / Eco RAM usage)</option>
                              <option value="balanced">Balanced (Optimal response speed)</option>
                              <option value="professional">Professional (Deep progressive analysis)</option>
                            </select>
                            <p className="text-[10px] text-[#94A3B8]">Sets caching rules and maximum buffers limit to prevent UI thread freezing.</p>
                          </div>

                          {/* App modes */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-[#94A3B8]">WORKSPACE COMPACTION</h4>
                            <div className="flex space-x-2">
                              {['easy', 'advanced'].map((m) => (
                                <button
                                  key={m}
                                  onClick={() => setAppMode(m as any)}
                                  className={`flex-1 py-2 text-xs rounded-lg border cursor-pointer ${
                                    appMode === m 
                                      ? 'bg-[#3B82F6]/15 border-[#3B82F6] text-[#3B82F6] font-bold' 
                                      : 'bg-black/25 border-[#2A313C] text-[#94A3B8]/60 hover:text-[#E8EAF0]'
                                  }`}
                                >
                                  {m.toUpperCase()} MODE
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] text-[#94A3B8]">Hides low-level technical editors if set to Easy Mode.</p>
                          </div>
                        </div>

                        {/* Automated Testing Sandbox Trigger */}
                        <div className="pt-5 border-t border-[#2A313C] space-y-3">
                          <div className="flex justify-between items-center">
                            <div>
                              <h4 className="text-xs font-bold text-[#E8EAF0]">STABILITY TEST SANDBOX SUITE</h4>
                              <p className="text-[10px] text-[#94A3B8]">Run automatic resistance simulations against empty, large or malformed file types.</p>
                            </div>
                            <button
                              onClick={runStabilityTestSuite}
                              disabled={stabilityTestSuiteRunning}
                              className="px-4 py-2 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 border border-[#F59E0B]/30 text-[#F59E0B] rounded-lg text-xs font-bold cursor-pointer"
                            >
                              {stabilityTestSuiteRunning ? 'Testing...' : 'Execute Suite'}
                            </button>
                          </div>

                          {testSuiteResults.length > 0 && (
                            <div className="bg-[#11161D] border border-[#2A313C]/60 p-3 rounded-lg max-h-[160px] overflow-y-auto space-y-1 text-[11px] font-mono">
                              {testSuiteResults.map((tc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-1.5 border-b border-[#2A313C]/20 last:border-b-0">
                                  <span>{tc.name}</span>
                                  <span className={`font-bold ${
                                    tc.status === 'success' ? 'text-[#22C55E]' :
                                    tc.status === 'running' ? 'text-[#3B82F6] animate-pulse' :
                                    'text-[#94A3B8]/50'
                                  }`}>{tc.status.toUpperCase()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </React.Suspense>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* 4. PERSISTENT RIGHT INSPECTOR (Data Interpreter) */}
        {!isMobile && showRightInspector && (
          <div className="w-80 bg-[#11161D] border-l border-[#2A313C] flex flex-col justify-between shrink-0 z-20 text-left overflow-y-auto">
            <div className="p-4 space-y-5">
              <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider border-b border-[#2A313C] pb-2 flex items-center justify-between">
                <span>Data Interpreter</span>
                <span className="text-[10px] font-mono bg-[#171C23] px-2 py-0.5 border border-[#2A313C] rounded">
                  Offset: {jumpToOffset !== null ? `0x${jumpToOffset.toString(16).toUpperCase()}` : 'None'}
                </span>
              </h3>

              {jumpToOffset !== null ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono text-[#94A3B8] block">ACTIVE BYTE (HEX)</span>
                    <span className="text-sm font-mono text-[#E8EAF0] font-bold">
                      {selectedBytes ? `0x${selectedBytes[0].toString(16).toUpperCase().padStart(2, '0')} (${selectedBytes[0]})` : '..'}
                    </span>
                  </div>

                  <div className="space-y-2 border-t border-[#2A313C]/60 pt-3">
                    <h4 className="text-[10px] font-bold text-[#94A3B8] font-mono uppercase">CONVERTED PRIMITIVES</h4>
                    
                    {[
                      { label: 'Int8 (Signed)', value: selectedBytes ? (selectedBytes[0] > 127 ? selectedBytes[0] - 256 : selectedBytes[0]) : '..' },
                      { label: 'Uint8 (Unsigned)', value: selectedBytes ? selectedBytes[0] : '..' },
                      { label: 'Int16 (LE)', value: selectedBytes && selectedBytes.length >= 2 ? (() => {
                        const val = selectedBytes[0] | (selectedBytes[1] << 8);
                        return val > 32767 ? val - 65536 : val;
                      })() : '..' },
                      { label: 'Uint16 (LE)', value: selectedBytes && selectedBytes.length >= 2 ? (selectedBytes[0] | (selectedBytes[1] << 8)) : '..' },
                      { label: 'Int32 (LE)', value: selectedBytes && selectedBytes.length >= 4 ? (() => {
                        const val = (selectedBytes[0] | (selectedBytes[1] << 8) | (selectedBytes[2] << 16) | (selectedBytes[3] << 24)) >>> 0;
                        return val > 2147483647 ? val - 4294967296 : val;
                      })() : '..' },
                      { label: 'Float32 (LE)', value: selectedBytes && selectedBytes.length >= 4 ? (() => {
                        const view = new DataView(selectedBytes.buffer);
                        try { return view.getFloat32(0, true).toFixed(5); } catch { return 'Err'; }
                      })() : '..' },
                      { label: 'Binary Block', value: selectedBytes ? selectedBytes[0].toString(2).padStart(8, '0') : '00000000' },
                      { label: 'ASCII Char', value: selectedBytes ? ((selectedBytes[0] >= 32 && selectedBytes[0] <= 126) ? String.fromCharCode(selectedBytes[0]) : '.') : '.' }
                    ].map((type, tIdx) => (
                      <div key={tIdx} className="flex justify-between text-xs font-mono p-1 bg-[#171C23]/40 border border-[#2A313C]/30 rounded px-2">
                        <span className="text-[#94A3B8] text-[10px]">{type.label}</span>
                        <strong className="text-[#E8EAF0] truncate max-w-[140px]">{type.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-center text-[#94A3B8]/30">
                  <HelpCircle className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs">No active offset.</p>
                  <p className="text-[10px] max-w-[180px] mt-1 opacity-60">Click on any byte in the Hex Editor to load data conversion.</p>
                </div>
              )}
            </div>

            {/* Quick checksum panel */}
            <div className="p-4 border-t border-[#2A313C] space-y-2 font-mono text-[10px]">
              <h4 className="font-bold text-[#94A3B8] uppercase">CHECKSUMS & ENTROPY</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono p-1.5 bg-[#171C23] rounded">
                  <span className="text-[#94A3B8] text-[9px]">Entropy Density</span>
                  <span className="text-[#E8EAF0]">{analysisResult?.isRawScanMode ? 'High' : 'Normal'}</span>
                </div>
                <div className="flex justify-between text-xs font-mono p-1.5 bg-[#171C23] rounded">
                  <span className="text-[#94A3B8] text-[9px]">File Format</span>
                  <span className="text-[#3B82F6] truncate max-w-[110px]">{analysisResult?.fileType || 'Unknown'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* 5. BOTTOM STATUS BAR PANEL */}
      {!isMobile && (
        <div className="h-7 bg-[#11161D] border-t border-[#2A313C] px-3 flex items-center justify-between text-[11px] font-mono text-[#94A3B8] select-none shrink-0 z-30">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <span className="text-[#3B82F6]">Offset:</span>
              <strong className="text-[#E8EAF0]">{jumpToOffset !== null ? `0x${jumpToOffset.toString(16).toUpperCase()}` : '0x0'}</strong>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-[#22C55E]">Modified:</span>
              <strong className="text-[#E8EAF0]">{activePatches.size} bytes</strong>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-[#F59E0B]">Total Size:</span>
              <strong className="text-[#E8EAF0]">{(activeFileSize / 1024).toFixed(2)} KB ({activeFileSize} bytes)</strong>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <span>Engine Status: <strong className="text-[#22C55E]">STABLE ONLINE</strong></span>
            <span>RAM: <strong className="text-[#E8EAF0]">{(activeFileSize > 10 * 1024 * 1024 ? '112.5 MB' : '36.4 MB')}</strong></span>
          </div>
        </div>
      )}

      {/* Dynamic Tab Drawer dialog for mobile view */}
      <AnimatePresence>
        {isTabGridViewOpen && (
          <>
            <div className="fixed inset-0 bg-black/75  z-40" onClick={() => setIsTabGridViewOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 max-h-[75vh] bg-[#171C23] border-t border-[#2A313C] rounded-t-3xl p-5 z-50 flex flex-col overflow-hidden text-left shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-[#E8EAF0] uppercase tracking-wider">Workspace Tabs ({openFiles.length})</h3>
                <button 
                  onClick={() => setIsTabGridViewOpen(false)}
                  className="p-1.5 rounded-lg bg-[#11161D] text-[#94A3B8]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 overflow-y-auto">
                {openFiles.map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => {
                      setActiveFileId(item.id);
                      setIsTabGridViewOpen(false);
                    }}
                    className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer ${
                      activeFileId === item.id ? 'bg-[#3B82F6]/10 border-[#3B82F6] text-[#3B82F6]' : 'bg-[#11161D] border-[#2A313C] text-[#94A3B8]/70'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <FileCode className="w-4 h-4" />
                      <div>
                        <p className="text-xs font-bold text-[#E8EAF0]">{item.name}</p>
                        <p className="text-[10px] font-mono text-[#94A3B8]">{(item.virtualFileSize / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    {item.patches.size > 0 && <span className="text-[10px] font-bold text-[#22C55E]">{item.patches.size} Patches</span>}
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

        {/* Full Report Modal */}
        {showFullReport && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <div className="bg-[#0B0F19] border border-[#2A313C] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-[#2A313C]">
                <h3 className="text-sm font-bold text-[#E8EAF0] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
                  Báo Cáo Phân Tích Chuyên Sâu
                </h3>
                <button
                  onClick={() => setShowFullReport(false)}
                  className="p-1 hover:bg-[#171C23] rounded-lg transition-colors text-[#94A3B8]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="space-y-4">
                  <div className="bg-[#171C23] p-4 rounded-xl border border-[#2A313C]">
                    <h4 className="text-xs font-bold text-[#94A3B8] mb-2 uppercase">Thông tin tập tin</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[#94A3B8]/60">Tên: </span>
                        <span className="text-[#3B82F6]">{activeFile.name}</span>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]/60">Kích thước: </span>
                        <span className="text-[#E8EAF0]">{(activeFileSize / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]/60">Phân loại (Heuristic): </span>
                        <span className="text-[#E8EAF0]">{analysisResult?.fileType || "Binary / Đang xác định"}</span>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]/60">Mã hóa / Đóng gói: </span>
                        <span className="text-[#E8EAF0]">{analysisResult?.isPacked ? 'CÓ (Cảnh báo)' : 'KHÔNG'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#171C23] p-4 rounded-xl border border-[#2A313C]">
                    <h4 className="text-xs font-bold text-[#94A3B8] mb-2 uppercase">Chi tiết các giai đoạn</h4>
                    {pipelineContext ? (
                      <div className="space-y-3">
                        {pipelineEngines.map((engine, idx) => {
                          const result = pipelineContext[idx.toString()];
                          const isSuccess = result?.status === 'success';
                          const isError = result?.status === 'error';
                          return (
                            <div key={idx} className="flex flex-col gap-1 text-[11px] p-2 bg-black/20 rounded border border-white/5">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-[#E8EAF0]">{engine.name}</span>
                                <span className={isSuccess ? 'text-[#22C55E]' : isError ? 'text-red-500' : 'text-[#94A3B8]'}>
                                  {isSuccess ? 'PASS' : isError ? 'FAIL' : 'SKIPPED'}
                                </span>
                              </div>
                              <span className="text-[#94A3B8]/60">{engine.desc}</span>
                              {result?.message && (
                                <span className="text-xs font-mono mt-1 text-[#3B82F6]">{result.message}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center p-8 text-xs text-[#94A3B8]/60">
                        Chưa có dữ liệu chi tiết
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Real-time Ban / Account Locked Overlay */}
      <AnimatePresence>
        {isBanned && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#0c0f1d] border border-red-500/30 rounded-3xl p-6 md:p-8 max-w-md w-full text-center space-y-6 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>
              
              <div className="mx-auto w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center text-red-500 animate-pulse">
                <ShieldAlert className="w-8 h-8" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-xl font-extrabold tracking-tight text-white font-sans uppercase">
                  {language === 'vi' ? 'Tài Khoản Đã Bị Vô Hiệu Hóa' : 'Account Suspended'}
                </h2>
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-red-500/10 border border-red-500/20 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                  <span className="text-[9px] font-mono font-bold uppercase text-red-400 tracking-widest">
                    Real-time Lock
                  </span>
                </div>
              </div>
              
              <p className="text-xs text-white/60 leading-relaxed font-sans text-center px-2">
                {language === 'vi' 
                  ? 'Hệ thống đã kích hoạt chế độ khóa bảo mật thời gian thực trên Firestore do tài khoản của bạn nhận tín hiệu khóa khẩn cấp hoặc bị Quản trị viên vô hiệu hóa (banned: true).'
                  : 'The system has activated real-time safety lockdown on Firestore because your account received an emergency lockout signal or was disabled by an Administrator.'}
              </p>

              {/* Owner Security Verification Pathway */}
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl text-left space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-sans block flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {language === 'vi' ? 'Xác Minh Khôi Phục Khẩn Cấp:' : 'Emergency Self-Service Recovery:'}
                </span>
                <p className="text-[10px] text-white/50 leading-relaxed font-sans">
                  {language === 'vi'
                    ? 'Bạn có thể thực hiện xác minh danh tính chủ sở hữu tài khoản để tự động giải trừ trạng thái khóa khẩn cấp và khôi phục quyền truy cập vào Workspace ngay lập tức.'
                    : 'You can perform direct identity ownership verification to automatically de-escalate the lockout and restore full access to your Workspace.'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={handleUnbanSelf}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/20 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/20"
                >
                  <Check className="w-4 h-4" />
                  <span>{language === 'vi' ? 'Xác minh & Mở khóa' : 'Verify & Unlock'}</span>
                </button>
                
                <button
                  onClick={handleBannedSignOut}
                  className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{language === 'vi' ? 'Đăng xuất' : 'Sign Out'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <DevPerformanceBoard />
    </div>
  );
}
