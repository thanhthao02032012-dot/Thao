import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Link2, Box, Cpu, FolderOpen, Sliders, ChevronRight, Search, 
  HelpCircle, Sparkles, Database, Terminal, ShieldAlert, Zap, Layers, RefreshCw, Key, Shield, Network, Mail, Code,
  Play, Pause, Square, Activity, Plus, Filter, Download, Info, Check, CornerDownRight, Tag, BookOpen, AlertCircle, Copy
} from 'lucide-react';
import { useUI } from './UIProvider';
import { AnalysisResult } from '../utils/fileAnalyzer';
import { StringsRegistry, RegistryStringEntry } from '../utils/stringsRegistry';

interface StringsTabProps {
  file: File;
  virtualFileSize: number;
  onJumpToOffset: (offset: number) => void;
  onPatchString?: (offset: number, originalLen: number, newValue: string) => void;
  analysis: AnalysisResult | null;
  isAnalyzing?: boolean;
  onNavigateTab?: (tab: string) => void;
  initialSearchQuery?: string;
}

function generateAIExplanation(value: string, category: string, confidence: number): string {
  const cleanVal = value.trim();
  const lower = cleanVal.toLowerCase();
  
  switch (category) {
    case 'Gameplay':
      return `Chuỗi này liên quan trực tiếp đến cơ chế Gameplay của phần mềm/trò chơi. Nhiều khả năng đây là biến lưu trữ thuộc tính nhân vật, thông số sinh tồn hoặc vật phẩm được nạp vào RAM khi vận hành.`;
    case 'Security':
      return `Phát hiện định dạng bảo mật nhạy cảm. Chuỗi này mang đặc tính của Khóa API bí mật, Mã khóa bí mật, Token phiên hoạt động JWT hoặc chuỗi mã hóa mật khẩu hệ thống.`;
    case 'Network':
      return `Đây là địa chỉ Endpoint máy chủ, cổng kết nối mạng hoặc giao thức mạng (HTTP/WS). Được sử dụng để truyền nhận dữ liệu thời gian thực giữa máy khách và máy chủ.`;
    case 'Database':
      return `Dấu hiệu của hệ thống quản lý cơ sở dữ liệu (Database). Chuỗi chứa truy vấn SQL, tên bảng (tables) hoặc cấu trúc chỉ mục ghi nhận thông tin nội bộ.`;
    case 'Configuration':
      return `Tệp cấu hình định cấu trúc định dạng JSON/XML hoặc INI. Thích hợp để thiết lập các biến vận hành hệ thống mặc định của chương trình.`;
    case 'Engine':
      return `Định danh nội bộ hoặc cấu trúc Class lõi thuộc các công cụ phát triển cấp thấp (Unity, Unreal Engine, Godot). Thay đổi có thể gây lỗi treo phần mềm.`;
    case 'Scripts':
      return `Đoạn mã kịch bản thực thi trực tiếp bằng ngôn ngữ thông dịch (Lua, Python, JS). Điều phối các hành vi nghiệp vụ cấp trung của hệ thống.`;
    case 'Localization':
      return `Nội dung tài nguyên ngôn ngữ đa quốc gia (Tiếng Anh, Tiếng Việt, v.v.). Đây là mục tiêu lý tưởng nhất để chỉnh sửa dịch thuật và Việt hóa game/ứng dụng.`;
    case 'Audio':
      return `Đường dẫn tài nguyên âm thanh hoặc tệp điều phối tần số âm nhạc nội bộ của chương trình.`;
    case 'Texture':
      return `Mẫu ảnh đồ họa phẳng hoặc mô hình Texture giao diện được tải trực tiếp lên GPU để hiển thị thị giác cho người dùng.`;
    case 'UI':
      return `Thành phần định hình bố cục khung nhìn giao diện người dùng (gồm nút bấm, nhãn chữ, hiệu ứng lề).`;
    default:
      if (lower.startsWith('http')) return `Địa chỉ liên kết ngoài tải tài nguyên bổ sung qua mạng.`;
      if (lower.length > 30) return `Chuỗi văn bản thô dài có định dạng đặc thù, đóng vai trò khối truyền tải dữ liệu hoặc cấu trúc nén nhị phân.`;
      return `Tham số định danh hoặc cờ điều hướng luồng hoạt động nhị phân thô cấp thấp của mã máy.`;
  }
}

export default function StringsTab({ file, virtualFileSize, onJumpToOffset, onPatchString, analysis, isAnalyzing, onNavigateTab, initialSearchQuery }: StringsTabProps) {
  const { toast } = useUI();
  
  const [filterQuery, setFilterQuery] = useState(initialSearchQuery || '');
  const [debouncedQuery, setDebouncedQuery] = useState(initialSearchQuery || '');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [encodingFilter, setEncodingFilter] = useState<string>('all');
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [minEntropy, setMinEntropy] = useState<number>(0);
  const [minLen, setMinLen] = useState<number>(4);
  const [selectedString, setSelectedString] = useState<RegistryStringEntry | null>(null);
  const [patchValue, setPatchValue] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(1000);

  // Advanced search states
  const [matchType, setMatchType] = useState<'contains' | 'exact' | 'regex' | 'fuzzy' | 'prefix' | 'suffix' | 'multi' | 'semantic' | 'concept'>('contains');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [smartSynonyms, setSmartSynonyms] = useState(true);

  // AI semantic search state
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiMatches, setAiMatches] = useState<Array<{ offset: number; reason: string }>>([]);
  const [aiScannedCount, setAiScannedCount] = useState(0);

  // Listen to background streams from Registry
  const [registryVersion, setRegistryVersion] = useState(0);
  useEffect(() => {
    return StringsRegistry.addListener(() => {
      setRegistryVersion(prev => prev + 1);
    });
  }, []);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(filterQuery);
      // Reset visible limit on new query
      setVisibleLimit(1000);
    }, 250);
    return () => clearTimeout(handler);
  }, [filterQuery]);

  useEffect(() => {
    if (initialSearchQuery) {
      setFilterQuery(initialSearchQuery);
      setDebouncedQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  // Reset selected string if it becomes invalid
  useEffect(() => {
    setSelectedString(null);
  }, [file]);

  const handleAiSearch = async () => {
    const allStrings = StringsRegistry.getAll();
    if (!filterQuery.trim() || allStrings.length === 0) return;
    setIsAiSearching(true);
    setAiMatches([]); // Reset old matches
    setAiScannedCount(0);
    
    try {
      const response = await fetch('/api/strings/ai-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: filterQuery
        })
      });
      if (!response.ok) {
        throw new Error('Yêu cầu tìm kiếm AI thất bại');
      }
      const data = await response.json();
      
      const keywords = data.keywords || [];
      const regexes = (data.regexes || []).map((r: string) => {
        try { return new RegExp(r, 'i'); } catch (e) { return null; }
      }).filter((r: any) => r !== null);
      
      const explanation = data.explanation || "Kết quả phù hợp dựa trên phân tích AI.";

      // Local fast filtering over all extracted strings
      const results: any[] = [];
      const MAX_RESULTS = 1000;
      
      for (let i = 0; i < allStrings.length; i++) {
        const s = allStrings[i];
        let matched = false;
        
        for (const rx of regexes) {
          if (rx.test(s.value)) {
            matched = true;
            break;
          }
        }
        
        if (!matched && keywords.length > 0) {
          const lowerVal = s.value.toLowerCase();
          for (const kw of keywords) {
            if (lowerVal.includes(kw.toLowerCase())) {
              matched = true;
              break;
            }
          }
        }
        
        if (matched) {
          results.push({
            offset: s.offset,
            reason: explanation
          });
          if (results.length >= MAX_RESULTS) break;
        }
      }
      
      setAiMatches(results);
      setAiScannedCount(allStrings.length);

      toast(`Tìm kiếm AI hoàn tất. Tìm thấy ${results.length} chuỗi (Đã quét ${allStrings.length.toLocaleString()} chuỗi).`, "success");
    } catch (err: any) {
      console.error(err);
      toast("Lỗi tìm kiếm AI: " + (err.message || "Không thể kết nối tới Google Gemini AI."), "error");
    } finally {
      setIsAiSearching(false);
    }
  };

  // Sync patch value when selected string changes
  useEffect(() => {
    if (selectedString) {
      setPatchValue(selectedString.value);
    } else {
      setPatchValue('');
    }
  }, [selectedString]);

  // Read direct live-updating registry metrics
  const registryStats = useMemo(() => {
    const _v = registryVersion;
    return StringsRegistry.getStats();
  }, [registryVersion]);

  const isScanRunning = useMemo(() => {
    const _v = registryVersion;
    return StringsRegistry.getIsScanRunning();
  }, [registryVersion]);

  // Execute high speed indexed query
  const processedStrings = useMemo(() => {
    const _v = registryVersion;
    return StringsRegistry.query({
      query: debouncedQuery,
      matchType: matchType === 'semantic' ? 'semantic' : (smartSynonyms && matchType === 'contains' ? 'concept' : matchType),
      caseSensitive,
      category: activeCategoryFilter,
      encoding: encodingFilter,
      minConfidence,
      minEntropy,
      minLen,
      aiMatches: matchType === 'semantic' ? aiMatches : undefined
    });
  }, [
    registryVersion,
    debouncedQuery,
    matchType,
    smartSynonyms,
    caseSensitive,
    activeCategoryFilter,
    encodingFilter,
    minConfidence,
    minEntropy,
    minLen,
    aiMatches
  ]);

  // Get current chunk of visible results
  const filteredVisible = useMemo(() => {
    return processedStrings.slice(0, visibleLimit);
  }, [processedStrings, visibleLimit]);

  // Related sibling strings
  const relatedStrings = useMemo(() => {
    if (!selectedString) return [];
    const all = StringsRegistry.getAll();
    return all
      .filter(s => s.category === selectedString.category && s.value !== selectedString.value)
      .slice(0, 5);
  }, [selectedString, registryVersion]);

  const renderConfidenceStars = (score: number) => {
    const full = Math.min(5, Math.max(1, score));
    return (
      <div className="flex items-center space-x-0.5 text-amber-400">
        {Array.from({ length: 5 }).map((_, i) => (
          <Sparkles 
            key={i} 
            className={`w-3 h-3 ${i < full ? 'fill-amber-400 text-amber-400 opacity-100' : 'opacity-10 text-white/30'}`} 
          />
        ))}
      </div>
    );
  };

  const handleApplyPatch = () => {
    if (!selectedString || !onPatchString) return;
    onPatchString(selectedString.offset, selectedString.length, patchValue);
    toast(`Đã vá chuỗi nhị phân tại địa chỉ 0x${selectedString.offset.toString(16).toUpperCase()}`, "success");
    
    setSelectedString(prev => prev ? { ...prev, value: patchValue } : null);
  };

  const handleCopyAllResults = () => {
    if (processedStrings.length === 0) return;
    try {
      const text = processedStrings.map(s => `0x${s.offset.toString(16).toUpperCase()}: ${s.value}`).join('\n');
      navigator.clipboard.writeText(text);
      toast(`Đã sao chép toàn bộ ${processedStrings.length.toLocaleString()} kết quả vào Clipboard!`, "success");
    } catch (err: any) {
      toast("Lỗi sao chép: " + err.message, "error");
    }
  };

  const handleExportStrings = () => {
    if (processedStrings.length === 0) return;
    const content = processedStrings.map(s => `[0x${s.offset.toString(16).toUpperCase()}] (${s.encoding}) [${s.category}] [Confidence: ${s.confidence}/5] Entropy: ${s.entropy?.toFixed(2)} | ${s.value}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${file.name}_strings_report.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast(`Xuất báo cáo thành công: Đã lưu ${processedStrings.length.toLocaleString()} chuỗi vào tệp tin.`, "success");
  };

  const scannedPercent = file.size > 0 ? Math.min(100, (registryStats.bytesScanned / file.size) * 100) : 0;
  const scannedMB = (registryStats.bytesScanned / (1024 * 1024)).toFixed(1);
  const totalMB = (file.size / (1024 * 1024)).toFixed(1);

  if (isAnalyzing || isScanRunning) {
    const barsCount = 20;
    const filledBars = Math.floor((scannedPercent / 100) * barsCount);
    const emptyBars = barsCount - filledBars;
    const progressText = '█'.repeat(filledBars) + '░'.repeat(emptyBars);

    const speedFormat = registryStats.speedMBps 
      ? `${registryStats.speedMBps.toFixed(1)} MB/s`
      : 'Calculating...';
    
    const timeRemaining = registryStats.estimatedRemainingSecs
      ? registryStats.estimatedRemainingSecs > 60 
          ? `${(registryStats.estimatedRemainingSecs / 60).toFixed(1)} mins` 
          : `${Math.ceil(registryStats.estimatedRemainingSecs)} secs`
      : 'Calculating...';

    return (
      <div className="flex-1 flex flex-col h-full bg-[#0a0f1c] items-center justify-center font-mono">
        <div className="w-full max-w-2xl bg-black/40 border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          
          {/* Animated Background Gradient */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-cyan-500 to-purple-500 opacity-50" />
          
          <div className="flex flex-col space-y-8">
            
            {/* Header */}
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <Terminal className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-widest">Deep Strings Engine</h2>
                  <p className="text-[10px] text-white/40 tracking-wider">Multi-Encoding Extraction</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 text-[10px] font-bold">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-400 uppercase tracking-widest">Scanning</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-white/60 font-bold tracking-widest">
                <span className="text-purple-400">{progressText}</span>
                <span className="text-white">{scannedPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${scannedPercent}%` }}
                />
              </div>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                <div className="text-[9px] text-white/40 uppercase tracking-widest mb-1 flex items-center space-x-1">
                  <Database className="w-3 h-3" />
                  <span>Strings Found</span>
                </div>
                <div className="text-white font-bold text-sm">
                  {registryStats.totalCount.toLocaleString()}
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                <div className="text-[9px] text-white/40 uppercase tracking-widest mb-1 flex items-center space-x-1">
                  <Activity className="w-3 h-3" />
                  <span>Current Speed</span>
                </div>
                <div className="text-blue-400 font-bold text-sm">
                  {speedFormat}
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                <div className="text-[9px] text-white/40 uppercase tracking-widest mb-1 flex items-center space-x-1">
                  <Layers className="w-3 h-3" />
                  <span>Chunks</span>
                </div>
                <div className="text-white font-bold text-sm">
                  {registryStats.chunkCount} / {registryStats.totalChunks}
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                <div className="text-[9px] text-white/40 uppercase tracking-widest mb-1 flex items-center space-x-1">
                  <RefreshCw className="w-3 h-3" />
                  <span>Time Left</span>
                </div>
                <div className="text-amber-400 font-bold text-sm">
                  {timeRemaining}
                </div>
              </div>
            </div>

            {/* Bottom Info Bar */}
            <div className="flex justify-between items-center text-[10px] text-white/30 pt-4 border-t border-white/5">
              <span>Current Offset: 0x{registryStats.bytesScanned.toString(16).toUpperCase()}</span>
              <span>Memory Usage: Optimized Streaming</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0f1c] select-none">
      <div className="flex-1 flex flex-row h-full overflow-hidden">
        {/* Left panel: Filters & Virtual Lists */}
        <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-white/5">
          
          {/* Top Header & Search Panel */}
          <div className="bg-[#121829]/60 border-b border-white/5 p-4 sm:p-5 space-y-4 shrink-0">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <Terminal className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-md font-bold text-white tracking-tight">
                      Deep Strings Explorer <span className="text-[10px] text-purple-400 font-normal bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 ml-2">v3.0 Streaming</span>
                    </h2>
                    <p className="text-[10px] text-white/40 mt-0.5 uppercase tracking-wider font-bold">
                      Tổng cộng <span className="text-purple-400">{registryStats.totalCount.toLocaleString()}</span> chuỗi • lọc được <span className="text-blue-400">{processedStrings.length.toLocaleString()}</span> kết quả
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="relative group flex-1 md:flex-initial">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 group-focus-within:text-purple-400 transition-colors" />
                  <input 
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && matchType === 'semantic') {
                        handleAiSearch();
                      }
                    }}
                    placeholder={matchType === 'semantic' ? "Nhập ý định tìm kiếm AI..." : "Tìm kiếm chuỗi hoặc offset..."}
                    className="pl-9 pr-4 py-2 bg-black/40 border border-white/5 rounded-xl text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 w-full md:w-64 transition-all"
                  />
                </div>

                {matchType === 'semantic' && (
                  <button
                    onClick={() => handleAiSearch()}
                    disabled={isAiSearching || !filterQuery.trim()}
                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 shrink-0"
                    title="Bắt đầu phân tích tìm kiếm bằng AI"
                  >
                    {isAiSearching ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                    )}
                    <span>Tìm AI</span>
                  </button>
                )}

                {/* AI Smart Search Toggle */}
                <button 
                  onClick={() => {
                    const nextMode = matchType === 'semantic' ? 'contains' : 'semantic';
                    setMatchType(nextMode);
                    toast(nextMode === 'semantic' ? "Kích hoạt Chế độ AI Semantic Search" : "Trở về Chế độ Tìm kiếm Thường", "info");
                  }}
                  className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center space-x-1.5 ${matchType === 'semantic' ? 'bg-purple-600/20 border-purple-500/40 text-purple-300 shadow-lg shadow-purple-500/10' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}
                  title="Bật tính năng tìm kiếm ngữ nghĩa AI"
                >
                  <Sparkles className={`w-4 h-4 ${matchType === 'semantic' ? 'animate-pulse text-purple-400' : ''}`} />
                  <span className="text-[10px] font-bold uppercase hidden sm:inline">Trợ lý AI</span>
                </button>

                <button 
                  onClick={handleCopyAllResults}
                  className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all cursor-pointer text-white/60 shrink-0"
                  title="Sao chép toàn bộ kết quả đã lọc"
                >
                  <Copy className="w-4 h-4" />
                </button>

                <button 
                  onClick={handleExportStrings}
                  className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all cursor-pointer text-white/60 shrink-0"
                  title="Xuất danh sách chuỗi ra tệp tin text"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Category Tab-Bar */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 hide-scrollbar">
              <button 
                onClick={() => setActiveCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 transition-all ${activeCategoryFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
              >
                Tất cả ({registryStats.totalCount})
              </button>
              {Object.entries(registryStats.byCategory).map(([cat, count]) => (
                <button 
                  key={cat}
                  onClick={() => setActiveCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 transition-all border ${activeCategoryFilter === cat ? 'bg-purple-600/20 text-purple-300 border-purple-500/40' : 'bg-white/5 text-white/40 border-transparent hover:bg-white/10'}`}
                >
                  {cat} ({count})
                </button>
              ))}
            </div>

            {/* Fine Tuning Filter Dropdowns (Multitasking Filters) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-black/20 p-2.5 rounded-xl border border-white/5 items-center">
              
              {/* Match Type Dropdown */}
              <div className="space-y-1">
                <label className="text-[8px] font-bold text-white/30 uppercase tracking-widest block">Thuật toán khớp</label>
                <select
                  value={matchType}
                  onChange={(e: any) => setMatchType(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-[10px] text-white/80 focus:outline-none"
                >
                  <option value="contains">Mặc định (Contains)</option>
                  <option value="exact">Chính xác (Exact)</option>
                  <option value="fuzzy">Fuzzy Search (Mờ)</option>
                  <option value="regex">Biểu thức chính quy (Regex)</option>
                  <option value="prefix">Bắt đầu bằng (Prefix)</option>
                  <option value="suffix">Kết thúc bằng (Suffix)</option>
                  <option value="multi">Nhiều từ khóa (Multi)</option>
                  <option value="concept">Đồng nghĩa khái niệm (Concept)</option>
                  <option value="semantic">Ngữ nghĩa AI (Semantic)</option>
                </select>
              </div>

              {/* Encoding Selector */}
              <div className="space-y-1">
                <label className="text-[8px] font-bold text-white/30 uppercase tracking-widest block">Mã hóa (Encoding)</label>
                <select
                  value={encodingFilter}
                  onChange={(e) => setEncodingFilter(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-[10px] text-white/80 focus:outline-none"
                >
                  <option value="all">Tất cả mã hóa</option>
                  <option value="ASCII">ASCII</option>
                  <option value="UTF-8">UTF-8</option>
                  <option value="UTF-16">UTF-16</option>
                  <option value="UTF-32">UTF-32</option>
                  <option value="decoded">Đã giải mã ẩn (Decoded)</option>
                </select>
              </div>

              {/* Min Length Input */}
              <div className="space-y-1">
                <label className="text-[8px] font-bold text-white/30 uppercase tracking-widest block">Độ dài tối thiểu</label>
                <input
                  type="number"
                  min="4"
                  max="256"
                  value={minLen}
                  onChange={(e) => setMinLen(parseInt(e.target.value) || 4)}
                  className="w-full bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none"
                />
              </div>

              {/* Case Sensitive Toggle */}
              <div className="flex items-center justify-between bg-black/10 px-2 py-1.5 rounded-lg border border-white/5 mt-3 sm:mt-0">
                <label className="text-[7.5px] font-bold text-white/40 uppercase tracking-wider">Phân biệt Hoa/Thường</label>
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="accent-purple-500 rounded border-white/10"
                />
              </div>

              {/* Smart Synonyms Toggle */}
              <div className="flex items-center justify-between bg-black/10 px-2 py-1.5 rounded-lg border border-white/5 mt-3 sm:mt-0">
                <label className="text-[7.5px] font-bold text-white/40 uppercase tracking-wider" title="Tự động tìm từ đồng nghĩa liên quan">Tự động mở rộng từ đồng nghĩa</label>
                <input
                  type="checkbox"
                  checked={smartSynonyms}
                  onChange={(e) => setSmartSynonyms(e.target.checked)}
                  className="accent-purple-500 rounded border-white/10"
                />
              </div>

            </div>
          </div>

          {/* Results Stream / List */}
          <div className="flex-1 min-h-0 relative bg-black/10 flex flex-col">
            
            {/* 2. Heavy content limits warning and pagination handles */}
            {processedStrings.length > 1000 && (
              <div className="bg-amber-950/20 border-b border-amber-500/20 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="text-[10px] text-white/80 leading-snug">
                    <span className="font-bold text-amber-400">Quá nhiều kết quả ({processedStrings.length.toLocaleString()}).</span> Đang hiển thị {Math.min(visibleLimit, processedStrings.length).toLocaleString()} kết quả để duy trì hiệu năng 60 FPS cực mượt.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={() => setVisibleLimit(prev => prev + 1000)}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-[9px] font-bold uppercase transition-all cursor-pointer"
                  >
                    Hiển thị thêm 1000
                  </button>
                  <button 
                    onClick={() => setVisibleLimit(processedStrings.length)}
                    className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded text-[9px] font-bold uppercase transition-all cursor-pointer"
                  >
                    Hiển thị tất cả
                  </button>
                </div>
              </div>
            )}

            {matchType === 'semantic' && aiMatches.length > 0 && (
              <div className="bg-purple-950/20 border-b border-purple-500/20 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                <div className="flex items-center space-x-2.5">
                  <div className="p-1 bg-purple-500/10 border border-purple-500/20 rounded-lg shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-white/80">Trình quét ngữ nghĩa AI</div>
                    <div className="text-[9px] text-white/40 mt-0.5">
                      Đã quét <span className="text-purple-400 font-mono font-bold">{aiScannedCount.toLocaleString()}</span> / <span className="text-white/60 font-mono">{StringsRegistry.getAll().length.toLocaleString()}</span> chuỗi • Tìm thấy <span className="text-green-400 font-mono font-bold">{aiMatches.length}</span> kết quả
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="hidden md:block w-24 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, (aiScannedCount / (StringsRegistry.getAll().length || 1)) * 100)}%` }}
                    />
                  </div>

                  {aiScannedCount < StringsRegistry.getAll().length && (
                    <button
                      onClick={() => handleAiSearch()}
                      disabled={isAiSearching}
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 text-white rounded-lg text-[9px] font-bold transition-all cursor-pointer flex items-center space-x-1 shrink-0"
                    >
                      {isAiSearching ? (
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-2.5 h-2.5 text-yellow-300" />
                      )}
                      <span>Quét tiếp 10.000 chuỗi</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {isAiSearching && aiMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 text-center space-y-4 flex-1">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center animate-pulse">
                    <Sparkles className="w-8 h-8 text-purple-400 animate-spin" style={{ animationDuration: '3s' }} />
                  </div>
                  <div className="absolute inset-0 border border-purple-500/30 rounded-full animate-ping opacity-40"></div>
                </div>
                <div className="max-w-md">
                  <h4 className="text-white text-xs font-bold uppercase tracking-widest">Gemini đang phân tích ngữ nghĩa...</h4>
                  <p className="text-white/40 text-[10px] mt-1.5 leading-relaxed">
                    Đang quét và phân tích các chuỗi nhị phân có độ liên quan ngữ nghĩa tốt nhất với "{filterQuery}" sử dụng sức mạnh của Google Gemini.
                  </p>
                </div>
              </div>
            ) : matchType === 'semantic' && aiMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 max-w-md mx-auto h-full flex-1">
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                  <Sparkles className="w-6 h-6 text-purple-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-white font-bold uppercase tracking-wider text-xs">Sẵn sàng Tìm kiếm bằng AI</h3>
                  <p className="text-white/40 text-[10px] mt-2 leading-relaxed">
                    {filterQuery.trim() ? (
                      <span>Nhấn nút <strong className="text-purple-400">Tìm AI</strong> hoặc bấm <strong className="text-purple-400">Enter</strong> để quét ngữ nghĩa với Google Gemini API.</span>
                    ) : (
                      <span>Nhập ý định tìm kiếm của bạn vào hộp tìm kiếm (ví dụ: "chức năng đăng nhập", "api keys", "địa chỉ mạng") để bắt đầu.</span>
                    )}
                  </p>
                </div>
              </div>
            ) : processedStrings.length > 0 ? (
              <div className="flex-1 min-h-0">
                <Virtuoso
                  data={filteredVisible}
                  endReached={() => {
                    if (processedStrings.length > visibleLimit) {
                      setVisibleLimit(prev => prev + 1000);
                    }
                  }}
                  className="h-full scrollbar-thin scrollbar-thumb-white/10"
                  itemContent={(index, s) => {
                    const isSelected = selectedString?.value === s.value;
                    const isDecoded = !!s.originalValue;
                    return (
                      <div 
                        key={`${s.offset}-${index}`}
                        className={`group flex items-start px-4 sm:px-5 py-3 border-b border-white/[0.03] transition-colors cursor-pointer select-none ${isSelected ? 'bg-purple-500/10 border-l-2 border-l-purple-500' : 'hover:bg-white/[0.02]'}`}
                        onClick={() => setSelectedString(s)}
                      >
                        {/* Offset Block */}
                        <div className="w-20 sm:w-24 shrink-0 font-mono text-[10px] text-white/30 group-hover:text-purple-400 transition-colors mt-0.5">
                          0x{s.offset.toString(16).toUpperCase()}
                        </div>

                        {/* Value Preview Block */}
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center space-x-1.5 truncate">
                            <span className={`font-mono text-xs text-white/90 group-hover:text-white transition-colors truncate ${isDecoded ? 'text-teal-300 font-semibold' : ''}`}>
                              {s.value}
                            </span>
                            {isDecoded && (
                              <span className="shrink-0 px-1 py-0.2 bg-teal-500/20 text-teal-300 rounded text-[8px] font-bold border border-teal-500/20">
                                DECODED
                              </span>
                            )}
                            {s.count && s.count > 1 && (
                              <span className="shrink-0 px-1 bg-white/5 group-hover:bg-purple-500/20 text-white/40 group-hover:text-purple-300 rounded text-[8px] font-bold border border-white/5">
                                × {s.count}
                              </span>
                            )}
                          </div>
                          
                          {/* Sub-label indicators */}
                          <div className="flex flex-col space-y-1.5 mt-1">
                            <div className="flex items-center space-x-2 opacity-60">
                              <span className="text-[9px] font-mono text-white/30">{s.encoding}</span>
                              <span className="text-[9px] font-mono text-white/20">•</span>
                              <span className="text-[9px] font-mono text-white/30">Len: {s.length}</span>
                              {s.entropy && (
                                <>
                                  <span className="text-[9px] font-mono text-white/20">•</span>
                                  <span className="text-[9px] font-mono text-white/30">H: {s.entropy.toFixed(2)}</span>
                                </>
                              )}
                            </div>
                            {s.aiReason && (
                              <div className="flex items-start space-x-1.5 text-purple-300 text-[10px] bg-purple-500/10 p-2 rounded-lg border border-purple-500/20 max-w-full">
                                <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5 animate-pulse" />
                                <span className="leading-snug italic font-sans">{s.aiReason}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Badges & Actions */}
                        <div className="flex items-center space-x-2.5 shrink-0 mt-0.5">
                          {/* Confidence Stars on Hover / List */}
                          <div className="hidden sm:block">
                            {renderConfidenceStars(s.confidence || 1)}
                          </div>

                          <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-tighter ${
                            s.category === 'Gameplay' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/10' :
                            s.category === 'Network' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/10' :
                            s.category === 'Database' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/10' :
                            s.category === 'Security' ? 'bg-red-500/20 text-red-400 border border-red-500/10' :
                            s.category === 'Engine' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/10' :
                            s.category === 'Scripts' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/10' :
                            s.category === 'Localization' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/10' :
                            s.category === 'Audio' ? 'bg-pink-500/20 text-pink-400 border border-pink-500/10' :
                            s.category === 'Texture' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/10' :
                            s.category === 'UI' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/10' :
                            'bg-white/5 text-white/40 border border-white/5'
                          }`}>
                            {s.category}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-white/10 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    );
                  }}
                  components={{
                    Footer: () => (
                      <div className="p-8 text-center space-y-4">
                        {processedStrings.length > visibleLimit ? (
                          <button 
                            onClick={() => setVisibleLimit(prev => prev + 1000)}
                            className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold uppercase text-white/60 hover:text-white transition-all cursor-pointer"
                          >
                            Tải thêm 1000 kết quả
                          </button>
                        ) : (
                          <div className="flex flex-col items-center space-y-1 opacity-20">
                            <Zap className="w-3.5 h-3.5 text-white" />
                            <p className="text-[9px] uppercase font-bold tracking-widest italic">--- Hoàn tất quét toàn bộ ---</p>
                          </div>
                        )}
                      </div>
                    )
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-20 text-center space-y-3 flex-1">
                <ShieldAlert className="w-10 h-10 text-white/5" />
                <p className="text-xs text-white/20 font-bold uppercase tracking-widest">Không tìm thấy chuỗi phù hợp bộ lọc</p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Deep Smart Preview Side Panel */}
        <AnimatePresence>
          {selectedString && (
            <motion.div 
              initial={{ opacity: 0, x: 200 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 200 }}
              className="w-full md:w-[360px] lg:w-[400px] shrink-0 bg-[#0d1323] border-l border-white/5 flex flex-col h-full overflow-hidden absolute inset-y-0 right-0 z-20 md:relative"
            >
              {/* Sidebar Header */}
              <div className="p-4 sm:p-5 border-b border-white/5 bg-[#121829]/40 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Phân tích Chi tiết</h3>
                </div>
                <button 
                  onClick={() => setSelectedString(null)}
                  className="px-2.5 py-1 text-[9px] font-bold uppercase text-white/40 hover:text-white bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-all cursor-pointer"
                >
                  Đóng
                </button>
              </div>

              {/* Sidebar content */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 scrollbar-thin scrollbar-thumb-white/10 font-sans">
                {/* Main String Preview Card */}
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-white/30 uppercase tracking-widest block">Nội dung chuỗi ký tự</label>
                  <div className="bg-black/50 p-4 rounded-xl border border-white/5 select-all relative group font-mono text-sm break-all leading-relaxed text-purple-200">
                    {selectedString.value}
                  </div>
                  
                  {selectedString.originalValue && (
                    <div className="space-y-1 mt-2">
                      <label className="text-[8px] font-bold text-teal-400 uppercase tracking-widest block">Bản gốc chưa mã hóa</label>
                      <div className="bg-teal-500/5 p-3 rounded-xl border border-teal-500/10 font-mono text-xs break-all text-teal-300">
                        {selectedString.originalValue}
                      </div>
                    </div>
                  )}
                </div>

                {/* Offset & Memory Address Tracker */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Địa chỉ nhị phân (Offsets)</label>
                    <button 
                      onClick={() => onJumpToOffset(selectedString.offset)}
                      className="text-[9px] text-purple-400 hover:text-purple-300 font-bold uppercase flex items-center space-x-1 cursor-pointer"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      <span>Nhảy tới Hex</span>
                    </button>
                  </div>
                  
                  <div className="bg-black/20 rounded-xl border border-white/5 divide-y divide-white/[0.03]">
                    {selectedString.offsets && selectedString.offsets.length > 0 ? (
                      <div className="max-h-24 overflow-y-auto scrollbar-none p-1.5 grid grid-cols-2 gap-1.5">
                        {selectedString.offsets.map((off: number, idx: number) => (
                          <div 
                            key={idx}
                            onClick={() => {
                              onJumpToOffset(off);
                              toast("Dịch chuyển Hex Editor tới 0x" + off.toString(16).toUpperCase(), "info");
                            }}
                            className="px-2.5 py-1.5 bg-black/40 hover:bg-purple-500/20 border border-white/5 rounded-lg font-mono text-[10px] text-white/60 hover:text-purple-300 transition-all text-center cursor-pointer"
                          >
                            0x{off.toString(16).toUpperCase()}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 text-center text-white/40 font-mono text-[10px]">
                        0x{selectedString.offset.toString(16).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Smart Metrics & Analysis Scorecard */}
                <div className="bg-black/30 rounded-xl border border-white/5 p-3.5 space-y-3">
                  <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest flex items-center">
                    <Sliders className="w-3.5 h-3.5 mr-2 text-purple-400" />
                    Chỉ số Phân tích Kỹ thuật
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-white/30 block">Phân loại</span>
                      <span className="text-white font-medium">{selectedString.category}</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-white/30 block">Mã hóa</span>
                      <span className="text-white font-mono">{selectedString.encoding?.split(' ')[0]}</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-white/30 block">Độ tin cậy</span>
                      <div>{renderConfidenceStars(selectedString.confidence || 1)}</div>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-white/30 block">Xung quanh Entropy</span>
                      <span className="text-purple-400 font-mono font-bold">{(selectedString.entropy || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Local Entropy bar */}
                  <div className="space-y-1 pt-1.5 border-t border-white/5">
                    <div className="flex justify-between text-[8px] font-bold uppercase tracking-wider text-white/40">
                      <span>Mật độ thông tin lân cận</span>
                      <span>{((selectedString.entropy || 0) / 8 * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          (selectedString.entropy || 0) > 7.2 ? 'bg-red-500' :
                          (selectedString.entropy || 0) > 5.0 ? 'bg-amber-500' : 'bg-purple-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, ((selectedString.entropy || 0) / 8) * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {selectedString.aiReason && (
                  <div className="bg-purple-600/10 border border-purple-500/30 rounded-xl p-4 space-y-2 relative overflow-hidden">
                    <div className="flex items-center space-x-2 text-purple-300">
                      <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Lý do khớp AI Semantic Search</span>
                    </div>
                    <p className="text-white text-xs leading-relaxed font-sans">
                      {selectedString.aiReason}
                    </p>
                  </div>
                )}

                {/* AI Assistant Explanation Box */}
                <div className="bg-purple-500/5 rounded-xl border border-purple-500/10 p-4 space-y-2 relative overflow-hidden group">
                  <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 opacity-5 pointer-events-none transition-transform group-hover:scale-110">
                    <Sparkles className="w-24 h-24 text-purple-400" />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">Nhận định từ AI Explorer</span>
                  </div>
                  
                  <p className="text-white/80 text-[11px] leading-relaxed font-sans">
                    {generateAIExplanation(selectedString.value, selectedString.category || 'System', selectedString.confidence || 1)}
                  </p>
                  
                  <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider text-purple-400/60 pt-1 border-t border-purple-500/5">
                    <span>Confidence rating</span>
                    <span>{Math.round((selectedString.confidence || 1) * 20)}%</span>
                  </div>

                  {onNavigateTab && (
                    <button 
                      onClick={() => onNavigateTab('ai_analysis')}
                      className="w-full mt-2 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-300 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      Hỏi AI chi tiết về chuỗi này
                    </button>
                  )}
                </div>

                {/* Semantic Related Strings Sidebar */}
                {relatedStrings.length > 0 && (
                  <div className="space-y-2.5">
                    <label className="text-[9px] font-bold text-white/30 uppercase tracking-widest block">Liên quan (Semantic Sibling)</label>
                    <div className="space-y-1.5">
                      {relatedStrings.map((rs: any, idx: number) => (
                        <div 
                          key={idx}
                          onClick={() => setSelectedString(rs)}
                          className="p-2 bg-black/30 hover:bg-purple-500/10 border border-white/5 hover:border-purple-500/20 rounded-lg transition-all cursor-pointer flex items-center justify-between"
                        >
                          <span className="font-mono text-xs text-white/70 truncate mr-2">{rs.value}</span>
                          <span className="text-[8px] font-mono text-white/30 shrink-0">0x{rs.offset.toString(16).toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hex Editor Patch / Modifying Section */}
                {onPatchString && (
                  <div className="bg-black/30 rounded-xl border border-white/5 p-4 space-y-3">
                    <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest flex items-center">
                      <Code className="w-3.5 h-3.5 mr-2 text-blue-400" />
                      Chỉnh sửa chuỗi (Patch Value)
                    </h4>
                    
                    <div className="space-y-2">
                      <input 
                        type="text"
                        value={patchValue}
                        onChange={(e) => setPatchValue(e.target.value)}
                        className="w-full bg-black/60 border border-white/5 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="Nhập giá trị thay thế mới..."
                      />
                      
                      <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                        <span className="text-white/30">Giới hạn độ dài:</span>
                        <span className={patchValue.length > selectedString.length ? 'text-red-400' : 'text-emerald-400'}>
                          {patchValue.length} / {selectedString.length} ký tự
                        </span>
                      </div>

                      {patchValue.length > selectedString.length && (
                        <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-[10px] flex items-start space-x-1.5 font-sans">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <p className="leading-normal">
                            Độ dài chuỗi mới lớn hơn nguyên bản! Việc lưu có thể chèn đè lên các lệnh máy lân cận và gây crash ứng dụng. Hãy cân nhắc cắt bớt.
                          </p>
                        </div>
                      )}

                      <button 
                        onClick={handleApplyPatch}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer flex items-center justify-center space-x-2"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Ghi đè giá trị (Patch)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
