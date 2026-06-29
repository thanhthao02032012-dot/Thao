import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileCode, Info, ShieldCheck, Zap, Database, Clock, Compass, ArrowRight,
  Sparkles, Layers, CheckCircle2, ChevronRight, AlertCircle, AlertTriangle,
  Play, Pause, XCircle, Music, Film, Image as ImageIcon, FileText, Code2, 
  Key, Network, HelpCircle, HardDrive, Cpu, Table, ShieldAlert, Check, RefreshCw, Undo2, Redo2, Download, Upload,
  Settings, Hexagon, Search
} from 'lucide-react';
import { AnalysisResult } from '../utils/fileAnalyzer';
import { useUI } from './UIProvider';

interface OverviewTabProps {
  file: File;
  virtualFileSize: number;
  analysis: AnalysisResult | null;
  onNavigateTab: (tabId: string) => void;
  onUnlockAdvanced: () => void;
  isAdvancedUnlocked: boolean;
  patches: Map<number, number>;
  onApplyPatch?: (offset: number, value: number) => void;
  onClearPatches?: () => void;
  onImportPatches?: (imported: Map<number, number>) => void;
  appMode: 'easy' | 'advanced';
  setAppMode: (mode: 'easy' | 'advanced') => void;
  perfMode: 'lite' | 'balanced' | 'professional';
  onChangePerfMode: (mode: 'lite' | 'balanced' | 'professional') => void;
  scanMetrics?: {
    header: string;
    metadata: number;
    strings: number;
    assets: number;
    structure: number;
  };
}

export default function OverviewTab({
  file,
  virtualFileSize,
  analysis,
  onNavigateTab,
  onUnlockAdvanced,
  isAdvancedUnlocked,
  patches,
  onApplyPatch,
  perfMode,
  onChangePerfMode,
  scanMetrics,
  appMode,
  setAppMode
}: OverviewTabProps) {
  const { toast } = useUI();

  // CPU/RAM Simulation for Performance Monitor
  const [cpu, setCpu] = useState(0);
  const [ram, setRam] = useState(0);

  useEffect(() => {
    // Determine default mode based on user's unlock history
    if (isAdvancedUnlocked) setAppMode('advanced');
  }, [isAdvancedUnlocked]);

  useEffect(() => {
    // Monitor System Performance
    const interval = setInterval(() => {
      setCpu(Math.max(5, Math.min(95, 10 + Math.random() * 20)));
      setRam(Math.max(128, Math.min(2048, 512 + Math.random() * 256)));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const getSmartToolIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-5 h-5 text-pink-400" />;
      case 'audio': return <Music className="w-5 h-5 text-blue-400" />;
      case 'video': return <Film className="w-5 h-5 text-purple-400" />;
      case 'text': return <FileText className="w-5 h-5 text-green-400" />;
      case 'database': return <Database className="w-5 h-5 text-orange-400" />;
      default: return <FileCode className="w-5 h-5 text-gray-400" />;
    }
  };

  const getSmartToolName = (type: string) => {
    switch (type) {
      case 'image': return 'Image Tools';
      case 'audio': return 'Audio Tools';
      case 'video': return 'Video Tools';
      case 'text': return 'Text Editor';
      case 'database': return 'Database Tools';
      default: return 'Smart Edit';
    }
  };

  // Determine detected modules for Smart Edit
  const detectedModules = [];
  if (analysis?.detectedItems.images) detectedModules.push('image');
  if (analysis?.detectedItems.audio) detectedModules.push('audio');
  if (analysis?.detectedItems.video) detectedModules.push('video');
  if (analysis?.detectedItems.text) detectedModules.push('text');
  if (analysis?.detectedItems.databases) detectedModules.push('database');

  return (
    <div className="space-y-5 text-left pb-10 font-sans">
      
      {/* 1. Header & Performance Monitor */}
      <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center">
              <HardDrive className="w-5 h-5 text-blue-400 mr-2" />
              {file.name}
            </h2>
            <p className="text-xs text-white/40 mt-1 flex items-center space-x-2">
              <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
              <span>•</span>
              <span className="text-emerald-400">{analysis?.fileType || 'Đang phân tích...'}</span>
            </p>
          </div>
          
          {/* Performance Monitor mini */}
          <div className="flex items-center space-x-4 bg-black/20 p-2 px-4 rounded-xl border border-white/5">
            <div className="text-center">
              <div className="text-[10px] text-white/30 uppercase">CPU</div>
              <div className="text-xs font-mono font-bold text-emerald-400">{cpu.toFixed(0)}%</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-white/30 uppercase">RAM</div>
              <div className="text-xs font-mono font-bold text-blue-400">{ram.toFixed(0)} MB</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-white/30 uppercase">Worker</div>
              <div className="text-xs font-mono font-bold text-purple-400">{scanMetrics?.strings === 100 ? 'Idle' : 'Active'}</div>
            </div>
          </div>
        </div>

        {/* Scan Progress */}
        {scanMetrics && scanMetrics.strings < 100 && (
          <div className="pt-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center">
                <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                Quét phân tích nền
              </span>
              <span className="text-[10px] font-mono text-white/40">{scanMetrics.strings}%</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500/50 transition-all duration-300" style={{ width: `${scanMetrics.strings}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* 2. Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Mode Switcher */}
        <div className="flex items-center p-1 bg-black/30 rounded-xl border border-white/5 w-fit">
          <button
            onClick={() => setAppMode('easy')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${appMode === 'easy' ? 'bg-purple-600/20 text-purple-300' : 'text-white/40 hover:text-white/80'}`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Easy Mode</span>
          </button>
          <button
            onClick={() => {
              setAppMode('advanced');
              onUnlockAdvanced();
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${appMode === 'advanced' ? 'bg-red-500/20 text-red-400' : 'text-white/40 hover:text-white/80'}`}
          >
            <Hexagon className="w-4 h-4" />
            <span>Advanced Mode</span>
          </button>
        </div>

        {/* Scan Type Switcher */}
        <div className="flex items-center space-x-1 bg-black/45 border border-white/10 p-1 rounded-2xl">
          {(['lite', 'balanced', 'professional'] as const).map((mode) => {
            const labelMap = { lite: '⚡ Quick Scan', balanced: '⚖️ Balanced', professional: '🔬 Deep Scan' };
            const tooltipMap = { 
              lite: 'Chỉ quét Header & Cấu trúc cơ bản, rất mượt', 
              balanced: 'Quét vừa phải, giới hạn để tiết kiệm RAM', 
              professional: 'Đọc toàn bộ file, khôi phục cấu trúc sâu' 
            };
            return (
              <button
                key={mode}
                title={tooltipMap[mode]}
                onClick={() => onChangePerfMode(mode)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                  perfMode === mode
                    ? 'bg-blue-600/25 border-blue-500/35 text-blue-200 shadow-sm'
                    : 'text-white/40 hover:text-white hover:bg-white/5 border-transparent'
                }`}
              >
                {labelMap[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Dynamic Dashboard Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Left Column: Smart Edit & Analysis */}
        <div className="space-y-5">
          <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Phân tích thông minh</h3>
            
            {detectedModules.length > 0 ? (
              <div className="space-y-3">
                {detectedModules.map(mod => (
                  <button 
                    key={mod}
                    onClick={() => {
                      if (mod === 'image' || mod === 'audio' || mod === 'video') onNavigateTab('media');
                      else if (mod === 'text') onNavigateTab('content');
                      else if (mod === 'database') onNavigateTab('structure');
                      else onNavigateTab('edit');
                    }}
                    className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
                  >
                    <div className="flex items-center space-x-3">
                      {getSmartToolIcon(mod)}
                      <span className="text-sm font-medium text-white/90">{getSmartToolName(mod)}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center p-6 text-white/30 text-sm">
                Đang quét hoặc không tìm thấy dữ liệu có cấu trúc.
              </div>
            )}
          </div>

          <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Metadata</h3>
            <div className="space-y-2">
              {analysis?.metadata.slice(0, 5).map((m, i) => (
                <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-white/5 last:border-0">
                  <span className="text-white/40">{m.label}</span>
                  <span className="text-white/90 truncate max-w-[150px]">{m.value}</span>
                </div>
              ))}
              <button 
                onClick={() => onNavigateTab('metadata')}
                className="w-full mt-2 py-2 text-xs font-bold text-blue-400/80 hover:text-blue-400 transition-colors"
              >
                Xem toàn bộ Metadata
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Workflows & Advanced */}
        <div className="space-y-5">
          {appMode === 'advanced' ? (
            <div className="bg-red-950/10 border border-red-500/10 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-red-400/50 uppercase tracking-widest mb-4">Advanced Tools</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => onNavigateTab('advanced')} className="p-4 bg-white/5 hover:bg-white/10 rounded-xl flex flex-col items-center justify-center space-y-2 transition-all">
                  <Hexagon className="w-5 h-5 text-red-400" />
                  <span className="text-xs font-bold text-white/70">Hex Editor</span>
                </button>
                <button onClick={() => onNavigateTab('strings')} className="p-4 bg-white/5 hover:bg-white/10 rounded-xl flex flex-col items-center justify-center space-y-2 transition-all">
                  <Code2 className="w-5 h-5 text-purple-400" />
                  <span className="text-xs font-bold text-white/70">Strings</span>
                </button>
                <button onClick={() => onNavigateTab('structure')} className="p-4 bg-white/5 hover:bg-white/10 rounded-xl flex flex-col items-center justify-center space-y-2 transition-all">
                  <Layers className="w-5 h-5 text-blue-400" />
                  <span className="text-xs font-bold text-white/70">Structures</span>
                </button>
                <button onClick={() => onNavigateTab('edit')} className="p-4 bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/40 rounded-xl flex flex-col items-center justify-center space-y-2 transition-all group">
                  <Sparkles className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-purple-200">Visual Explorer</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button onClick={() => onNavigateTab('search')} className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
                  <div className="flex items-center space-x-3">
                    <Search className="w-5 h-5 text-purple-400" />
                    <span className="text-sm font-medium text-white/90">Tìm kiếm nội dung</span>
                  </div>
                </button>
                <button onClick={() => toast("Tính năng khôi phục đang phát triển", "info")} className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
                  <div className="flex items-center space-x-3">
                    <Undo2 className="w-5 h-5 text-blue-400" />
                    <span className="text-sm font-medium text-white/90">Khôi phục bản gốc</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Tổng quan</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-white/30 uppercase">Chuỗi ký tự</p>
                <p className="text-lg font-mono font-bold text-white/90">{analysis?.strings.length || 0}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/30 uppercase">Thay đổi (Patches)</p>
                <p className="text-lg font-mono font-bold text-white/90">{patches.size}</p>
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}