import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Link2, Box, Cpu, FolderOpen, Sliders, ChevronRight, Search, 
  HelpCircle, Sparkles, Database, Terminal, ShieldAlert, Zap, Layers, RefreshCw, Key, Shield, Network, Mail, Code,
  Play, Pause, Square, Activity, Plus, Filter, Download
} from 'lucide-react';
import { useUI } from './UIProvider';
import { AnalysisResult } from '../utils/fileAnalyzer';

interface StringsTabProps {
  file: File;
  virtualFileSize: number;
  onJumpToOffset: (offset: number) => void;
  onPatchString?: (offset: number, originalLen: number, newValue: string) => void;
  analysis: AnalysisResult | null;
  isAnalyzing?: boolean;
}

export default function StringsTab({ file, virtualFileSize, onJumpToOffset, onPatchString, analysis, isAnalyzing }: StringsTabProps) {
  const { toast } = useUI();
  
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('all');
  const [visibleLimit, setVisibleLimit] = useState(1000);
  
  const strings = useMemo(() => {
    if (!analysis) return [];
    let list = analysis.strings;
    
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      list = list.filter(s => s.value.toLowerCase().includes(q) || s.offset.toString(16).includes(q));
    }
    
    if (activeTypeFilter !== 'all') {
      list = list.filter(s => s.type === activeTypeFilter);
    }
    
    return list;
  }, [analysis, filterQuery, activeTypeFilter]);

  const filteredVisible = useMemo(() => {
    return strings.slice(0, visibleLimit);
  }, [strings, visibleLimit]);

  const typeStats = useMemo(() => {
    if (!analysis) return {};
    const stats: Record<string, number> = {};
    analysis.strings.forEach(s => {
      stats[s.type] = (stats[s.type] || 0) + 1;
    });
    return stats;
  }, [analysis]);

  if (!analysis || (isAnalyzing && strings.length === 0)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4 bg-[#0a0f1c]">
        <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
        <div className="max-w-xs">
          <h3 className="text-white font-bold uppercase tracking-widest text-sm">Đang trích xuất chuỗi...</h3>
          <p className="text-white/40 text-[10px] mt-2 leading-relaxed">
            Hệ thống đang quét các khối dữ liệu nhị phân chạy ngầm để trích xuất chuỗi ký tự. Bạn vẫn có thể sử dụng các tab Tổng quan, Cấu trúc, Siêu dữ liệu ngay lúc này!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden font-sans bg-[#0a0f1c]">
      {/* Header & Stats */}
      <div className="bg-[#121829]/60 border-b border-white/5 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center">
              <Terminal className="w-5 h-5 text-purple-400 mr-3" />
              Strings Explorer
            </h2>
            <p className="text-[10px] text-white/40 mt-1 uppercase tracking-wider font-bold">
              Đã phát hiện <span className="text-purple-400">{analysis.strings.length.toLocaleString()}</span> chuỗi ký tự • {(file.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 group-focus-within:text-purple-400 transition-colors" />
              <input 
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Tìm kiếm nội dung hoặc offset..."
                className="pl-9 pr-4 py-2 bg-black/40 border border-white/5 rounded-xl text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 w-full md:w-64 transition-all"
              />
            </div>
            <button className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all cursor-pointer">
              <Download className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 hide-scrollbar">
          <button 
            onClick={() => setActiveTypeFilter('all')}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 transition-all ${activeTypeFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
          >
            Tất cả ({analysis.strings.length})
          </button>
          {Object.entries(typeStats).map(([type, count]) => (
            <button 
              key={type}
              onClick={() => setActiveTypeFilter(type)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 transition-all ${activeTypeFilter === type ? 'bg-blue-600/30 text-blue-300 border border-blue-500/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
            >
              {type} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 min-h-0 relative">
        {strings.length > 0 ? (
          <Virtuoso
            data={filteredVisible}
            endReached={() => {
              if (strings.length > visibleLimit) {
                setVisibleLimit(prev => prev + 1000);
              }
            }}
            className="h-full scrollbar-thin scrollbar-thumb-white/10"
            itemContent={(index, s) => (
              <div 
                key={`${s.offset}-${index}`}
                className="group flex items-center px-4 sm:px-6 py-4 border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors cursor-pointer"
                onClick={() => onJumpToOffset(s.offset)}
              >
                <div className="w-24 shrink-0 font-mono text-[10px] text-white/30 group-hover:text-purple-400 transition-colors">
                  0x{s.offset.toString(16).toUpperCase()}
                </div>
                <div className="flex-1 truncate pr-4">
                  <span className="font-mono text-sm text-white/90 group-hover:text-white transition-colors">
                    {s.value}
                  </span>
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tighter ${
                    s.type === 'url' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/10' :
                    s.type === 'email' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/10' :
                    s.type === 'api_key' || s.type === 'password' || s.type === 'token' ? 'bg-red-500/20 text-red-400 border border-red-500/10' :
                    s.type === 'ip' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/10' :
                    s.type === 'shell' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/10' :
                    s.type === 'json' || s.type === 'xml' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/10' :
                    s.type === 'sql' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/10' :
                    s.type === 'path' ? 'bg-teal-500/20 text-teal-400 border border-teal-500/10' :
                    'bg-white/5 text-white/40 border border-white/5'
                  }`}>
                    {s.type}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-white/10 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            )}
            components={{
              Footer: () => (
                <div className="p-10 text-center space-y-4">
                  {strings.length > visibleLimit ? (
                    <button 
                      onClick={() => setVisibleLimit(prev => prev + 1000)}
                      className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-bold uppercase text-white/60 hover:text-white transition-all"
                    >
                      Tải thêm 1000 kết quả
                    </button>
                  ) : (
                    <div className="flex flex-col items-center space-y-2 opacity-20">
                      <Zap className="w-4 h-4" />
                      <p className="text-[10px] uppercase font-bold tracking-widest italic">--- Hết danh sách ---</p>
                    </div>
                  )}
                </div>
              )
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-20 text-center space-y-3">
            <ShieldAlert className="w-10 h-10 text-white/5" />
            <p className="text-xs text-white/20 font-bold uppercase tracking-widest">Không có kết quả phù hợp</p>
          </div>
        )}
      </div>
    </div>
  );
}
