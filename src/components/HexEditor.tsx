import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Download, Undo, Loader2, Navigation, CheckCircle, Search, Sliders, 
  Trash2, Bookmark, Layers, History, Activity, Hash, ArrowLeft, ArrowRight, 
  RotateCcw, Sparkles, Copy, ChevronRight, AlertCircle, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { EditRecord } from '../types';
import { auth } from '../firebase';
import { useUI } from './UIProvider';
import MiniHexEditorSheet from './MiniHexEditorSheet';
import { incrementStat } from '../utils/stats';
import { readAndPatchChunk, searchLocalFile, downloadPatchedFileStream } from '../utils/fileStream';
import { crc32, md5, sha1, sha256, calculateEntropy } from '../utils/checksums';
import { parseFileStructures } from '../utils/structures';

interface HexEditorProps {
  file: File;
  fileId: string;
  onClose?: () => void;
  onDataChange?: (newData: Uint8Array) => void;
  jumpToOffset?: number | null;
  patches: Map<number, number>;
  setPatches: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  virtualFileSize: number;
  setVirtualFileSize: React.Dispatch<React.SetStateAction<number>>;
  onApplied?: () => void;
  initialActiveToolTab?: 'search' | 'structures' | 'history' | 'checksums' | 'beginner';
  showToolsPanelProp?: boolean;
  onSelectOffset?: (offset: number) => void;
  perfMode?: string;
  analysis?: any;
}

interface HistoryEntry {
  offset: number;
  oldValue: number;
  newValue: number;
  type: 'edit' | 'bulk' | 'replace';
  timestamp: number;
}

const ROW_HEIGHT = 24;

export default function HexEditor({ 
  file, 
  fileId, 
  onClose, 
  onDataChange, 
  jumpToOffset,
  patches,
  setPatches,
  virtualFileSize,
  setVirtualFileSize,
  onApplied,
  initialActiveToolTab,
  showToolsPanelProp,
  onSelectOffset,
  perfMode,
  analysis
}: HexEditorProps) {
  const { toast, confirm } = useUI();
  // Main view and scroll states
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const [itemsPerRow, setItemsPerRow] = useState(16);
  const [isLoading, setIsLoading] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [version, setVersion] = useState(0); // Triggers visual re-renders

  // Right dock tool layout state
  const [showToolsPanel, setShowToolsPanel] = useState(true);
  const [activeToolTab, setActiveToolTab] = useState<'search' | 'structures' | 'history' | 'checksums' | 'beginner'>('search');

  // Synchronize external props
  useEffect(() => {
    if (initialActiveToolTab) {
      setActiveToolTab(initialActiveToolTab);
    }
  }, [initialActiveToolTab]);

  useEffect(() => {
    if (showToolsPanelProp !== undefined) {
      setShowToolsPanel(showToolsPanelProp);
    }
  }, [showToolsPanelProp]);

  // Slidng Window cache refs (RAM Safety Requirements)
  const loadedDataRef = useRef<Uint8Array | null>(null);
  const loadedStartRowRef = useRef<number>(0);

  // Focus and inline edits
  const [selectedOffset, setSelectedOffset] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // States for direct bottom panel input
  const [panelHexInput, setPanelHexInput] = useState('');
  const [panelDecInput, setPanelDecInput] = useState('');
  const [panelCharInput, setPanelCharInput] = useState('');

  // Refs for virtual scrolling & debounce
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const lastScrollTopRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentScrollTopRef = useRef<number>(0);
  const isScrollingUpRef = useRef<boolean>(false);

  // 1. Search & Replace Panel states
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchType, setSearchType] = useState<'hex' | 'ascii' | 'utf8' | 'utf16'>('hex');
  const [replaceMode, setReplaceMode] = useState<'single' | 'all'>('single');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [searchCurrentIndex, setSearchCurrentIndex] = useState(-1);

  // 2. Bookmarks Panel states
  const [bookmarks, setBookmarks] = useState<Array<{ offset: number; title: string }>>([]);
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [bookmarkOffset, setBookmarkOffset] = useState('');

  // 3. Structural Template Parser states
  const [structureType, setStructureType] = useState('Unknown');
  const [structures, setStructures] = useState<Array<{ name: string; offset: number; size: number; details?: string }>>([]);
  const [isParsingStructures, setIsParsingStructures] = useState(false);

  // 4. Patches & History Panel states
  const [serverPatches, setServerPatches] = useState<Array<{ offset: number; oldValue: number; newValue: number; disabled: boolean; timestamp: number }>>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLength, setHistoryLength] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 5. Hashes & Entropy states
  const [hashes, setHashes] = useState<{ md5: string; sha1: string; sha256: string; crc32: string } | null>(null);
  const [entropyData, setEntropyData] = useState<Array<{ block: number; entropy: number; offset: number }>>([]);
  const [isHashesLoading, setIsHashesLoading] = useState(false);
  const [isEntropyLoading, setIsEntropyLoading] = useState(false);

  // 6. Session Recovery states
  const [showSessionRecovery, setShowSessionRecovery] = useState(false);

  // 7. Mobile Bottom Sheet states
  const [isMiniSheetOpen, setIsMiniSheetOpen] = useState(false);
  const [miniSheetOffset, setMiniSheetOffset] = useState<number | null>(null);
  const [miniSheetByteValue, setMiniSheetByteValue] = useState<number | null>(null);

  // 8. Gestures refs
  const longPressTimeoutRef = useRef<any>(null);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickedOffsetRef = useRef<number | null>(null);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const pinchCooldownRef = useRef<boolean>(false);

  const sessionKey = useMemo(() => `hex_session_recovery_${file.name}_${file.size}`, [file]);

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

  // Total metrics
  const totalRows = Math.ceil(virtualFileSize / itemsPerRow);
  const scrollHeight = totalRows * ROW_HEIGHT;

  // Active virtual scroll boundaries
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
  const visibleRowsCount = Math.ceil(viewportHeight / ROW_HEIGHT);
  const endRow = Math.min(totalRows - 1, startRow + visibleRowsCount + 1);

  // Sliding window base offset computation with 40-row bounds buffer
  let calculatedWindowStartRow = Math.max(0, Math.min(totalRows - 100, startRow - 40));
  if (calculatedWindowStartRow < 0) {
    calculatedWindowStartRow = 0;
  }
  const windowStartRow = calculatedWindowStartRow;

  // Initial load data & session checks
  useEffect(() => {
    fetchWindowData(0);
    loadHistoryAndPatches();
    loadHashesAndEntropy();
    loadStructures();
    checkSessionRecovery();
  }, [itemsPerRow, file]);

  // Handle jumpToOffset propagation from parent Workspace tabs
  useEffect(() => {
    if (jumpToOffset !== null && jumpToOffset !== undefined) {
      scrollToOffset(jumpToOffset);
    }
  }, [jumpToOffset]);

  // Handle bookmarks sync with LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem(`hex_bookmarks_${file.name}_${file.size}`);
    if (saved) {
      try {
        setBookmarks(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse bookmarks:', e);
      }
    }
  }, [file]);

  // Fetch window data with active AbortController support to kill stale calls
  const fetchWindowData = async (targetStartRow: number) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    isFetchingRef.current = true;
    setIsLoading(true);

    let safeStartRow = Math.max(0, targetStartRow);
    let startOffset = safeStartRow * itemsPerRow;
    const length = 100 * itemsPerRow; // Exactly 100 lines cache
    const safeLength = Math.min(length, virtualFileSize - startOffset);

    if (safeLength <= 0) {
      isFetchingRef.current = false;
      setIsLoading(false);
      return;
    }

    // Wipe cache to release browser RAM immediately
    if (loadedDataRef.current) {
      loadedDataRef.current = null;
    }
    setVersion(v => v + 1);

    try {
      const chunk = await readAndPatchChunk(file, startOffset, safeLength, patches, virtualFileSize);
      if (controller.signal.aborted) return;

      loadedDataRef.current = chunk;
      loadedStartRowRef.current = safeStartRow;
      setVersion(v => v + 1);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[AbortController]: Stale chunk fetch request aborted.');
      } else {
        console.error('[Window Fetch Error]:', err);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        isFetchingRef.current = false;
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  // Synchronize view and stats whenever patches prop updates (e.g. from AI Chat or external actions)
  useEffect(() => {
    fetchWindowData(windowStartRow);
    loadHashesAndEntropy();
    loadStructures();
  }, [patches]);

  // Scroll Throttle / Debounce engine
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    if (currentScrollTop < 0) return;

    const isScrollingUp = currentScrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = currentScrollTop;
    isScrollingUpRef.current = isScrollingUp;

    // Optimize rendering by only updating state when row boundary crosses
    const currentStartRow = Math.floor(currentScrollTop / ROW_HEIGHT);
    const prevStartRow = Math.floor(scrollTop / ROW_HEIGHT);
    
    if (currentStartRow !== prevStartRow) {
      setScrollTop(currentScrollTop);
    }
    
    currentScrollTopRef.current = currentScrollTop;

    const firstVisibleRow = Math.floor(currentScrollTop / ROW_HEIGHT);

    const isDataLoaded = loadedDataRef.current &&
                         loadedStartRowRef.current <= firstVisibleRow &&
                         (loadedStartRowRef.current + 100) >= (firstVisibleRow + visibleRowsCount + 2);

    if (!isDataLoaded) {
      if (pendingFetchTimeoutRef.current) {
        clearTimeout(pendingFetchTimeoutRef.current);
        pendingFetchTimeoutRef.current = null;
      }

      // Hard Debounce: 120ms to allow extremely high scrolling speed without server fatigue
      pendingFetchTimeoutRef.current = setTimeout(() => {
        const latestScrollTop = currentScrollTopRef.current;
        const latestFirstVisibleRow = Math.floor(latestScrollTop / ROW_HEIGHT);
        let latestTargetStartRow = Math.max(0, Math.min(totalRows - 100, latestFirstVisibleRow - 40));
        if (latestTargetStartRow < 0) {
          latestTargetStartRow = 0;
        }

        if (loadedDataRef.current) {
          loadedDataRef.current = null;
          setVersion(v => v + 1);
        }

        fetchWindowData(latestTargetStartRow);
      }, 120);
    }
  };

  // Helper to compile patches state and history representation
  const applyHistoryToPatches = (histList: HistoryEntry[], idx: number) => {
    const newPatches = new Map<number, number>();
    for (let i = 0; i <= idx; i++) {
      const entry = histList[i];
      newPatches.set(entry.offset, entry.newValue);
    }
    setPatches(newPatches);

    const computedPatches = histList.map((entry, entryIdx) => ({
      offset: entry.offset,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      disabled: entryIdx > idx,
      timestamp: entry.timestamp
    }));
    setServerPatches(computedPatches);
    setHistoryLength(histList.length);
    setHistoryIndex(idx);
    backupSessionToLocal(computedPatches);
  };

  // Load backend history and patches list
  const loadHistoryAndPatches = async () => {
    // History is managed locally in memory
  };

  // Load and refresh hashes/entropy
  const loadHashesAndEntropy = async () => {
    setIsHashesLoading(true);
    setIsEntropyLoading(true);
    try {
      const sliceLimit = Math.min(5 * 1024 * 1024, virtualFileSize);
      const buffer = await readAndPatchChunk(file, 0, sliceLimit, patches, virtualFileSize);
      
      const crcVal = crc32(buffer);
      const md5Val = md5(buffer);
      const sha1Val = await sha1(buffer);
      const sha256Val = await sha256(buffer);

      setHashes({
        crc32: crcVal,
        md5: md5Val,
        sha1: sha1Val,
        sha256: sha256Val
      });

      const entropyResults = calculateEntropy(buffer);
      setEntropyData(entropyResults);
    } catch (err) {
      console.error('Failed hashes/entropy refresh:', err);
    } finally {
      setIsHashesLoading(false);
      setIsEntropyLoading(false);
    }
  };

  const triggerHashesAndEntropy = () => {
    loadHashesAndEntropy();
  };

  // Run Structural Template Parser
  const loadStructures = async () => {
    setIsParsingStructures(true);
    try {
      const scanSize = Math.min(128 * 1024, virtualFileSize);
      const buffer = await readAndPatchChunk(file, 0, scanSize, patches, virtualFileSize);
      const result = parseFileStructures(buffer);
      
      let mergedList = [...result.structures];
      if (analysis && analysis.structure) {
        analysis.structure.forEach((s: any) => {
          if (!mergedList.some(node => node.offset === s.start)) {
            mergedList.push({
              name: `${s.name} [Deep Scan]`,
              offset: s.start,
              size: s.end - s.start,
              details: `Kích thước: ${(s.end - s.start).toLocaleString()} bytes • Vùng: ${s.type || 'Phần thân'}`
            });
          }
        });
      }
      setStructureType(result.type !== 'Unknown' ? result.type : (analysis?.fileType || 'Unknown'));
      setStructures(mergedList);
    } catch (err) {
      console.error('Failed parsing templates:', err);
    } finally {
      setIsParsingStructures(false);
    }
  };

  // Check for unsaved local backups (Session Recovery - Upgrades item 12)
  const checkSessionRecovery = () => {
    const saved = localStorage.getItem(sessionKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setShowSessionRecovery(true);
        }
      } catch (e) {
        console.error('Unsaved session verification error:', e);
      }
    }
  };

  const backupSessionToLocal = (patchesList: any[]) => {
    if (patchesList.length > 0) {
      localStorage.setItem(sessionKey, JSON.stringify(patchesList));
    } else {
      localStorage.removeItem(sessionKey);
    }
  };

  const handleRestoreSession = async () => {
    const saved = localStorage.getItem(sessionKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const restoredHistory: HistoryEntry[] = parsed.map((p: any) => ({
        offset: p.offset,
        oldValue: p.oldValue,
        newValue: p.newValue,
        type: 'edit',
        timestamp: p.timestamp || Date.now()
      }));

      setHistory(restoredHistory);
      applyHistoryToPatches(restoredHistory, restoredHistory.length - 1);
      setShowSessionRecovery(false);

      setTimeout(() => {
        fetchWindowData(windowStartRow);
        loadHashesAndEntropy();
        loadStructures();
        syncWorkspaceData();
      }, 50);
    } catch (e) {
      console.error('Failed to restore session:', e);
    }
  };

  // Jump to explicit offset address
  const scrollToOffset = (offset: number) => {
    if (offset < 0 || offset >= virtualFileSize) return;
    const targetRow = Math.floor(offset / itemsPerRow);
    const targetScrollTop = targetRow * ROW_HEIGHT;

    if (containerRef.current) {
      containerRef.current.scrollTop = targetScrollTop;
    }
    setScrollTop(targetScrollTop);
    setSelectedOffset(offset);
    onSelectOffset?.(offset);

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

  // Commit single byte edit to-disk
  const handleByteEdit = async (offset: number, valueStr: string) => {
    const val = parseInt(valueStr, 16);
    if (isNaN(val) || val < 0 || val > 255) return;

    const targetRow = Math.floor(offset / itemsPerRow);
    let oldValue = 0;

    const loadedData = loadedDataRef.current;
    const loadedStartRow = loadedStartRowRef.current;
    if (loadedData && targetRow >= loadedStartRow && targetRow < loadedStartRow + 100) {
      const dataIdx = (targetRow - loadedStartRow) * itemsPerRow + (offset % itemsPerRow);
      if (dataIdx < loadedData.length) {
        oldValue = loadedData[dataIdx];
      }
    } else {
      const orig = await readAndPatchChunk(file, offset, 1, patches, virtualFileSize);
      oldValue = orig.length > 0 ? orig[0] : 0;
    }

    if (oldValue === val) return;

    // Update active cache immediately
    if (loadedData && targetRow >= loadedStartRow && targetRow < loadedStartRow + 100) {
      const dataIdx = (targetRow - loadedStartRow) * itemsPerRow + (offset % itemsPerRow);
      if (dataIdx < loadedData.length) {
        loadedData[dataIdx] = val;
      }
    }

    const newEntry: HistoryEntry = {
      offset,
      oldValue,
      newValue: val,
      type: 'edit',
      timestamp: Date.now()
    };

    const newHistory = history.slice(0, historyIndex + 1).concat(newEntry);
    setHistory(newHistory);
    applyHistoryToPatches(newHistory, newHistory.length - 1);

    setVersion(v => v + 1);
    triggerHashesAndEntropy();
    syncWorkspaceData();

    if (offset === selectedOffset) {
      setEditValue(val.toString(16).toUpperCase().padStart(2, '0'));
    }

    if (auth.currentUser) {
      incrementStat(auth.currentUser.uid, 'hexEdits');
    }
  };

  const handleUndo = async () => {
    if (historyIndex < 0) return;
    const nextIndex = historyIndex - 1;
    applyHistoryToPatches(history, nextIndex);
    setTimeout(() => {
      fetchWindowData(windowStartRow);
      triggerHashesAndEntropy();
      syncWorkspaceData();
    }, 50);
  };

  const handleRedo = async () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    applyHistoryToPatches(history, nextIndex);
    setTimeout(() => {
      fetchWindowData(windowStartRow);
      triggerHashesAndEntropy();
      syncWorkspaceData();
    }, 50);
  };

  const handleTogglePatch = async (offset: number) => {
    setServerPatches(prev => {
      const updated = prev.map(p => p.offset === offset ? { ...p, disabled: !p.disabled } : p);
      const newPatches = new Map<number, number>();
      updated.forEach(p => {
        if (!p.disabled) {
          newPatches.set(p.offset, p.newValue);
        }
      });
      setPatches(newPatches);
      setTimeout(() => {
        fetchWindowData(windowStartRow);
        triggerHashesAndEntropy();
        syncWorkspaceData();
      }, 50);
      return updated;
    });
  };

  const syncWorkspaceData = async () => {
    if (onDataChange) {
      const sliceLimit = Math.min(5 * 1024 * 1024, virtualFileSize);
      const chunk = await readAndPatchChunk(file, 0, sliceLimit, patches, virtualFileSize);
      onDataChange(chunk);
    }
  };


  // Search Engine call - Upgrades item 4
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    try {
      const matches = await searchLocalFile(file, searchType, searchQuery, patches, virtualFileSize);
      setSearchResults(matches);
      if (matches.length > 0) {
        setSearchCurrentIndex(0);
        scrollToOffset(matches[0]);
      } else {
        setSearchCurrentIndex(-1);
        toast('Không tìm thấy chuỗi phù hợp!', 'warning');
      }
    } catch (err: any) {
      toast(err.message || 'Tìm kiếm thất bại', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Replace Engine call - Upgrades item 5
  const handleReplace = async () => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    try {
      let replaceBytes: Uint8Array;
      if (searchType === 'hex') {
        const cleanHex = replaceQuery.replace(/\s+/g, '');
        if (cleanHex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(cleanHex)) {
          throw new Error('Chuỗi Hex thay thế không hợp lệ');
        }
        const bytes = [];
        for (let i = 0; i < cleanHex.length; i += 2) {
          bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
        }
        replaceBytes = new Uint8Array(bytes);
      } else if (searchType === 'ascii' || searchType === 'utf8') {
        replaceBytes = new TextEncoder().encode(replaceQuery);
      } else if (searchType === 'utf16') {
        const bytes = new Uint8Array(replaceQuery.length * 2);
        for (let i = 0; i < replaceQuery.length; i++) {
          const code = replaceQuery.charCodeAt(i);
          bytes[i * 2] = code & 0xFF;
          bytes[i * 2 + 1] = (code >> 8) & 0xFF;
        }
        replaceBytes = bytes;
      } else {
        throw new Error('Định dạng không hỗ trợ');
      }

      const matches = await searchLocalFile(file, searchType, searchQuery, patches, virtualFileSize);
      if (matches.length === 0) {
        toast('Không tìm thấy chuỗi phù hợp để thay thế.', 'warning');
        return;
      }

      let targets = [...matches];
      if (replaceMode === 'single') {
        const exactMatch = matches.find(m => m === selectedOffset);
        targets = exactMatch !== undefined ? [exactMatch] : [matches[0]];
      }

      const newHistory = [...history.slice(0, historyIndex + 1)];
      for (const startOffset of targets) {
        for (let i = 0; i < replaceBytes.length; i++) {
          const curOffset = startOffset + i;
          const origChunk = await readAndPatchChunk(file, curOffset, 1, patches, virtualFileSize);
          const oldValue = origChunk.length > 0 ? origChunk[0] : 0;
          newHistory.push({
            offset: curOffset,
            oldValue,
            newValue: replaceBytes[i],
            type: 'replace',
            timestamp: Date.now()
          });
        }
      }

      setHistory(newHistory);
      applyHistoryToPatches(newHistory, newHistory.length - 1);
      
      toast(`Đã thay thế thành công ${targets.length} vị trí.`, 'success');
      fetchWindowData(windowStartRow);
      triggerHashesAndEntropy();
      setSearchResults([]);
      setSearchCurrentIndex(-1);
      syncWorkspaceData();
    } catch (err: any) {
      toast(err.message || 'Thay thế thất bại', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextSearchMatch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (searchCurrentIndex + 1) % searchResults.length;
    setSearchCurrentIndex(nextIdx);
    scrollToOffset(searchResults[nextIdx]);
  };

  const handlePrevSearchMatch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (searchCurrentIndex - 1 + searchResults.length) % searchResults.length;
    setSearchCurrentIndex(prevIdx);
    scrollToOffset(searchResults[prevIdx]);
  };

  // Bookmark Offset actions - Upgrades item 6
  const handleAddBookmark = () => {
    const offsetToBook = selectedOffset !== null ? selectedOffset : parseInt(bookmarkOffset, 16);
    if (isNaN(offsetToBook) || offsetToBook < 0 || offsetToBook >= virtualFileSize) {
      toast('Vui lòng nhập offset hợp lệ (dạng số Hex, ví dụ: 1A0).', 'error');
      return;
    }
    const title = bookmarkTitle.trim() || `Bookmark 0x${offsetToBook.toString(16).toUpperCase()}`;
    setBookmarks(prev => {
      const updated = [...prev, { offset: offsetToBook, title }];
      localStorage.setItem(`hex_bookmarks_${file.name}_${file.size}`, JSON.stringify(updated));
      return updated;
    });
    setBookmarkTitle('');
    setBookmarkOffset('');
  };

  const handleDeleteBookmark = (offset: number) => {
    setBookmarks(prev => {
      const updated = prev.filter(b => b.offset !== offset);
      localStorage.setItem(`hex_bookmarks_${file.name}_${file.size}`, JSON.stringify(updated));
      return updated;
    });
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

    if (isNaN(offset) || offset < 0 || offset >= virtualFileSize) {
      toast(`Vị trí offset không hợp lệ! Vui lòng chọn từ 0 đến ${virtualFileSize - 1}`, 'error');
      return;
    }
    scrollToOffset(offset);
    setJumpInput('');
  };

  const handleDownload = async () => {
    setIsLoading(true);
    try {
      const suffix = "_edited" + (file.name.match(/\.[^/.]+$/)?.[0] || "");
      const outputFilename = file.name.replace(/\.[^/.]+$/, "") + suffix;
      await downloadPatchedFileStream(file, patches, virtualFileSize, outputFilename);
      toast("Đã xuất file thành công!", "success");
    } catch (err) {
      console.error("Download failed:", err);
      toast("Xuất file thất bại", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPatches = () => {
    if (serverPatches.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(serverPatches, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${file.name}_patches.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const activeByteVal = useMemo(() => {
    if (selectedOffset === null) return 0;
    return parseInt(editValue || '00', 16) || 0;
  }, [selectedOffset, editValue, version]);

  // Synchronize bottom panel inputs with selected byte
  useEffect(() => {
    if (selectedOffset !== null) {
      const hex = activeByteVal.toString(16).toUpperCase().padStart(2, '0');
      setPanelHexInput(hex);
      setPanelDecInput(activeByteVal.toString());
      setPanelCharInput(activeByteVal >= 32 && activeByteVal <= 126 ? String.fromCharCode(activeByteVal) : '');
    } else {
      setPanelHexInput('');
      setPanelDecInput('');
      setPanelCharInput('');
    }
  }, [selectedOffset, activeByteVal]);

  const getByteClass = (offset: number, byteVal: number | null, isSelected: boolean, isPatched: boolean) => {
    if (byteVal === null) return 'text-white/10';
    if (isSelected) return 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold ring-2 ring-purple-400 z-10 scale-115 animate-pulse';
    if (isPatched) return 'border border-emerald-500/50 text-emerald-300 font-extrabold bg-emerald-950/20';
    
    const isZero = byteVal === 0;

    if (analysis) {
      if (analysis.embeddedItems && analysis.embeddedItems.length > 0) {
        const isEmbed = analysis.embeddedItems.some((item: any) => offset >= item.offset && offset < item.offset + (item.size || 0));
        if (isEmbed) {
          return 'bg-lime-500/10 text-lime-300 border border-lime-500/20 hover:bg-lime-500/20 font-bold';
        }
      }

      if (analysis.structure && analysis.structure.length > 0) {
        const match = analysis.structure.find((s: any) => offset >= s.start && offset < s.end);
        if (match) {
          const nameLower = match.name.toLowerCase();
          if (match.type === 'header') {
            return 'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 font-bold';
          }
          if (match.type === 'metadata') {
            return 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 font-bold';
          }
          if (match.type === 'footer') {
            return 'bg-pink-500/15 text-pink-300 border border-pink-500/30 hover:bg-pink-500/25 font-bold';
          }
          if (nameLower.includes('damaged') || nameLower.includes('corrupt') || nameLower.includes('broken')) {
            return 'bg-orange-500/20 text-orange-400 border border-orange-500/40 animate-pulse font-bold';
          }
          if (nameLower.includes('image') || nameLower.includes('png') || nameLower.includes('jpeg')) {
            return 'bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 font-bold';
          }
          if (nameLower.includes('audio') || nameLower.includes('mp3') || nameLower.includes('wav')) {
            return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 font-bold';
          }
          if (nameLower.includes('video') || nameLower.includes('mp4') || nameLower.includes('avi')) {
            return 'bg-teal-500/15 text-teal-300 border border-teal-500/30 hover:bg-teal-500/25 font-bold';
          }
          if (nameLower.includes('compress') || nameLower.includes('zip') || nameLower.includes('zlib') || nameLower.includes('pack')) {
            return 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 font-bold';
          }
          if (nameLower.includes('encrypt') || nameLower.includes('crypt')) {
            return 'bg-violet-500/20 text-violet-300 border border-violet-500/40 hover:bg-violet-500/30 font-bold';
          }
          return 'bg-slate-500/15 text-slate-300 border border-slate-500/30 hover:bg-slate-500/25 font-bold';
        }
      }

      if (analysis.strings && analysis.strings.length > 0) {
        const isStr = analysis.strings.some((s: any) => offset >= s.offset && offset < s.offset + s.length);
        if (isStr) {
          return 'bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 font-bold';
        }
      }
    }

    return isZero 
      ? 'text-white/25 hover:text-white/80 hover:bg-white/10' 
      : 'text-white/85 hover:text-white hover:bg-purple-500/10';
  };

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      {/* 12. Session Recovery Banner */}
      {showSessionRecovery && (
        <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-b border-purple-500/30 p-3 px-6 flex items-center justify-between z-30 shrink-0">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-5 h-5 text-purple-400 animate-pulse shrink-0" />
            <div>
              <p className="text-xs font-semibold text-white">Khôi phục phiên làm việc trước đó</p>
              <p className="text-[10px] text-white/60">Phát hiện dữ liệu chỉnh sửa chưa được lưu của tệp "{file.name}" trong trình duyệt này.</p>
            </div>
          </div>
          <div className="flex space-x-2 shrink-0">
            <button 
              onClick={() => {
                localStorage.removeItem(sessionKey);
                setShowSessionRecovery(false);
              }}
              className="px-2.5 py-1 text-[10px] font-medium text-white/50 hover:text-white rounded-lg transition-colors"
            >
              Bỏ qua
            </button>
            <button 
              onClick={handleRestoreSession}
              className="px-3 py-1 bg-purple-600 text-white text-[10px] font-semibold rounded-lg hover:bg-purple-500 transition-colors shadow"
            >
              Khôi phục ngay
            </button>
          </div>
        </div>
      )}

      {/* Top Toolbar - Premium Pill layout */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-3.5 px-4 border-b border-white/5 shrink-0 bg-[#09090b]/40  gap-4">
        <div className="hidden sm:flex items-center space-x-3.5">
          <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="max-w-[200px] md:max-w-xs">
            <h2 className="font-semibold text-white truncate text-xs sm:text-sm">{file.name}</h2>
            <p className="text-[10px] text-white/40 font-mono tracking-wide">{file.size.toLocaleString()} bytes</p>
          </div>
        </div>
        
        {/* Scrollable container of pill buttons */}
        <div className="flex items-center space-x-2.5 overflow-x-auto hide-scrollbar shrink-0 w-full md:w-auto py-1">
          {/* Offset Jump Box */}
          <form onSubmit={handleJumpSubmit} className="flex items-center space-x-1.5 bg-white/[0.03] border border-white/10 rounded-full px-2.5 py-1 shrink-0">
            <span className="text-white/45 text-[10px] font-mono tracking-wider font-semibold">0x:</span>
            <input
              type="text"
              placeholder="1A0..."
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              className="w-20 bg-transparent text-white text-xs font-mono outline-none border-none p-0 focus:ring-0"
            />
            <button
              type="submit"
              className="p-1 bg-purple-500/20 text-purple-400 hover:bg-purple-600 hover:text-white rounded-full transition-all"
            >
              <Navigation className="w-3 h-3 transform rotate-45" />
            </button>
          </form>

          {/* Undo pill */}
          <button
            onClick={handleUndo}
            disabled={historyIndex < 0}
            className="flex items-center px-3.5 py-1.5 text-xs font-semibold text-white/75 bg-white/5 border border-white/5 rounded-full hover:bg-white/10 hover:text-white disabled:opacity-20 transition-all shrink-0"
          >
            <Undo className="w-3.5 h-3.5 mr-1 text-purple-400" />
            <span>Undo</span>
          </button>

          {/* Redo pill */}
          <button
            onClick={handleRedo}
            disabled={historyIndex >= historyLength - 1}
            className="flex items-center px-3.5 py-1.5 text-xs font-semibold text-white/75 bg-white/5 border border-white/5 rounded-full hover:bg-white/10 hover:text-white disabled:opacity-20 transition-all shrink-0"
          >
            <ArrowRight className="w-3.5 h-3.5 mr-1 text-purple-400" />
            <span>Redo</span>
          </button>

          {/* Show/Hide Tools pill */}
          <button
            onClick={() => setShowToolsPanel(!showToolsPanel)}
            className={`flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-all shrink-0 ${
              showToolsPanel 
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 ' 
                : 'bg-white/5 text-white/75 border-white/5 hover:bg-white/10'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 mr-1" />
            <span>{showToolsPanel ? 'Ẩn công cụ' : 'Hiện công cụ'}</span>
          </button>

          {/* Export File pill */}
          <button
            onClick={handleDownload}
            disabled={isLoading}
            className="flex items-center px-4 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 transition-all shrink-0 shadow-lg shadow-purple-600/20"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
            <span>Xuất File</span>
          </button>
        </div>
      </div>

      {/* Main Dual-Column Content */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden relative p-2 lg:p-4 gap-4">
        
        {/* Left Column: Virtual Scroll Grid */}
        <div className="flex-1 overflow-hidden flex flex-col relative bg-[#0d111a]/80  rounded-2xl border border-white/5">
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

          {/* Viewport container with Virtualized DOM */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto custom-scrollbar relative"
          >
            {/* Height-spacer */}
            <div style={{ height: `${scrollHeight}px`, width: '100%', pointerEvents: 'none' }} />

            {/* Virtualized view bounds overlay */}
            <div className="absolute top-0 left-0 w-full pointer-events-auto select-none" style={{ height: `${scrollHeight}px` }}>
              {Array.from({ length: 100 }).map((_, i) => {
                const rowIndex = windowStartRow + i;
                if (rowIndex >= totalRows) return <div key={i} className="hidden" />;

                const rowStartOffset = rowIndex * itemsPerRow;
                const top = rowIndex * ROW_HEIGHT;

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
                    key={i} // Static DOM node index is preserved to enforce virtual node reuse
                    style={{
                      position: 'absolute',
                      top: `${top}px`,
                      left: 0,
                      width: '100%',
                      height: `${ROW_HEIGHT}px`,
                    }}
                    className="flex items-center text-xs font-mono hover:bg-white/5 px-4 border-b border-white/[0.02]"
                  >
                    {/* Offset Address column */}
                    <div className="w-24 text-white/40 select-none">
                      {rowStartOffset.toString(16).padStart(8, '0').toUpperCase()}
                    </div>

                    {/* Hex block values */}
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

                        // Check if this offset is currently patched
                        const activePatch = serverPatches.find(p => p.offset === offset);
                        const isPatched = activePatch && !activePatch.disabled;

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
                              className="bg-purple-600 text-white font-mono font-bold text-xs text-center border-none rounded shadow-xl focus:outline-none focus:ring-1 focus:ring-purple-300 w-6 h-5 z-10"
                            />
                          );
                        }

                        return (
                          <span
                            key={c}
                            onMouseDown={() => {
                              if (byteVal === null) return;
                              longPressTimeoutRef.current = setTimeout(() => {
                                setMiniSheetOffset(offset);
                                setMiniSheetByteValue(byteVal);
                                setIsMiniSheetOpen(true);
                                if (navigator.vibrate) navigator.vibrate(35);
                              }, 500);
                            }}
                            onTouchStart={() => {
                              if (byteVal === null) return;
                              longPressTimeoutRef.current = setTimeout(() => {
                                setMiniSheetOffset(offset);
                                setMiniSheetByteValue(byteVal);
                                setIsMiniSheetOpen(true);
                                if (navigator.vibrate) navigator.vibrate(35);
                              }, 500);
                            }}
                            onMouseUp={() => {
                              if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
                            }}
                            onTouchEnd={() => {
                              if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
                            }}
                            onMouseLeave={() => {
                              if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
                            }}
                            onClick={() => {
                              if (byteVal === null) return;
                              onSelectOffset?.(offset);
                              setSelectedOffset(offset);
                              setEditValue(hexStr);
                              setMiniSheetOffset(offset);
                              setMiniSheetByteValue(byteVal);
                              if (navigator.vibrate) navigator.vibrate(10);
                            }}
                            className={`cursor-pointer px-0.5 rounded transition-all text-center select-all inline-block w-[21px] relative group text-xs font-mono ${getByteClass(offset, byteVal, isSelected, isPatched)}`}
                          >
                            {hexStr}
                            {isPatched && !isSelected && (
                              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-purple-400 " />
                            )}
                          </span>
                        );
                      })}
                    </div>

                    {/* ASCII printable values block */}
                    <div className="w-32 shrink-0 pl-6 border-l border-white/5 ml-4 hidden md:flex space-x-0.5 select-all">
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

                        const activePatch = serverPatches.find(p => p.offset === offset);
                        const isPatched = activePatch && !activePatch.disabled;

                        return (
                          <span
                            key={c}
                            onClick={() => {
                              if (byteVal === null) return;
                              const hexStr = byteVal.toString(16).toUpperCase().padStart(2, '0');
                              onSelectOffset?.(offset);
                              setSelectedOffset(offset);
                              setEditValue(hexStr);
                              setMiniSheetOffset(offset);
                              setMiniSheetByteValue(byteVal);
                              if (navigator.vibrate) navigator.vibrate(10);
                            }}
                            className={`w-[10px] text-center rounded transition-all text-xs font-mono cursor-pointer
                              ${isSelected ? 'text-purple-300 font-bold bg-purple-500/30 scale-110 ' : ''}
                              ${isPatched && !isSelected ? 'bg-emerald-950/30 text-emerald-300 font-bold border border-emerald-500/30' : ''}
                              ${!isSelected && !isPatched && byteVal !== null ? (isZero ? 'text-white/15' : 'text-white/55 hover:text-white hover:bg-white/5') : ''}
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

            {/* Micro loader */}
            {isLoading && (
              <div className="absolute top-4 right-4 bg-[#121827]/90 text-white rounded-full px-3 py-1 flex items-center space-x-2 text-[10px] border border-purple-500/20 shadow-lg z-30 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                <span>Đang đọc...</span>
              </div>
            )}

            {/* Immersive loader card */}
            {!loadedDataRef.current && isLoading && (
              <div className="absolute inset-0 bg-[#0d111a]/60 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 select-none pointer-events-none">
                <div className="bg-[#121827]/95 border border-purple-500/30 rounded-xl px-6 py-4 flex flex-col items-center space-y-3 shadow-2xl">
                  <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                  <span className="text-sm font-medium text-white/95">Đang đồng bộ dữ liệu từ server...</span>
                  <span className="text-[10px] text-white/40 font-mono">Offset: 0x{(windowStartRow * itemsPerRow).toString(16).toUpperCase()}</span>
                </div>
              </div>
            )}
          </div>

          {/* Inline Bit-level Editor */}
          {selectedOffset !== null && (
            <div className="bg-[#121827]/95 border-t border-white/10 p-4 space-y-4 shrink-0 z-10">
              {/* Header with Title and Value Indicators */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-white flex items-center">
                    <CheckCircle className="w-4 h-4 text-emerald-400 mr-2 animate-pulse" />
                    BẢNG ĐIỀU KHIỂN & CHỈNH SỬA BIT
                  </span>
                  <span className="text-[10px] text-purple-400 font-mono bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    Offset: 0x{selectedOffset.toString(16).toUpperCase()}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Dec: {selectedOffset}
                  </span>
                </div>

                {/* Values Decoders */}
                <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                  <div className="bg-white/5 px-2 py-1 rounded border border-white/5 text-white/70">
                    Hex: <span className="text-purple-400 font-bold">0x{activeByteVal.toString(16).toUpperCase().padStart(2, '0')}</span>
                  </div>
                  <div className="bg-white/5 px-2 py-1 rounded border border-white/5 text-white/70">
                    Unsigned: <span className="text-blue-400 font-bold">{activeByteVal}</span>
                  </div>
                  <div className="bg-white/5 px-2 py-1 rounded border border-white/5 text-white/70">
                    Signed: <span className="text-amber-400 font-bold">{activeByteVal > 127 ? activeByteVal - 256 : activeByteVal}</span>
                  </div>
                  <div className="bg-white/5 px-2 py-1 rounded border border-white/5 text-white/70">
                    Octal: <span className="text-teal-400 font-bold">0{activeByteVal.toString(8)}</span>
                  </div>
                  <div className="bg-white/5 px-2 py-1 rounded border border-white/5 text-white/70">
                    ASCII: <span className="text-pink-400 font-bold">{activeByteVal >= 32 && activeByteVal <= 126 ? `'${String.fromCharCode(activeByteVal)}'` : 'N/A'}</span>
                  </div>
                  <div className="bg-white/5 px-2 py-1 rounded border border-white/5 text-white/70 flex items-center">
                    Bin: <span className="text-indigo-400 font-bold ml-1">{activeByteVal.toString(2).padStart(8, '0').slice(0, 4)}</span>
                    <span className="text-white/30 mx-0.5">.</span>
                    <span className="text-indigo-400 font-bold">{activeByteVal.toString(2).padStart(8, '0').slice(4, 8)}</span>
                  </div>
                </div>
              </div>

              {/* Direct Value Editor Form */}
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-[11px] uppercase tracking-wider font-bold text-white/50">Sửa đổi giá trị byte nhanh (Quick Value Editor)</h4>
                  <p className="text-[10px] text-white/40">Nhập trực tiếp giá trị mới ở một trong các định dạng dưới đây và nhấn Áp Dụng.</p>
                </div>
                
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col space-y-1">
                    <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono">Hex (00-FF)</span>
                    <input
                      type="text"
                      value={panelHexInput}
                      maxLength={2}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                        setPanelHexInput(val);
                        const parsed = parseInt(val, 16);
                        if (!isNaN(parsed) && parsed >= 0 && parsed <= 255) {
                          setPanelDecInput(parsed.toString());
                          setPanelCharInput(parsed >= 32 && parsed <= 126 ? String.fromCharCode(parsed) : '');
                        } else {
                          setPanelDecInput('');
                          setPanelCharInput('');
                        }
                      }}
                      placeholder="FF"
                      className="w-16 h-8.5 bg-black/40 border border-white/10 rounded-xl text-center font-mono font-bold text-xs text-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                    />
                  </div>

                  <div className="flex flex-col space-y-1">
                    <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono">Dec (0-255)</span>
                    <input
                      type="text"
                      value={panelDecInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setPanelDecInput(val);
                        const parsed = parseInt(val, 10);
                        if (!isNaN(parsed) && parsed >= 0 && parsed <= 255) {
                          setPanelHexInput(parsed.toString(16).toUpperCase().padStart(2, '0'));
                          setPanelCharInput(parsed >= 32 && parsed <= 126 ? String.fromCharCode(parsed) : '');
                        } else {
                          setPanelHexInput('');
                          setPanelCharInput('');
                        }
                      }}
                      placeholder="255"
                      className="w-20 h-8.5 bg-black/40 border border-white/10 rounded-xl text-center font-mono font-bold text-xs text-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>

                  <div className="flex flex-col space-y-1">
                    <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono">Ký tự (Char)</span>
                    <input
                      type="text"
                      value={panelCharInput}
                      maxLength={1}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPanelCharInput(val);
                        if (val.length === 1) {
                          const code = val.charCodeAt(0);
                          setPanelHexInput(code.toString(16).toUpperCase().padStart(2, '0'));
                          setPanelDecInput(code.toString());
                        } else {
                          setPanelHexInput('');
                          setPanelDecInput('');
                        }
                      }}
                      placeholder="A"
                      className="w-16 h-8.5 bg-black/40 border border-white/10 rounded-xl text-center font-mono font-bold text-xs text-pink-300 focus:outline-none focus:ring-1 focus:ring-pink-500/50"
                    />
                  </div>

                  <button
                    onClick={() => {
                      if (!panelHexInput) return;
                      const valStr = panelHexInput.padStart(2, '0');
                      handleByteEdit(selectedOffset!, valStr);
                      toast('✓ Đã cập nhật giá trị byte thành công!', 'success');
                      if (navigator.vibrate) navigator.vibrate([20, 20]);
                    }}
                    disabled={!panelHexInput || panelHexInput.length === 0}
                    className="h-8.5 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/15 flex items-center space-x-1 cursor-pointer shrink-0 animate-fadeIn"
                  >
                    <span>Áp dụng</span>
                  </button>
                </div>
              </div>

              {/* Bit Toggles + Quick Operations Row */}
              <div className="flex flex-col xl:flex-row gap-4 items-center justify-between">
                
                {/* 8-Bit Interactive Grid */}
                <div className="flex flex-col space-y-1.5 w-full xl:w-auto">
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-white/40">Giao diện nhị phân (Click các bit để đảo)</span>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                    {Array.from({ length: 8 }).map((_, bitIndex) => {
                      const shift = 7 - bitIndex;
                      const bitVal = (activeByteVal >> shift) & 1;
                      const weight = Math.pow(2, shift);
                      return (
                        <div key={bitIndex} className="flex flex-col items-center">
                          <span className="text-[8px] text-white/30 font-mono mb-0.5 select-none">{weight}</span>
                          <button
                            onClick={() => {
                              const newByte = activeByteVal ^ (1 << shift);
                              const hexStr = newByte.toString(16).toUpperCase().padStart(2, '0');
                              setEditValue(hexStr);
                              handleByteEdit(selectedOffset!, hexStr);
                            }}
                            className={`w-9 h-9 rounded-lg text-sm font-mono font-bold transition-all border flex flex-col items-center justify-center relative shadow-md ${
                              bitVal 
                                ? 'bg-gradient-to-b from-purple-500 to-indigo-600 border-purple-400 text-white shadow-purple-500/20' 
                                : 'bg-black/40 border-white/10 text-white/40 hover:bg-white/5 hover:text-white/80'
                            }`}
                          >
                            <span>{bitVal}</span>
                            <span className="absolute bottom-0.5 text-[7px] opacity-40 font-mono">b{shift}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick actions for bit manipulations */}
                <div className="flex flex-col space-y-1.5 w-full xl:w-auto">
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-white/40">Các phép toán logic Bit nhanh (Quick Bit Actions)</span>
                  <div className="flex flex-wrap gap-2 w-full justify-start sm:justify-start">
                    <button
                      onClick={() => {
                        const newByte = (~activeByteVal) & 0xFF;
                        const hexStr = newByte.toString(16).toUpperCase().padStart(2, '0');
                        setEditValue(hexStr);
                        handleByteEdit(selectedOffset!, hexStr);
                      }}
                      className="px-2.5 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/40 text-purple-300 rounded-lg text-xs font-semibold font-mono transition-all flex items-center"
                      title="Nghịch đảo toàn bộ 8 bit (NOT operation)"
                    >
                      NOT (Đảo)
                    </button>
                    <button
                      onClick={() => {
                        const newByte = 0x00;
                        const hexStr = newByte.toString(16).toUpperCase().padStart(2, '0');
                        setEditValue(hexStr);
                        handleByteEdit(selectedOffset!, hexStr);
                      }}
                      className="px-2.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40 text-rose-300 rounded-lg text-xs font-semibold font-mono transition-all flex items-center"
                      title="Đặt giá trị bằng 0x00"
                    >
                      CLEAR (AND 0)
                    </button>
                    <button
                      onClick={() => {
                        const newByte = 0xFF;
                        const hexStr = newByte.toString(16).toUpperCase().padStart(2, '0');
                        setEditValue(hexStr);
                        handleByteEdit(selectedOffset!, hexStr);
                      }}
                      className="px-2.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-semibold font-mono transition-all flex items-center"
                      title="Đặt giá trị bằng 0xFF (Tất cả bit bằng 1)"
                    >
                      FILL (OR FF)
                    </button>
                    <button
                      onClick={() => {
                        const newByte = (activeByteVal << 1) & 0xFF;
                        const hexStr = newByte.toString(16).toUpperCase().padStart(2, '0');
                        setEditValue(hexStr);
                        handleByteEdit(selectedOffset!, hexStr);
                      }}
                      className="px-2.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold font-mono transition-all flex items-center"
                      title="Dịch trái bit 1 vị trí (Nhân 2)"
                    >
                      SHL (&lt;&lt; 1)
                    </button>
                    <button
                      onClick={() => {
                        const newByte = activeByteVal >> 1;
                        const hexStr = newByte.toString(16).toUpperCase().padStart(2, '0');
                        setEditValue(hexStr);
                        handleByteEdit(selectedOffset!, hexStr);
                      }}
                      className="px-2.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold font-mono transition-all flex items-center"
                      title="Dịch phải bit 1 vị trí (Chia 2)"
                    >
                      SHR (&gt;&gt; 1)
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Footnotes bar */}
          <div className="p-3 border-t border-white/10 bg-black/30 flex items-center justify-between shrink-0 text-[10px] text-white/40">
            <div>
              Vùng hiển thị: <span className="font-mono font-semibold text-purple-400">0x{(startRow * itemsPerRow).toString(16).toUpperCase()}</span> - <span className="font-mono font-semibold text-purple-400">0x{Math.min(file.size, endRow * itemsPerRow).toString(16).toUpperCase()}</span>
            </div>
            <div>
              Kích thước: <span className="font-semibold text-white/60">{file.size.toLocaleString()} bytes</span>
            </div>
          </div>
        </div>

        {/* Right Column: Sliding Tool Dock */}
        {showToolsPanel && (
          <div className="w-full xl:w-[400px] bg-[#0d111a]/85 border border-white/5 rounded-2xl flex flex-col overflow-hidden shrink-0 shadow-2xl h-[420px] xl:h-auto">
            {/* Panel Tabs */}
            <div className="flex border-b border-white/5 bg-black/20 text-white/50 shrink-0 overflow-x-auto hide-scrollbar">
              <button 
                onClick={() => setActiveToolTab('search')}
                className={`px-3 py-3 text-[11px] font-semibold flex items-center justify-center border-b-2 transition-all shrink-0 ${
                  activeToolTab === 'search' ? 'border-purple-500 text-white bg-white/5' : 'border-transparent hover:text-white'
                }`}
              >
                <Search className="w-3 h-3 mr-1" />
                Tìm/Sửa
              </button>
              <button 
                onClick={() => {
                  setActiveToolTab('structures');
                  loadStructures();
                }}
                className={`px-3 py-3 text-[11px] font-semibold flex items-center justify-center border-b-2 transition-all shrink-0 ${
                  activeToolTab === 'structures' ? 'border-purple-500 text-white bg-white/5' : 'border-transparent hover:text-white'
                }`}
              >
                <Layers className="w-3 h-3 mr-1" />
                Cấu trúc
              </button>
              <button 
                onClick={() => {
                  setActiveToolTab('history');
                  loadHistoryAndPatches();
                }}
                className={`px-3 py-3 text-[11px] font-semibold flex items-center justify-center border-b-2 transition-all shrink-0 ${
                  activeToolTab === 'history' ? 'border-purple-500 text-white bg-white/5' : 'border-transparent hover:text-white'
                }`}
              >
                <History className="w-3 h-3 mr-1" />
                Patches
              </button>
              <button 
                onClick={() => {
                  setActiveToolTab('checksums');
                  loadHashesAndEntropy();
                }}
                className={`px-3 py-3 text-[11px] font-semibold flex items-center justify-center border-b-2 transition-all shrink-0 ${
                  activeToolTab === 'checksums' ? 'border-purple-500 text-white bg-white/5' : 'border-transparent hover:text-white'
                }`}
              >
                <Activity className="w-3 h-3 mr-1" />
                Phân tích
              </button>
              <button 
                onClick={() => {
                  setActiveToolTab('beginner' as any);
                }}
                className={`px-3 py-3 text-[11px] font-semibold flex items-center justify-center border-b-2 transition-all shrink-0 ${
                  (activeToolTab as string) === 'beginner' ? 'border-pink-500 text-white bg-white/5 font-bold' : 'border-transparent hover:text-white'
                }`}
              >
                <Sparkles className="w-3 h-3 mr-1 text-pink-400" />
                Nhập môn
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              
              {/* TAB 1: Search & Replace (Upgrades item 4, 5) */}
              {activeToolTab === 'search' && (
                <div className="space-y-4">
                  <div className="bg-purple-500/5 p-3 rounded-xl border border-purple-500/10 text-xs text-purple-300 leading-relaxed">
                    <Sparkles className="w-4 h-4 mr-1.5 inline" />
                    <strong>Streaming Search Engine:</strong> Tìm kiếm và thay thế byte quy mô lớn trực tiếp trên file server. Không lặp RAM client.
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-white/50 mb-1.5">Chuỗi cần tìm</label>
                    <input 
                      type="text" 
                      placeholder={searchType === 'hex' ? 'FF 00 AA hoặc FF00' : 'Chuỗi chữ (ASCII / UTF8)'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white font-mono text-xs outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] uppercase tracking-wider font-semibold text-white/50 mb-1.5">Mã hóa</label>
                      <select 
                        value={searchType}
                        onChange={(e: any) => setSearchType(e.target.value)}
                        className="w-full px-2 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs outline-none"
                      >
                        <option value="hex">Hexadecimal</option>
                        <option value="ascii">ASCII</option>
                        <option value="utf8">UTF-8</option>
                        <option value="utf16">UTF-16 (LE)</option>
                      </select>
                    </div>

                    <div className="flex-1">
                      <label className="block text-[10px] uppercase tracking-wider font-semibold text-white/50 mb-1.5">Thế bởi (Hex/Chữ)</label>
                      <input 
                        type="text" 
                        placeholder={searchType === 'hex' ? '00 hoặc AA' : 'Chuỗi thế'}
                        value={replaceQuery}
                        onChange={(e) => setReplaceQuery(e.target.value)}
                        className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white font-mono text-xs outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0 pt-1">
                    <button 
                      onClick={handleSearch}
                      disabled={isLoading || !searchQuery}
                      className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center space-x-1"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Tìm kiếm</span>
                    </button>

                    <button 
                      onClick={handleReplace}
                      disabled={isLoading || !searchQuery || !replaceQuery}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center space-x-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Thay thế</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/5 pt-3">
                    <span className="text-[10px] text-white/40">Chế độ thay thế:</span>
                    <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/5 text-xs">
                      <button 
                        onClick={() => setReplaceMode('single')}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${replaceMode === 'single' ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white'}`}
                      >
                        Từng con
                      </button>
                      <button 
                        onClick={() => setReplaceMode('all')}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${replaceMode === 'all' ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white'}`}
                      >
                        Tất cả
                      </button>
                    </div>
                  </div>

                  {/* Search Results list */}
                  {searchResults.length > 0 && (
                    <div className="border-t border-white/5 pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400">Kết quả ({searchResults.length})</span>
                        <div className="flex items-center space-x-2">
                          <button onClick={handlePrevSearchMatch} className="p-1 bg-white/5 rounded hover:bg-white/10 text-white">
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                          <span className="text-[10px] text-white/60 font-mono">{searchCurrentIndex + 1}/{searchResults.length}</span>
                          <button onClick={handleNextSearchMatch} className="p-1 bg-white/5 rounded hover:bg-white/10 text-white">
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                        {searchResults.slice(0, 30).map((mOffset, idx) => (
                          <button 
                            key={idx}
                            onClick={() => {
                              setSearchCurrentIndex(idx);
                              scrollToOffset(mOffset);
                            }}
                            className={`px-2 py-1 text-[10px] font-mono rounded text-left border transition-all ${
                              searchCurrentIndex === idx 
                                ? 'bg-purple-600/30 border-purple-500 text-purple-300' 
                                : 'bg-black/20 border-white/5 text-white/50 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            0x{mOffset.toString(16).toUpperCase()}
                          </button>
                        ))}
                      </div>
                      {searchResults.length > 30 && <p className="text-[9px] text-white/30 text-center">Hiển thị tối đa 30 kết quả đầu tiên.</p>}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Template Parser & Bookmarks (Upgrades item 6, 10) */}
              {activeToolTab === 'structures' && (
                <div className="space-y-4">
                  {/* Bookmarks manager */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-white/40 flex items-center">
                      <Bookmark className="w-3.5 h-3.5 mr-1 text-purple-400" />
                      Đánh dấu vị trí (Bookmarks)
                    </h4>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Tiêu đề..." 
                        value={bookmarkTitle}
                        onChange={(e) => setBookmarkTitle(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 bg-black/20 border border-white/10 rounded-lg text-white text-xs outline-none"
                      />
                      <input 
                        type="text" 
                        placeholder={selectedOffset !== null ? `0x${selectedOffset.toString(16).toUpperCase()}` : 'Offset (Hex)'}
                        value={bookmarkOffset}
                        onChange={(e) => setBookmarkOffset(e.target.value)}
                        className="w-24 px-2.5 py-1.5 bg-black/20 border border-white/10 rounded-lg text-white text-xs font-mono outline-none"
                      />
                      <button 
                        onClick={handleAddBookmark}
                        className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg"
                      >
                        Lưu
                      </button>
                    </div>

                    {bookmarks.length > 0 && (
                      <div className="max-h-36 overflow-y-auto border border-white/5 rounded-xl bg-black/20 divide-y divide-white/5 custom-scrollbar">
                        {bookmarks.map((bm, index) => (
                          <div key={index} className="flex items-center justify-between p-2 hover:bg-white/5">
                            <button 
                              onClick={() => scrollToOffset(bm.offset)}
                              className="flex-1 text-left"
                            >
                              <p className="text-xs font-medium text-white/90 truncate">{bm.title}</p>
                              <p className="text-[9px] text-purple-400 font-mono">0x{bm.offset.toString(16).toUpperCase()}</p>
                            </button>
                            <button 
                              onClick={() => handleDeleteBookmark(bm.offset)}
                              className="p-1 text-white/30 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Template Parser Node Display */}
                  <div className="border-t border-white/5 pt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] uppercase tracking-wider font-bold text-white/40 flex items-center">
                        <Layers className="w-3.5 h-3.5 mr-1 text-purple-400" />
                        Trình phân tích cấu trúc
                      </h4>
                      <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded font-mono font-bold">
                        {structureType}
                      </span>
                    </div>

                    {isParsingStructures ? (
                      <div className="flex items-center justify-center p-6 text-white/40 text-xs">
                        <Loader2 className="w-4 h-4 animate-spin text-purple-400 mr-2" />
                        <span>Đang đọc đầu tệp cấu trúc...</span>
                      </div>
                    ) : structures.length === 0 ? (
                      <p className="text-xs text-white/30 leading-relaxed text-center p-4">Không phát hiện tệp cấu trúc đặc trưng (PNG, ZIP, PDF, ELF, EXE, MP3) trong 128KB đầu tiên.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar border border-white/5 bg-black/20 rounded-xl p-2 divide-y divide-white/5">
                        {structures.map((node, idx) => (
                          <button 
                            key={idx}
                            onClick={() => scrollToOffset(node.offset)}
                            className="w-full text-left py-2 hover:bg-white/5 flex items-center justify-between text-xs"
                          >
                            <div>
                              <p className="font-semibold text-white/90 font-mono">{node.name}</p>
                              {node.details && <p className="text-[10px] text-white/40">{node.details}</p>}
                            </div>
                            <div className="text-right font-mono text-[10px] text-purple-400">
                              0x{node.offset.toString(16).toUpperCase()}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: Patches & History (Upgrades item 7, 8) */}
              {activeToolTab === 'history' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-white/40">Patch Storage & History</h4>
                    <button 
                      onClick={handleExportPatches}
                      disabled={serverPatches.length === 0}
                      className="text-[10px] font-semibold text-purple-400 hover:text-purple-300 disabled:opacity-30 flex items-center"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Xuất Patches (.json)
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="bg-black/20 p-2.5 rounded-xl border border-white/5">
                      <span className="block text-[9px] text-white/40 uppercase mb-1">Tổng sửa đổi</span>
                      <span className="font-semibold text-white font-mono text-base">{serverPatches.length}</span>
                    </div>
                    <div className="bg-black/20 p-2.5 rounded-xl border border-white/5">
                      <span className="block text-[9px] text-white/40 uppercase mb-1">Điểm Pointer</span>
                      <span className="font-semibold text-white font-mono text-base">{historyIndex + 1}/{historyLength}</span>
                    </div>
                  </div>

                  {/* Patch Table / Diff display */}
                  {serverPatches.length === 0 ? (
                    <div className="p-8 text-center text-white/30 text-xs">
                      Chưa ghi nhận byte chỉnh sửa nào.
                    </div>
                  ) : (
                    <div className="border border-white/5 rounded-xl overflow-hidden divide-y divide-white/5 bg-black/20 text-xs max-h-60 overflow-y-auto custom-scrollbar">
                      {serverPatches.map((patch, idx) => (
                        <div key={idx} className={`flex items-center justify-between p-2.5 hover:bg-white/5 ${patch.disabled ? 'opacity-40' : ''}`}>
                          <div className="flex items-center space-x-3">
                            <input 
                              type="checkbox" 
                              checked={!patch.disabled}
                              onChange={() => handleTogglePatch(patch.offset)}
                              className="accent-purple-600 rounded cursor-pointer"
                              title="Bật/Tắt Patch tạm thời"
                            />
                            <div>
                              <p className="font-mono font-semibold text-white">0x{patch.offset.toString(16).toUpperCase()}</p>
                              <p className="text-[10px] text-white/40">Timestamp: {new Date(patch.timestamp).toLocaleTimeString('vi-VN')}</p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 font-mono text-xs">
                            <span className="text-white/40 line-through">
                              {patch.oldValue.toString(16).padStart(2, '0').toUpperCase()}
                            </span>
                            <ChevronRight className="w-3 h-3 text-white/30" />
                            <span className="text-green-400 font-bold">
                              {patch.newValue.toString(16).padStart(2, '0').toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: Hashes & Entropy (Upgrades item 9, 11) */}
              {activeToolTab === 'checksums' && (
                <div className="space-y-4">
                  {/* Hashes / Checksums */}
                  <div className="space-y-2.5">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-white/40 flex items-center justify-between">
                      <span>Live Hashes & Checksums</span>
                      {isHashesLoading && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
                    </h4>

                    {hashes && (
                      <div className="space-y-1.5 font-mono text-[10px] text-white/80 bg-black/30 border border-white/5 p-3 rounded-xl">
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-white/40 uppercase">CRC32:</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-purple-300 font-bold">{hashes.crc32}</span>
                            <button onClick={() => { navigator.clipboard.writeText(hashes.crc32); toast('Đã sao chép CRC32!', 'success'); }} className="text-white/20 hover:text-white"><Copy className="w-3 h-3" /></button>
                          </div>
                        </div>
                        <div className="flex justify-between items-start py-0.5 border-t border-white/[0.03] pt-1.5">
                          <span className="text-white/40 uppercase">MD5:</span>
                          <div className="flex items-center space-x-1.5 max-w-[200px]">
                            <span className="truncate text-blue-300 font-semibold">{hashes.md5}</span>
                            <button onClick={() => { navigator.clipboard.writeText(hashes.md5); toast('Đã sao chép MD5!', 'success'); }} className="text-white/20 hover:text-white shrink-0"><Copy className="w-3 h-3" /></button>
                          </div>
                        </div>
                        <div className="flex justify-between items-start py-0.5 border-t border-white/[0.03] pt-1.5">
                          <span className="text-white/40 uppercase">SHA-1:</span>
                          <div className="flex items-center space-x-1.5 max-w-[200px]">
                            <span className="truncate text-green-300 font-semibold">{hashes.sha1}</span>
                            <button onClick={() => { navigator.clipboard.writeText(hashes.sha1); toast('Đã sao chép SHA-1!', 'success'); }} className="text-white/20 hover:text-white shrink-0"><Copy className="w-3 h-3" /></button>
                          </div>
                        </div>
                        <div className="flex justify-between items-start py-0.5 border-t border-white/[0.03] pt-1.5">
                          <span className="text-white/40 uppercase text-xs">SHA-256:</span>
                          <div className="flex items-center space-x-1.5 max-w-[200px]">
                            <span className="truncate text-yellow-300 font-bold">{hashes.sha256}</span>
                            <button onClick={() => { navigator.clipboard.writeText(hashes.sha256); toast('Đã sao chép SHA-256!', 'success'); }} className="text-white/20 hover:text-white shrink-0"><Copy className="w-3 h-3" /></button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Shannon Entropy area chart */}
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-white/40 flex items-center justify-between">
                      <span>Shannon Entropy Map (64 blocks)</span>
                      {isEntropyLoading && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
                    </h4>

                    {entropyData.length > 0 && (
                      <div className="h-44 w-full bg-black/40 border border-white/5 rounded-xl p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={entropyData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                            <defs>
                              <linearGradient id="entropyColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="block" stroke="#ffffff20" fontSize={8} />
                            <YAxis domain={[0, 8]} stroke="#ffffff20" fontSize={8} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#121827f0', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '10px' }}
                              labelStyle={{ color: '#a855f7', fontWeight: 'bold' }}
                            />
                            <Area type="monotone" dataKey="entropy" name="Entropy" stroke="#a855f7" strokeWidth={1.5} fillOpacity={1} fill="url(#entropyColor)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <p className="text-[9px] text-white/30 text-center leading-relaxed">Vùng biểu đồ cao (gần 8.0) đại diện cho tệp nén/mã hóa. Vùng thấp (gần 0) đại diện cho khối dữ liệu trống hoặc chuỗi byte rỗng (padding).</p>
                  </div>
                </div>
              )}

              {/* TAB 5: Beginner Mode (Nhập môn) */}
              {(activeToolTab as string) === 'beginner' && (
                <div className="space-y-4 text-xs">
                  <div className="bg-pink-500/5 p-3 rounded-xl border border-pink-500/15 text-xs text-pink-300 leading-relaxed space-y-1.5 animate-fadeIn">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-pink-400 animate-pulse shrink-0" />
                      <strong className="font-bold">Trợ Lý Nhập Môn WebHexed 🌸</strong>
                    </div>
                    <p>Chào mừng bạn! WebHexed biến dữ liệu nhị phân khô khan thành biểu đồ trực quan, giúp người mới cũng có thể đọc hiểu và sửa tệp dễ dàng.</p>
                  </div>

                  {/* Byte Detail Inspector */}
                  <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-3">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-white/50">Chi Tiết Byte Được Chọn</h4>
                    {miniSheetOffset !== null ? (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Địa chỉ (Offset):</span>
                          <span className="font-mono text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded">
                            0x{miniSheetOffset.toString(16).toUpperCase()} ({miniSheetOffset.toLocaleString()})
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Giá trị Hexadecimal:</span>
                          <span className="font-mono text-green-400 font-bold">
                            {(miniSheetByteValue ?? 0).toString(16).toUpperCase().padStart(2, '0')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Hệ Thập phân (Decimal):</span>
                          <span className="font-mono text-blue-400 font-bold">
                            {miniSheetByteValue ?? 0}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Nhị phân (Binary):</span>
                          <span className="font-mono text-yellow-400">
                            {(miniSheetByteValue ?? 0).toString(2).padStart(8, '0')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Ký tự ASCII:</span>
                          <span className="font-mono text-pink-300 font-bold bg-pink-500/10 px-2 py-0.5 rounded">
                            {(miniSheetByteValue ?? 0) >= 32 && (miniSheetByteValue ?? 0) <= 126 ? String.fromCharCode(miniSheetByteValue ?? 0) : 'Ký tự ẩn / Điều khiển'}
                          </span>
                        </div>

                        {/* Smart Suggestion for current offset */}
                        <div className="border-t border-white/5 pt-2.5 mt-1 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-white/40 block">💡 Gợi Ý Chỉnh Sửa An Toàn:</span>
                          {(() => {
                            if (analysis) {
                              const match = analysis.structure?.find((s: any) => miniSheetOffset >= s.start && miniSheetOffset < s.end);
                              if (match) {
                                if (match.type === 'header') {
                                  return (
                                    <p className="text-red-400 text-[11px] leading-relaxed">
                                      ⚠️ <strong>Cảnh Báo Header:</strong> Byte này thuộc File Header định dạng ({match.name}). Sửa đổi có thể làm hỏng tệp, khiến hệ điều hành không thể mở được nữa!
                                    </p>
                                  );
                                }
                                if (match.type === 'metadata') {
                                  return (
                                    <p className="text-amber-400 text-[11px] leading-relaxed">
                                      ℹ️ <strong>Thông tin metadata:</strong> Đây là siêu dữ liệu đi kèm. Sửa ở đây để đổi thông số ghi chú, bản quyền, ngày tạo mà không hại cấu trúc tệp.
                                    </p>
                                  );
                                }
                              }

                              const isStr = analysis.strings?.some((s: any) => miniSheetOffset >= s.offset && miniSheetOffset < s.offset + s.length);
                              if (isStr) {
                                return (
                                  <p className="text-blue-300 text-[11px] leading-relaxed">
                                    ✅ <strong>Vùng Chuỗi Chữ (String):</strong> Byte này nằm trong một từ/chuỗi ký tự hiển thị. Bạn có thể sửa đổi thoải mái để đổi chữ hoặc đoạn text trong tệp!
                                  </p>
                                );
                              }
                            }
                            return (
                              <p className="text-white/55 text-[11px] leading-relaxed">
                                Byte này thuộc phần thân dữ liệu thô (payload). Việc sửa có thể làm thay đổi nhẹ nội dung tệp (như điểm ảnh, âm thanh) nhưng không làm sập định dạng.
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-white/30 text-center py-4">Nhấp vào một byte bất kỳ trong bảng Hex bên trái để xem phân tích chi tiết và gợi ý an toàn.</p>
                    )}
                  </div>

                  {/* Cheat sheet dictionary */}
                  <div className="bg-black/20 border border-white/5 rounded-xl p-3 space-y-2">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-pink-400 font-semibold">Thuật Ngữ Nhập Môn</h4>
                    <div className="space-y-2 divide-y divide-white/[0.03] text-[11px]">
                      <div className="pt-1.5">
                        <strong className="text-white font-semibold">1. Hex (Hexadecimal) là gì?</strong>
                        <p className="text-white/50 leading-relaxed">Là hệ đếm cơ số 16 (0-9 và A-F). Mỗi byte gồm 2 ký tự Hex (ví dụ: <code>FF</code> = 255). Máy tính dùng Hex để rút ngắn mã nhị phân dài dòng.</p>
                      </div>
                      <div className="pt-2">
                        <strong className="text-white font-semibold">2. Offset (Địa chỉ) là gì?</strong>
                        <p className="text-white/50 leading-relaxed">Là số thứ tự định vị byte trong tệp. Ví dụ offset <code>0x00000010</code> nghĩa là byte thứ 16 tính từ đầu tệp.</p>
                      </div>
                      <div className="pt-2">
                        <strong className="text-white font-semibold">3. ASCII là gì?</strong>
                        <p className="text-white/50 leading-relaxed">Là bảng quy chuẩn dịch các con số byte thành ký tự chữ đọc được bằng mắt người (A, B, C, @, ...).</p>
                      </div>
                      <div className="pt-2">
                        <strong className="text-white font-semibold">4. Cấu trúc File (Magic Bytes)</strong>
                        <p className="text-white/50 leading-relaxed">Vài byte đầu tệp xác định loại file. Ví dụ tệp PNG luôn bắt đầu bằng <code>89 50 4E 47</code>. Đổi byte này sẽ khiến file đổi dạng thô.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Toolbar (Collapsible Panel) */}
      <div className="lg:hidden shrink-0 p-3 bg-[#121827] border-t border-white/10 flex items-center gap-2 z-20">
        <form onSubmit={handleJumpSubmit} className="flex-1 flex items-center space-x-1">
          <input
            type="text"
            placeholder="Tìm offset..."
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs font-mono outline-none"
          />
        </form>
        <button
          onClick={handleUndo}
          disabled={historyIndex < 0}
          className="px-3 py-2 text-xs font-medium text-white/70 bg-white/5 border border-white/10 rounded-lg disabled:opacity-40"
        >
          Undo
        </button>
        <button
          onClick={() => setShowToolsPanel(!showToolsPanel)}
          className="px-3 py-2 text-xs font-medium text-white/70 bg-white/5 border border-white/10 rounded-lg"
        >
          Công cụ
        </button>
        <button
          onClick={handleDownload}
          disabled={isLoading}
          className="px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Xuất'}
        </button>
      </div>

      <MiniHexEditorSheet
        isOpen={isMiniSheetOpen}
        onClose={() => setIsMiniSheetOpen(false)}
        offset={miniSheetOffset}
        byteValue={miniSheetByteValue}
        onReplaceByte={(off, newVal) => {
          handleByteEdit(off, newVal.toString(16).padStart(2, '0').toUpperCase());
        }}
        onFillRange={(off, len, fillByte) => {
          const fillHex = fillByte.toString(16).padStart(2, '0').toUpperCase();
          for (let k = 0; k < len; k++) {
            if (off + k < virtualFileSize) {
              handleByteEdit(off + k, fillHex);
            }
          }
          toast(`Đã lấp đầy ${len} byte từ offset 0x${off.toString(16).toUpperCase()}`, 'success');
        }}
        onAddBookmark={(off, bTitle) => {
          setBookmarks(prev => {
            const next = [{ offset: off, title: bTitle }, ...prev];
            localStorage.setItem(`hex_bookmarks_${file.name}_${file.size}`, JSON.stringify(next));
            return next;
          });
        }}
      />
    </div>
  );
}
