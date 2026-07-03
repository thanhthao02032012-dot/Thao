import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileCode, Info, ShieldCheck, Zap, Database, Clock, Compass, ArrowRight,
  Sparkles, Layers, CheckCircle2, ChevronRight, AlertCircle, AlertTriangle,
  Play, Pause, XCircle, Music, Film, Image as ImageIcon, FileText, Code2, 
  Key, Network, HelpCircle, HardDrive, Cpu, Table, ShieldAlert, Check, RefreshCw, Undo2, Redo2, Download, Upload,
  Settings, Hexagon, Search
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { AnalysisResult } from '../utils/fileAnalyzer';
import { StringsRegistry } from '../utils/stringsRegistry';
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

  const getSmartInsights = () => {
    const insights: Array<{ text: string; type: 'success' | 'info' | 'warning' | 'danger' }> = [];
    const nameLower = file.name.toLowerCase();
    const ext = nameLower.split('.').pop() || '';
    
    // 1. Save game
    if (ext === 'sav' || ext === 'save' || nameLower.includes('savegame') || (file.size < 1024 * 1024 && ext === 'dat')) {
      insights.push({ text: "Đây có khả năng là file save game.", type: 'warning' });
    }
    // 2. Texture
    if (analysis?.detectedItems.images || ['png', 'jpg', 'jpeg', 'dds', 'tga', 'gif', 'bmp', 'webp'].includes(ext)) {
      insights.push({ text: "Có texture / tài nguyên hình ảnh.", type: 'success' });
    }
    // 3. Model
    if (['obj', 'fbx', '3ds', 'gltf', 'glb', 'stl', 'mesh', 'dae'].includes(ext) || nameLower.includes('model')) {
      insights.push({ text: "Có mô hình 3D / model.", type: 'success' });
    }
    // 4. Audio
    if (analysis?.detectedItems.audio || ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
      insights.push({ text: "Có tệp tin âm thanh / audio.", type: 'success' });
    }
    // 5. Script
    if (['lua', 'js', 'py', 'sh', 'bat', 'ps1', 'ts', 'go', 'rs'].includes(ext) || (analysis?.strings && analysis.strings.some(s => s.type === 'lua' || s.type === 'javascript' as any))) {
      insights.push({ text: "Có kịch bản lập trình / script.", type: 'info' });
    }
    // 6. Shader
    if (['glsl', 'hlsl', 'spv', 'vertex', 'fragment', 'geom'].includes(ext) || (analysis?.strings && analysis.strings.some(s => s.value.includes('#version') || s.value.includes('precision highp') || s.value.includes('uniform ')))) {
      insights.push({ text: "Có lập trình đổ bóng / shader.", type: 'info' });
    }
    // 7. Config
    if (['ini', 'cfg', 'conf', 'json', 'xml', 'yaml', 'yml'].includes(ext) || analysis?.fileType?.includes('JSON') || analysis?.fileType?.includes('XML')) {
      insights.push({ text: "Có tệp cấu hình / configuration.", type: 'info' });
    }
    // 8. SQLite
    if (analysis?.detectedItems.databases || ext === 'db' || ext === 'sqlite' || analysis?.fileType?.includes('SQLite')) {
      insights.push({ text: "Có cơ sở dữ liệu SQLite.", type: 'success' });
    }
    // 9. JSON
    if (analysis?.fileType?.includes('JSON') || (analysis?.strings && analysis.strings.some(s => s.type === 'json'))) {
      insights.push({ text: "Có định dạng cấu trúc JSON.", type: 'success' });
    }
    // 10. Compressed
    const isCompressed = (analysis as any)?.deepScan?.stageResults?.compression?.isCompressed || ['zip', 'rar', '7z', 'gz', 'tar'].includes(ext);
    if (isCompressed) {
      insights.push({ text: "Có vùng nén / dữ liệu nén.", type: 'warning' });
    }
    // 11. Suspicious
    if (analysis?.entropy && analysis.entropy > 7.9) {
      insights.push({ text: "Có vùng đáng nghi (Mật độ Entropy cực cao - nghi ngờ mã hóa hoặc bảo mật).", type: 'danger' });
    }
    
    if (insights.length === 0) {
      insights.push({ text: "Tệp tin có dạng nhị phân thô thông thường.", type: 'info' });
    }
    return insights;
  };

  const insights = getSmartInsights();

  // AI Copilot State
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');

  const handleAskAI = async (questionText?: string) => {
    const q = questionText || customQuestion;
    if (!q.trim()) return;

    setIsAiAnalyzing(true);
    setAiAnalysis('');

    try {
      // 1. Get search strategy from AI
      let relevantSnippets: string[] = [];
      try {
        const searchRes = await fetch('/api/strings/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q })
        });
        
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const keywords = searchData.keywords || [];
          const regexes = (searchData.regexes || []).map((r: string) => {
            try { return new RegExp(r, 'i'); } catch (e) { return null; }
          }).filter((r: any) => r !== null);
          
          const allStrings = StringsRegistry.getAll();
          const MAX_RESULTS = 50;
          for (let i = 0; i < allStrings.length; i++) {
            const s = allStrings[i];
            let matched = false;
            for (const rx of regexes) {
              if (rx.test(s.value)) { matched = true; break; }
            }
            if (!matched && keywords.length > 0) {
              const lowerVal = s.value.toLowerCase();
              for (const kw of keywords) {
                if (lowerVal.includes(kw.toLowerCase())) { matched = true; break; }
              }
            }
            if (matched) {
              relevantSnippets.push(`[Offset 0x${s.offset.toString(16).toUpperCase()}] ${s.value}`);
              if (relevantSnippets.length >= MAX_RESULTS) break;
            }
          }
        }
      } catch (err) {
        console.warn("Fast search failed, proceeding without string snippets", err);
      }

      const res = await fetch('/api/file/ai-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          filesize: file.size,
          fileType: analysis?.fileType,
          entropy: analysis?.entropy,
          insights: insights.map(ins => ins.text),
          question: q,
          fileContent: relevantSnippets.length > 0 ? relevantSnippets.join('\n') : undefined
        })
      });

      if (!res.ok) {
        throw new Error('Yêu cầu phân tích AI thất bại');
      }

      const data = await res.json();
      setAiAnalysis(data.analysis || 'Không có phản hồi từ AI.');
    } catch (err: any) {
      console.error(err);
      toast("Lỗi Trợ lý AI: " + (err.message || "Không thể kết nối tới máy chủ AI."), "error");
    } finally {
      setIsAiAnalyzing(false);
    }
  };

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
          <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">Phân tích thông minh</h3>
              <p className="text-[11px] text-white/30 mt-0.5">Nhận diện định dạng, cấu trúc và đặc trưng tệp tự động</p>
            </div>
            
            {/* 1. Deep Diagnostics Insights list */}
            <div className="space-y-2 border-b border-white/5 pb-4">
              {insights.map((insight, idx) => {
                const colors = {
                  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  info: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                  danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }[insight.type];

                const bulletColors = {
                  success: 'bg-emerald-400 shadow-emerald-400/50',
                  info: 'bg-sky-400 shadow-sky-400/50',
                  warning: 'bg-amber-400 shadow-amber-400/50',
                  danger: 'bg-rose-400 shadow-rose-400/50'
                }[insight.type];

                return (
                  <div 
                    key={idx} 
                    className={`flex items-center space-x-2.5 p-3 rounded-xl border text-xs font-medium leading-relaxed ${colors}`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_rgba(0,0,0,0.5)] ${bulletColors}`} />
                    <span>{insight.text}</span>
                  </div>
                );
              })}
            </div>

            {/* 2. Detected modules shortcut buttons */}
            {detectedModules.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-mono font-bold text-white/30 uppercase block">Công cụ phân tích đề xuất:</span>
                <div className="grid grid-cols-1 gap-2">
                  {detectedModules.map(mod => (
                    <button 
                      key={mod}
                      onClick={() => {
                        if (mod === 'image' || mod === 'audio' || mod === 'video') onNavigateTab('media');
                        else if (mod === 'text') onNavigateTab('content');
                        else if (mod === 'database') onNavigateTab('structure');
                        else onNavigateTab('edit');
                      }}
                      className="w-full flex items-center justify-between p-3.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/[0.03] group text-left cursor-pointer"
                    >
                      <div className="flex items-center space-x-3">
                        {getSmartToolIcon(mod)}
                        <span className="text-xs font-medium text-white/95">{getSmartToolName(mod)}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors" />
                    </button>
                  ))}
                </div>
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

          {/* Deep Scan CTA */}
          <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center">
                <Sparkles className="w-3 h-3 mr-2" /> Deep Analysis
              </h3>
              <ShieldCheck className="w-4 h-4 text-purple-400" />
            </div>
            <div className="space-y-3">
              <p className="text-sm text-white/70 leading-relaxed">
                Kích hoạt chế độ <b>Deep Scan</b> để quét toàn bộ strings, magic patterns và entropy trên toàn bộ file (hỗ trợ tới vài GB).
              </p>
              <button 
                onClick={() => onChangePerfMode('professional')}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-900/20 flex items-center justify-center cursor-pointer"
              >
                Kích hoạt Full Analysis
              </button>
            </div>
          </div>

          {/* AI Binary Analyst Chat */}
          <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Trợ lý Phân tích AI</h3>
                  <p className="text-[10px] text-white/30 mt-0.5">Khám phá cấu trúc và độ an toàn của tệp</p>
                </div>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>

            {/* Quick Prompts */}
            <div className="space-y-2">
              <span className="text-[9px] font-mono font-bold text-white/30 uppercase block">Câu hỏi gợi ý:</span>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  "Phân tích tổng quan và cấu trúc nhị phân của tệp này",
                  "Giải nghĩa mức độ entropy và đánh giá độ an toàn bảo mật",
                  "Khuyến nghị phương pháp khai thác/chỉnh sửa trong WebHexed"
                ].map((promptText, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCustomQuestion(promptText);
                      handleAskAI(promptText);
                    }}
                    disabled={isAiAnalyzing}
                    className="w-full text-left p-2.5 bg-white/5 hover:bg-purple-500/10 hover:border-purple-500/20 rounded-xl text-[10px] text-white/70 hover:text-purple-300 transition-all border border-transparent cursor-pointer leading-snug"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>

            {/* Input form */}
            <div className="flex items-center space-x-2 bg-black/40 border border-white/5 p-1.5 rounded-xl">
              <input
                type="text"
                placeholder="Hỏi trợ lý AI bất cứ điều gì về tệp này..."
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAskAI();
                }}
                disabled={isAiAnalyzing}
                className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none"
              />
              <button
                onClick={() => handleAskAI()}
                disabled={isAiAnalyzing || !customQuestion.trim()}
                className="p-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 text-white rounded-lg transition-all cursor-pointer shrink-0"
              >
                {isAiAnalyzing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* AI Response Viewer */}
            {(isAiAnalyzing || aiAnalysis) && (
              <div className="bg-black/20 rounded-xl p-4 border border-white/[0.03] space-y-3">
                <div className="flex items-center space-x-1.5 border-b border-white/5 pb-2">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">Phản hồi của Trợ lý AI</span>
                </div>
                
                {isAiAnalyzing ? (
                  <div className="flex items-center space-x-3 py-6 justify-center">
                    <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
                    <span className="text-xs text-white/40 italic">Đang phân tích cấu trúc nhị phân...</span>
                  </div>
                ) : (
                  <div className="text-xs text-white/80 leading-relaxed max-h-[300px] overflow-y-auto pr-1 select-text font-sans prose prose-invert prose-xs">
                    <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
}