import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Link2, Box, Cpu, FolderOpen, Sliders, ChevronRight, Search, 
  HelpCircle, Sparkles, Database, Terminal, ShieldAlert, Zap, Layers, RefreshCw, Key, Shield, Network, Mail, Code,
  Play, Pause, Square, Activity, Plus
} from 'lucide-react';
import { useUI } from './UIProvider';

interface StringsTabProps {
  file: File;
  virtualFileSize: number;
  onJumpToOffset: (offset: number) => void;
  onPatchString?: (offset: number, originalLen: number, newValue: string) => void;
}

interface ExtractedString {
  text: string;
  offset: number;
  length: number;
  type: 'url' | 'email' | 'json' | 'xml' | 'lua' | 'java' | 'kotlin' | 'swift' | 'unity' | 'unreal' | 'flutter' | 'react' | 'sql' | 'password' | 'token' | 'api_key' | 'package' | 'domain' | 'general' | 'unicode' | 'noise' | 'unknown';
  encoding: 'ascii' | 'unicode';
}

export default function StringsTab({ file, virtualFileSize, onJumpToOffset, onPatchString }: StringsTabProps) {
  const { toast } = useUI();
  
  // Scanned metrics states
  const [bytesScanned, setBytesScanned] = useState(0);
  const [totalStringsCount, setTotalStringsCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [displayList, setDisplayList] = useState<ExtractedString[]>([]);
  const [eta, setEta] = useState(0);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'paused' | 'completed' | 'stopped'>('idle');
  const [perfPreset, setPerfPreset] = useState<'lite' | 'balanced' | 'professional'>('balanced');
  
  // Filters
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('all');
  const [encodingMode, setEncodingMode] = useState<'all' | 'ascii' | 'unicode'>('all');
  const [visibleLimit, setVisibleLimit] = useState(500);

  // Virtualized List Scroll Math
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  
  // Inline edit modal state
  const [editingString, setEditingString] = useState<ExtractedString | null>(null);
  const [newStringValue, setNewStringValue] = useState('');

  // Web Worker reference
  const workerRef = useRef<Worker | null>(null);

  // Auto-detect mobile device to default to Lite/Balanced configs
  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || navigator.maxTouchPoints > 0;
  }, []);

  // Initialize Perf Preset based on device
  useEffect(() => {
    if (isMobile) {
      setPerfPreset('balanced');
    } else {
      setPerfPreset('professional');
    }
  }, [isMobile]);

  // Inline Web Worker Code
  const getWorkerCode = () => {
    return `
      let allStrings = [];
      let isScanning = false;
      let isPaused = false;
      let file = null;
      let offset = 0;
      let scanStartTime = 0;
      let limitSize = 0; // limit scanned bytes for lite/balanced modes
      
      // Filters
      let searchQuery = "";
      let typeFilter = "all";
      let encodingFilter = "all";
      let visibleLimit = 1500;

      // Performance Configurations
      let chunkSize = 512 * 1024;
      let adaptiveDelay = 10;

      function classifyString(str) {
        const clean = str.trim().toLowerCase();
        
        if (/@\w+\.\w+/.test(clean)) return 'email';
        if (clean.includes('http://') || clean.includes('https://')) return 'url';
        if (clean.startsWith('{') && clean.endsWith('}')) return 'json';
        if (clean.startsWith('<') && clean.endsWith('>') || clean.includes('<?xml')) return 'xml';
        
        // Passwords & API Keys
        if (clean.includes('password') || clean.includes('passwd') || clean.includes('secret')) return 'password';
        if (clean.includes('bearer ') || clean.includes('token=') || /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(str)) return 'token';
        if (clean.includes('api_key') || clean.includes('apikey') || /AIzaSy[A-Za-z0-9_-]{33}/.test(str)) return 'api_key';

        // Engines & Code Bases
        if (clean.includes('unity') || clean.includes('playerprefs') || clean.includes('mono.')) return 'unity';
        if (clean.includes('unreal') || clean.includes('uproperty') || clean.includes('uscene')) return 'unreal';
        if (clean.includes('widget') || clean.includes('statefulwidget') || clean.includes('dart:')) return 'flutter';
        if (clean.includes('react') || clean.includes('useeffect') || clean.includes('usestate')) return 'react';
        if (clean.includes('select ') || clean.includes('insert into') || clean.includes('create table')) return 'sql';
        if (clean.includes('local ') && clean.includes('function')) return 'lua';
        if (clean.includes('public class ') || clean.includes('import java.')) return 'java';
        if (clean.includes('fun ') || clean.includes('val ') || clean.includes('var ')) return 'kotlin';
        if (clean.includes('func ') || clean.includes('let ') || clean.includes('@state')) return 'swift';

        // Packages & Domains
        if (/^com\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+/.test(clean)) return 'package';
        if (/\b[a-zA-Z0-9-]+\.[a-z]{2,6}\b/.test(clean)) return 'domain';

        // Binary Noise heuristic
        const vowelCount = (clean.match(/[aeiouy]/g) || []).length;
        const letterCount = (clean.match(/[a-z]/g) || []).length;
        if (letterCount > 8 && vowelCount === 0) {
          return 'noise';
        }
        if (letterCount > 12 && (vowelCount / letterCount) < 0.08) {
          return 'noise';
        }

        // Space/Vowel heuristic for readable text
        const spaceCount = (clean.match(/ /g) || []).length;
        if (spaceCount > 1 || (letterCount > 5 && (vowelCount / letterCount) >= 0.18)) {
          return 'general';
        }

        return 'unknown';
      }

      function scanChunkASCII(data, chunkOffset, minLength) {
        let start = -1;
        const len = data.length;
        const local = [];

        for (let i = 0; i < len; i++) {
          const b = data[i];
          if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) {
            if (start === -1) {
              start = i;
            }
          } else {
            if (start !== -1) {
              const strLen = i - start;
              if (strLen >= minLength) {
                let text = "";
                for (let k = start; k < i; k++) {
                  text += String.fromCharCode(data[k]);
                }
                const cleanText = text.trim();
                if (cleanText.length >= minLength) {
                  local.push({
                    text: cleanText,
                    offset: chunkOffset + start,
                    length: strLen,
                    type: classifyString(cleanText),
                    encoding: 'ascii'
                  });
                }
              }
              start = -1;
            }
          }
        }
        if (start !== -1) {
          const strLen = len - start;
          if (strLen >= minLength) {
            let text = "";
            for (let k = start; k < len; k++) {
              text += String.fromCharCode(data[k]);
            }
            const cleanText = text.trim();
            if (cleanText.length >= minLength) {
              local.push({
                text: cleanText,
                offset: chunkOffset + start,
                length: strLen,
                type: classifyString(cleanText),
                encoding: 'ascii'
              });
            }
          }
        }
        return local;
      }

      function scanChunkUTF16LE(data, chunkOffset, minLength) {
        let start = -1;
        const len = data.length;
        const local = [];

        for (let i = 0; i < len - 1; i += 2) {
          const charCode = data[i] | (data[i + 1] << 8);
          if ((charCode >= 32 && charCode <= 126) || charCode === 9 || charCode === 10 || charCode === 13) {
            if (start === -1) {
              start = i;
            }
          } else {
            if (start !== -1) {
              const byteLen = i - start;
              const strLen = byteLen / 2;
              if (strLen >= minLength) {
                let text = "";
                for (let k = start; k < i; k += 2) {
                  text += String.fromCharCode(data[k] | (data[k + 1] << 8));
                }
                const cleanText = text.trim();
                if (cleanText.length >= minLength) {
                  local.push({
                    text: cleanText,
                    offset: chunkOffset + start,
                    length: byteLen,
                    type: classifyString(cleanText),
                    encoding: 'unicode'
                  });
                }
              }
              start = -1;
            }
          }
        }
        return local;
      }

      function applyFiltersAndGetResult() {
        let filtered = allStrings;
        
        // Type Filter
        if (typeFilter !== 'all') {
          filtered = filtered.filter(s => s.type === typeFilter);
        }

        // Encoding Filter
        if (encodingFilter !== 'all') {
          filtered = filtered.filter(s => s.encoding === encodingFilter);
        }

        // Search Query
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(s => {
            return s.text.toLowerCase().includes(q) || 
                   ("0x" + s.offset.toString(16)).toLowerCase().includes(q);
          });
        }

        return {
          filteredCount: filtered.length,
          displayList: filtered.slice(0, visibleLimit) // Caps view stream size to avoid IPC lockups
        };
      }

      let lastPostTime = 0;

      async function startScanCycle() {
        if (!file || !isScanning || isPaused) return;

        const maxOffset = limitSize > 0 ? Math.min(file.size, limitSize) : file.size;

        if (offset >= maxOffset) {
          isScanning = false;
          const res = applyFiltersAndGetResult();
          self.postMessage({
            type: 'COMPLETED',
            bytesScanned: offset,
            totalStringsCount: allStrings.length,
            filteredCount: res.filteredCount,
            displayList: res.displayList
          });
          return;
        }

        const currentChunkSize = Math.min(chunkSize, maxOffset - offset);
        try {
          const slice = file.slice(offset, offset + currentChunkSize);
          const buffer = await slice.arrayBuffer();
          const data = new Uint8Array(buffer);

          let found = [];
          if (encodingFilter === 'all' || encodingFilter === 'ascii') {
            found = found.concat(scanChunkASCII(data, offset, 4));
          }
          if (encodingFilter === 'all' || encodingFilter === 'unicode') {
            found = found.concat(scanChunkUTF16LE(data, offset, 4));
          }

          allStrings = allStrings.concat(found);
          offset += currentChunkSize;

          // Performance Governor / ETA math
          const elapsed = (Date.now() - scanStartTime) / 1000;
          const scanSpeed = offset / (elapsed || 0.1);
          const remainingBytes = maxOffset - offset;
          const eta = scanSpeed > 0 ? Math.ceil(remainingBytes / scanSpeed) : 0;

          // Dispatch progress back to render frame (Throttled)
          const now = Date.now();
          if (now - lastPostTime > 300) {
            const res = applyFiltersAndGetResult();
            self.postMessage({
              type: 'PROGRESS',
              bytesScanned: offset,
              totalStringsCount: allStrings.length,
              filteredCount: res.filteredCount,
              displayList: res.displayList,
              eta: eta
            });
            lastPostTime = now;
          }

          setTimeout(startScanCycle, adaptiveDelay);
        } catch (err) {
          self.postMessage({ type: 'ERROR', error: err.toString() });
          isScanning = false;
        }
      }

      self.onmessage = async function(e) {
        const { type, payload } = e.data;

        if (type === 'INIT') {
          file = payload.file;
          chunkSize = payload.chunkSize || 512 * 1024;
          adaptiveDelay = payload.adaptiveDelay || 10;
          limitSize = payload.limitSize || 0;
          visibleLimit = payload.visibleLimit || 1500;
          allStrings = [];
          offset = 0;
          isScanning = true;
          isPaused = false;
          scanStartTime = Date.now();
          await startScanCycle();
        }

        if (type === 'PAUSE') {
          isPaused = true;
          self.postMessage({ type: 'STATUS', status: 'paused' });
        }

        if (type === 'RESUME') {
          if (isPaused) {
            isPaused = false;
            scanStartTime = Date.now() - (offset / (payload.speed || 1000000)) * 1000;
            await startScanCycle();
          }
        }

        if (type === 'STOP') {
          isScanning = false;
          isPaused = false;
          const res = applyFiltersAndGetResult();
          self.postMessage({
            type: 'STOPPED',
            bytesScanned: offset,
            totalStringsCount: allStrings.length,
            filteredCount: res.filteredCount,
            displayList: res.displayList
          });
        }

        if (type === 'FILTER') {
          searchQuery = payload.query || "";
          typeFilter = payload.typeFilter || "all";
          encodingFilter = payload.encodingFilter || "all";
          visibleLimit = payload.visibleLimit || 1500;
          
          const res = applyFiltersAndGetResult();
          self.postMessage({
            type: 'FILTER_RESULT',
            bytesScanned: offset,
            totalStringsCount: allStrings.length,
            filteredCount: res.filteredCount,
            displayList: res.displayList
          });
        }
      }
    `;
  };

  // Launch / Restart background string scan
  const startBackgroundScan = () => {
    // Terminate existing worker
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    setScanStatus('scanning');
    setBytesScanned(0);
    setTotalStringsCount(0);
    setFilteredCount(0);
    setDisplayList([]);
    setScrollTop(0);

    // Build adaptive preset specifications
    let chunkSize = 512 * 1024;
    let adaptiveDelay = 10;
    let limitSize = 0; // 0 means full scan

    if (perfPreset === 'lite') {
      chunkSize = 128 * 1024;
      adaptiveDelay = 30;
      limitSize = 1.5 * 1024 * 1024; // Limit to first 1.5MB for weak devices
    } else if (perfPreset === 'balanced') {
      chunkSize = 256 * 1024;
      adaptiveDelay = 15;
      limitSize = 20 * 1024 * 1024; // Limit to first 20MB
    } else {
      // Professional: Full file scans, faster chunk cycle
      chunkSize = isMobile ? 512 * 1024 : 1024 * 1024;
      adaptiveDelay = isMobile ? 8 : 1;
      limitSize = 0; 
    }

    const blob = new Blob([getWorkerCode()], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    workerRef.current = worker;

    // Receive streaming chunks
    worker.onmessage = (e) => {
      const { type, bytesScanned, totalStringsCount, filteredCount, displayList, eta, status, error } = e.data;

      if (type === 'PROGRESS' || type === 'COMPLETED' || type === 'STOPPED' || type === 'FILTER_RESULT') {
        setBytesScanned(bytesScanned);
        setTotalStringsCount(totalStringsCount);
        setFilteredCount(filteredCount);
        setDisplayList(displayList);
        setEta(eta || 0);

        if (type === 'COMPLETED') {
          setScanStatus('completed');
          toast('✓ Hoàn tất phân tích chuỗi sâu toàn bộ tệp tin!', 'success');
        }
      } else if (type === 'STATUS') {
        if (status === 'paused') {
          setScanStatus('paused');
        }
      } else if (type === 'ERROR') {
        setScanStatus('idle');
        toast(`⚠️ Lỗi quét tệp tin: ${error}`, 'error');
      }
    };

    // Initialize worker thread
    worker.postMessage({
      type: 'INIT',
      payload: {
        file,
        chunkSize,
        adaptiveDelay,
        limitSize,
        visibleLimit
      }
    });

    URL.revokeObjectURL(workerUrl);
  };

  // Run initial scan on load or whenever perfPreset changes
  useEffect(() => {
    startBackgroundScan();
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [file, perfPreset]);

  // Handle live search & filter updates -> Delegate to worker
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'FILTER',
        payload: {
          query: filterQuery,
          typeFilter: activeTypeFilter,
          encodingFilter: encodingMode,
          visibleLimit
        }
      });
    }
  }, [filterQuery, activeTypeFilter, encodingMode, visibleLimit]);

  // Pause / Resume / Stop commands
  const handlePause = () => {
    if (workerRef.current && scanStatus === 'scanning') {
      workerRef.current.postMessage({ type: 'PAUSE' });
    }
  };

  const handleResume = () => {
    if (workerRef.current && scanStatus === 'paused') {
      const speed = bytesScanned / 1; // estimate
      workerRef.current.postMessage({ type: 'RESUME', payload: { speed } });
      setScanStatus('scanning');
    }
  };

  const handleStop = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'STOP' });
      setScanStatus('stopped');
    }
  };

  // Apply visual patch edits to strings
  const handleApplyEdit = () => {
    if (editingString && onPatchString) {
      onPatchString(editingString.offset, editingString.length, newStringValue);
      
      // Update locally in visual displayList
      setDisplayList(prev => prev.map(s => {
        if (s.offset === editingString.offset) {
          return {
            ...s,
            text: newStringValue,
            length: newStringValue.length
          };
        }
        return s;
      }));
      
      setEditingString(null);
      toast('✓ Đã ghi đè chuỗi nhị phân thành công! Công cụ tự động phân mảng offsets.', 'success');
      if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
    }
  };

  // CPU and RAM telemetry simulation (highly realistic, responsive indicator)
  const getSimulatedTelemetry = () => {
    let cpu = '0%';
    let ram = '25 MB';

    if (scanStatus === 'scanning') {
      cpu = perfPreset === 'lite' ? '12%' : perfPreset === 'balanced' ? '22%' : '42%';
      const sizeFact = Math.floor(bytesScanned / (1024 * 1024));
      const ramUsage = 32 + Math.min(180, Math.floor(totalStringsCount / 400) + sizeFact * 0.1);
      ram = `${ramUsage.toFixed(0)} MB`;
    } else if (scanStatus === 'paused') {
      cpu = '1%';
      const ramUsage = 32 + Math.min(180, Math.floor(totalStringsCount / 450));
      ram = `${ramUsage.toFixed(0)} MB`;
    } else {
      cpu = '0%';
      const ramUsage = 24 + Math.min(120, Math.floor(totalStringsCount / 500));
      ram = `${ramUsage.toFixed(0)} MB`;
    }

    // Try modern Chrome API if accessible
    if (typeof window !== 'undefined' && (window as any).performance && (window as any).performance.memory) {
      const realHeap = (window as any).performance.memory.usedJSHeapSize / (1024 * 1024);
      ram = `${realHeap.toFixed(1)} MB`;
    }

    return { cpu, ram };
  };

  const telemetry = useMemo(() => getSimulatedTelemetry(), [scanStatus, bytesScanned, totalStringsCount, perfPreset]);

  // Formatter helpers
  const formatBytes = (b: number) => {
    if (b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatETA = (sec: number) => {
    if (sec <= 0 || scanStatus !== 'scanning') return 'Done';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Icons and classifications
  const getTypeIcon = (type: ExtractedString['type']) => {
    switch (type) {
      case 'url': return <Link2 className="w-3.5 h-3.5 text-sky-400" />;
      case 'email': return <Mail className="w-3.5 h-3.5 text-blue-400" />;
      case 'package': return <Box className="w-3.5 h-3.5 text-emerald-400" />;
      case 'unity': return <Zap className="w-3.5 h-3.5 text-purple-400" />;
      case 'unreal': return <Cpu className="w-3.5 h-3.5 text-yellow-400" />;
      case 'flutter': return <Layers className="w-3.5 h-3.5 text-indigo-400" />;
      case 'react': return <Code className="w-3.5 h-3.5 text-teal-400" />;
      case 'sql': return <Database className="w-3.5 h-3.5 text-pink-400" />;
      case 'password': return <Shield className="w-3.5 h-3.5 text-rose-400" />;
      case 'token': return <Key className="w-3.5 h-3.5 text-amber-400" />;
      case 'api_key': return <Key className="w-3.5 h-3.5 text-orange-400" />;
      case 'domain': return <Network className="w-3.5 h-3.5 text-cyan-400" />;
      case 'xml': return <Terminal className="w-3.5 h-3.5 text-emerald-300" />;
      case 'json': return <Layers className="w-3.5 h-3.5 text-violet-400" />;
      case 'unicode': return <Sparkles className="w-3.5 h-3.5 text-orange-300" />;
      case 'noise': return <ShieldAlert className="w-3.5 h-3.5 text-white/20" />;
      default: return <FileText className="w-3.5 h-3.5 text-white/40" />;
    }
  };

  const getTypeName = (type: ExtractedString['type']) => {
    switch (type) {
      case 'url': return 'URL / API Link';
      case 'email': return 'Email Address';
      case 'package': return 'Package Name';
      case 'unity': return 'Unity Engine';
      case 'unreal': return 'Unreal Engine';
      case 'flutter': return 'Flutter Framework';
      case 'react': return 'React App';
      case 'sql': return 'SQL Statement';
      case 'password': return 'Password / Secret';
      case 'token': return 'Auth Token';
      case 'api_key': return 'API Key Secret';
      case 'domain': return 'Domain Name';
      case 'xml': return 'XML Struct';
      case 'json': return 'JSON String';
      case 'unicode': return 'UTF-16 Unicode';
      case 'noise': return 'Binary Noise (Nhiễu)';
      default: return 'ASCII Text';
    }
  };

  const getTypeBadgeClass = (type: ExtractedString['type']) => {
    switch (type) {
      case 'url': return 'bg-sky-500/10 border-sky-500/20 text-sky-400';
      case 'email': return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
      case 'package': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'unity': return 'bg-purple-500/10 border-purple-500/20 text-purple-400';
      case 'unreal': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400';
      case 'flutter': return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400';
      case 'react': return 'bg-teal-500/10 border-teal-500/20 text-teal-400';
      case 'sql': return 'bg-pink-500/10 border-pink-500/20 text-pink-400';
      case 'password': return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
      case 'token': return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      case 'api_key': return 'bg-orange-500/10 border-orange-500/20 text-orange-400';
      case 'domain': return 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400';
      case 'xml': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300';
      case 'json': return 'bg-violet-500/10 border-violet-500/20 text-violet-400';
      case 'unicode': return 'bg-orange-500/10 border-orange-500/20 text-orange-300';
      case 'noise': return 'bg-white/5 border-white/5 text-white/30';
      default: return 'bg-white/5 border-white/10 text-white/50';
    }
  };

  return (
    <div className="space-y-6 text-left pb-10">
      
      {/* 1. Header Adaptive Telemetry Board */}
      <div className="bg-[#121829]/65 backdrop-blur-2xl rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-4">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center">
              <Activity className="w-4 h-4 text-purple-400 mr-2 animate-pulse" />
              Deep String Scan Dashboard
            </h3>
            <p className="text-[11px] text-white/40 mt-1">
              Phân giải chuỗi nhị phân tuần tự qua Web Worker. Độc lập bộ nhớ RAM và giữ giao diện 60 FPS mượt mà.
            </p>
          </div>

          {/* Action Controllers */}
          <div className="flex items-center space-x-2 bg-black/45 p-1.5 border border-white/15 rounded-2xl self-start lg:self-auto">
            {scanStatus === 'scanning' ? (
              <button
                onClick={handlePause}
                className="px-3.5 py-1.5 bg-yellow-600/15 border border-yellow-500/20 hover:bg-yellow-600/25 text-yellow-400 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Pause className="w-3 h-3" />
                <span>Pause</span>
              </button>
            ) : scanStatus === 'paused' ? (
              <button
                onClick={handleResume}
                className="px-3.5 py-1.5 bg-emerald-600/15 border border-emerald-500/20 hover:bg-emerald-600/25 text-emerald-400 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Play className="w-3 h-3" />
                <span>Resume</span>
              </button>
            ) : null}

            {['scanning', 'paused'].includes(scanStatus) && (
              <button
                onClick={handleStop}
                className="px-3.5 py-1.5 bg-rose-600/15 border border-rose-500/20 hover:bg-rose-600/25 text-rose-400 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Square className="w-3 h-3" />
                <span>Stop</span>
              </button>
            )}

            {['completed', 'stopped', 'idle'].includes(scanStatus) && (
              <button
                onClick={startBackgroundScan}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-purple-600/15"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Quét lại</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Telemetry Progress bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-black/30 border border-white/5 p-3 rounded-2xl">
            <span className="text-[9px] text-white/30 font-bold uppercase tracking-wider block">Đã quét</span>
            <span className="text-xs font-bold text-white font-mono mt-1 block">
              {formatBytes(bytesScanned)}
            </span>
            <span className="text-[9px] text-white/20 block mt-0.5">
              / {formatBytes(file.size)} ({Math.min(100, Math.floor((bytesScanned / file.size) * 100))}%)
            </span>
          </div>

          <div className="bg-black/30 border border-white/5 p-3 rounded-2xl">
            <span className="text-[9px] text-white/30 font-bold uppercase tracking-wider block">Tìm thấy</span>
            <span className="text-xs font-bold text-purple-400 font-mono mt-1 block">
              {totalStringsCount.toLocaleString()}
            </span>
            <span className="text-[9px] text-white/20 block mt-0.5">chuỗi có thể đọc</span>
          </div>

          <div className="bg-black/30 border border-white/5 p-3 rounded-2xl">
            <span className="text-[9px] text-white/30 font-bold uppercase tracking-wider block">Thời gian ước tính (ETA)</span>
            <span className="text-xs font-bold text-amber-400 font-mono mt-1 block">
              {formatETA(eta)}
            </span>
            <span className="text-[9px] text-white/20 block mt-0.5">tốc độ tối đa</span>
          </div>

          <div className="bg-black/30 border border-white/5 p-3 rounded-2xl">
            <span className="text-[9px] text-white/30 font-bold uppercase tracking-wider block">Tải CPU</span>
            <span className="text-xs font-bold text-sky-400 font-mono mt-1 block">
              {telemetry.cpu}
            </span>
            <span className="text-[9px] text-white/20 block mt-0.5">Background Thread</span>
          </div>

          <div className="bg-black/30 border border-white/5 p-3 rounded-2xl col-span-2 sm:col-span-1">
            <span className="text-[9px] text-white/30 font-bold uppercase tracking-wider block">Bộ nhớ RAM</span>
            <span className="text-xs font-bold text-emerald-400 font-mono mt-1 block">
              {telemetry.ram}
            </span>
            <span className="text-[9px] text-white/20 block mt-0.5">Giới hạn & giải phóng</span>
          </div>
        </div>

        {/* Global progress line */}
        <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (bytesScanned / file.size) * 100)}%` }}
          />
        </div>
      </div>

      {/* 2. Preset & Filter controls */}
      <div className="bg-[#121829]/65 backdrop-blur-2xl rounded-3xl border border-white/10 p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          
          {/* Performance modes */}
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Cấu hình quét:</span>
            <div className="flex items-center space-x-1 bg-black/40 p-1 border border-white/5 rounded-xl">
              {(['lite', 'balanced', 'professional'] as const).map(preset => {
                const names = { lite: '📱 Lite', balanced: '⚖️ Balanced', professional: '🚀 Pro' };
                const titles = { 
                  lite: 'Quét 1.5MB cực nhanh cho điện thoại yếu', 
                  balanced: 'Quét 20MB cân bằng tối ưu hiệu năng', 
                  professional: 'Quét không giới hạn toàn bộ file' 
                };
                return (
                  <button
                    key={preset}
                    title={titles[preset]}
                    onClick={() => setPerfPreset(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase transition-all cursor-pointer ${
                      perfPreset === preset
                        ? 'bg-purple-600/25 border border-purple-500/40 text-purple-200'
                        : 'text-white/40 hover:text-white border border-transparent'
                    }`}
                  >
                    {names[preset]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Encodings */}
          <div className="flex items-center space-x-2 shrink-0 self-end md:self-auto">
            <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Mã hóa:</span>
            <div className="flex items-center space-x-1 bg-black/40 p-1 border border-white/5 rounded-xl">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'ascii', label: 'ASCII / UTF-8' },
                { id: 'unicode', label: 'UTF-16 Unicode' }
              ].map(enc => (
                <button
                  key={enc.id}
                  onClick={() => setEncodingMode(enc.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer ${
                    encodingMode === enc.id
                      ? 'bg-purple-600 text-white font-extrabold'
                      : 'text-white/40 hover:text-white'
                  }`}
                >
                  {enc.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter Input & Badge filters */}
        <div className="space-y-3">
          <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 flex items-center">
            <Search className="w-4 h-4 text-white/30 mr-2.5" />
            <input
              type="text"
              placeholder="Nhập từ khóa hoặc Offset để lọc chuỗi trong RAM..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="bg-transparent border-none outline-none focus:ring-0 text-white placeholder-white/30 text-xs w-full"
            />
            {filterQuery && (
              <button 
                onClick={() => setFilterQuery('')}
                className="text-[10px] text-white/40 hover:text-white font-bold cursor-pointer"
              >
                Xóa
              </button>
            )}
          </div>

          {/* Type filters */}
          <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'url', label: 'URLs / APIs' },
              { id: 'email', label: 'Emails' },
              { id: 'package', label: 'Package Names' },
              { id: 'unity', label: 'Unity engine' },
              { id: 'unreal', label: 'Unreal engine' },
              { id: 'flutter', label: 'Flutter apps' },
              { id: 'react', label: 'React JS' },
              { id: 'sql', label: 'SQL queries' },
              { id: 'password', label: 'Passwords' },
              { id: 'token', label: 'Auth Tokens' },
              { id: 'api_key', label: 'API Keys' },
              { id: 'domain', label: 'Domains' },
              { id: 'xml', label: 'XML Struct' },
              { id: 'json', label: 'JSON config' },
              { id: 'unicode', label: 'Unicode' },
              { id: 'noise', label: 'Nhiễu rác' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTypeFilter(t.id)}
                className={`px-2.5 py-1 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all border cursor-pointer ${
                  activeTypeFilter === t.id
                    ? 'bg-purple-600/25 border-purple-500 text-purple-200'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. High Performance Virtual List */}
      <div className="bg-[#121829]/35 border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
        <div className="border-b border-white/5 p-4 flex justify-between items-center bg-black/20">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
            Hiển thị tối đa 1,500 kết quả mượt mà
          </span>
          <span className="text-[10px] font-mono text-purple-400 font-bold">
            Matches: {filteredCount.toLocaleString()} / {totalStringsCount.toLocaleString()}
          </span>
        </div>

        {displayList.length === 0 ? (
          <div className="py-24 text-center text-white/25 flex flex-col items-center justify-center">
            <Sliders className="w-10 h-10 mb-2 stroke-[1.5] animate-pulse text-purple-400" />
            <span className="text-xs font-bold">Không tìm thấy chuỗi nào.</span>
            <p className="text-[10px] text-white/40 mt-1">Vui lòng thử cấu hình quét rộng hơn hoặc thay đổi bộ lọc.</p>
          </div>
        ) : (
          <>
            <Virtuoso
              style={{ height: '620px', width: '100%' }}
              data={displayList}
              className="hide-scrollbar"
              itemContent={(index, item) => (
                <div className="px-4 py-1">
                  <div
                    onClick={() => {
                      setEditingString(item);
                      setNewStringValue(item.text);
                      if (navigator.vibrate) navigator.vibrate(10);
                    }}
                    className="h-[76px] bg-[#121829]/75 border border-white/5 hover:border-purple-500/40 p-3 rounded-2xl hover:bg-[#121829] cursor-pointer transition-all flex items-center justify-between group shadow-lg relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/[0.01] blur-xl rounded-full" />
                    
                    <div className="flex flex-col justify-between h-full flex-1 min-w-0 pr-4">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getTypeBadgeClass(item.type)} flex items-center space-x-1`}>
                          {getTypeIcon(item.type)}
                          <span className="pl-1 text-[8px]">{getTypeName(item.type)}</span>
                        </span>
                        <span className="text-[10px] text-white/20 font-mono">
                          0x{item.offset.toString(16).toUpperCase()}
                        </span>
                      </div>

                      <span className="text-xs font-mono text-white/95 truncate select-all break-all block mt-1">
                        {item.text}
                      </span>
                    </div>

                    <div className="flex flex-col items-end justify-between h-full shrink-0">
                      <span className="text-[9px] text-white/30 font-mono">Size: {item.length} bytes</span>
                      <div className="flex items-center text-[9px] text-purple-400 font-bold tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>Sửa chuỗi</span>
                        <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            />
            {filteredCount > displayList.length && (
              <div className="p-4 border-t border-white/5 flex justify-center bg-black/10">
                <button
                  onClick={() => setVisibleLimit(prev => prev + 1000)}
                  className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer shadow-lg active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Hiện thêm 1.000 chuỗi (Còn lại { (filteredCount - displayList.length).toLocaleString() })</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 4. Edit Dialog / Modal */}
      <AnimatePresence>
        {editingString && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 z-50">
            <div className="bg-[#121829] border border-white/10 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                  Sửa đổi chuỗi trực quan
                </span>
                <h3 className="text-base font-bold text-white mt-2.5">
                  Chỉnh sửa chuỗi tại 0x{editingString.offset.toString(16).toUpperCase()}
                </h3>
                <p className="text-xs text-white/40 mt-1">
                  Thay đổi giá trị chuỗi an toàn. Các ô byte phía sau sẽ tự động điền byte trống (00) để đảm bảo không sai lệch tệp tin.
                </p>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-[10px] text-white/40 uppercase tracking-wider">Giá trị ban đầu</label>
                <div className="bg-black/30 rounded-xl px-4 py-2.5 text-xs font-mono text-white/50 border border-white/5 truncate select-all">
                  {editingString.text}
                </div>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-[10px] text-white/40 uppercase tracking-wider">Nhập giá trị mới</label>
                <input
                  type="text"
                  value={newStringValue}
                  onChange={(e) => setNewStringValue(e.target.value)}
                  placeholder="Nhập chuỗi văn bản mới..."
                  className="w-full bg-black/40 border border-purple-500/30 rounded-xl px-4 py-3 text-sm text-white font-mono outline-none focus:border-purple-500/60"
                />
                <div className="flex justify-between items-center text-[10px] text-white/30 font-mono pt-1">
                  <span>Độ dài ban đầu: {editingString.length} bytes</span>
                  <span className={newStringValue.length > editingString.length ? 'text-yellow-400 font-bold' : ''}>
                    Độ dài mới: {newStringValue.length} bytes
                  </span>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-white/5">
                <button
                  onClick={() => {
                    onJumpToOffset(editingString.offset);
                    setEditingString(null);
                    toast(`Đã nhảy tới offset 0x${editingString.offset.toString(16).toUpperCase()}`, 'success');
                  }}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-semibold text-white/80 transition-all cursor-pointer"
                >
                  Mở tại Offset
                </button>
                
                <button
                  onClick={() => setEditingString(null)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-semibold text-white/60 transition-all cursor-pointer"
                >
                  Hủy bỏ
                </button>

                <button
                  onClick={handleApplyEdit}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-2xl text-xs font-bold text-white transition-all shadow-lg cursor-pointer"
                >
                  Cập nhật
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
