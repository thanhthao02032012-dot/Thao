import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, Play, Pause, X, ShieldAlert, CheckCircle, Terminal, 
  Sparkles, Plus, Trash2, Code, FileText, ChevronRight, 
  Search, ShieldCheck, RefreshCw, Layers, ArrowUpRight, Activity
} from 'lucide-react';
import { 
  DEFAULT_YARA_RULES, YaraRule, YaraScanResult, 
  runYaraDeepScan, parseYaraRules 
} from '../utils/yaraEngine';
import { useUI } from './UIProvider';

interface YaraTabProps {
  file: File;
  onJumpToOffset: (offset: number) => void;
}

export default function YaraTab({ file, onJumpToOffset }: YaraTabProps) {
  const { toast } = useUI();
  
  // Rule sets
  const [rules, setRules] = useState<YaraRule[]>(DEFAULT_YARA_RULES);
  const [selectedRule, setSelectedRule] = useState<YaraRule | null>(DEFAULT_YARA_RULES[0]);
  const [editorMode, setEditorMode] = useState<'preset' | 'custom'>('preset');
  
  // Custom YARA text editor state
  const [customRuleText, setCustomRuleText] = useState<string>(
`// Viết hoặc paste các luật YARA của bạn tại đây
rule CustomGameSignature {
  meta:
    description = "Tìm kiếm tệp cấu hình game nhị phân đặc trưng"
    author = "Người dùng WebHexed"
  strings:
    $flag1 = "Config"
    $flag2 = "LevelData"
    $hexPattern = { 43 6F 6E 66 69 67 }
  condition:
    $flag1 and ($flag2 or $hexPattern)
}`
  );

  // Scan states
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [results, setResults] = useState<YaraScanResult[] | null>(null);
  const [totalScannedSize, setTotalScannedSize] = useState(0);
  
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [scanSpeed, setScanSpeed] = useState(0);
  const [scanEta, setScanEta] = useState('');
  
  // AI summary states
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);

  // Auto trigger scan on file switch if rule list changes
  const handleStartScan = async () => {
    let finalRules = rules;
    if (editorMode === 'custom') {
      try {
        const parsed = parseYaraRules(customRuleText);
        if (parsed.length === 0) {
          toast("Không tìm thấy định nghĩa luật YARA hợp lệ. Hãy kiểm tra cú pháp (rule Name { ... })", "error");
          return;
        }
        finalRules = parsed;
        toast(`Đã biên dịch thành công ${parsed.length} luật YARA tùy chỉnh!`, "success");
      } catch (err: any) {
        toast(`Lỗi cú pháp biên dịch luật YARA: ${err.message}`, "error");
        return;
      }
    }

    setScanning(true);
    setScanProgress(0);
    setScanStatus("Đang khởi tạo scan...");
    setResults(null);
    setAiSummary('');
    setIsPaused(false);
    isPausedRef.current = false;
    setScanSpeed(0);
    setScanEta('');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startTime = Date.now();
    let totalPausedTime = 0;
    let lastPauseTime = 0;

    const onPauseCheck = async () => {
      while (isPausedRef.current) {
        if (lastPauseTime === 0) lastPauseTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (lastPauseTime > 0) {
        totalPausedTime += Date.now() - lastPauseTime;
        lastPauseTime = 0;
      }
    };

    try {
      const scanResults = await runYaraDeepScan(
        file, 
        finalRules, 
        (progress, status) => {
          setScanProgress(progress);
          setScanStatus(status);
          
          const now = Date.now();
          const elapsed = (now - startTime - totalPausedTime) / 1000;
          const maxScanLimit = Math.min(file.size, 100 * 1024 * 1024);
          const scannedSize = (progress / 100) * maxScanLimit;
          const speed = elapsed > 0 ? (scannedSize / (1024 * 1024)) / elapsed : 0;
          setScanSpeed(speed);
          
          if (speed > 0 && progress < 100) {
            const remainingBytes = maxScanLimit - scannedSize;
            const remainingMB = remainingBytes / (1024 * 1024);
            const eta = remainingMB / speed;
            setScanEta(eta < 1 ? '< 1s' : eta < 60 ? `~${Math.round(eta)}s` : `~${Math.floor(eta / 60)}m ${Math.round(eta % 60)}s`);
          }
        },
        100 * 1024 * 1024,
        {
          signal: abortController.signal,
          onPauseCheck
        }
      );
      setResults(scanResults);
      setTotalScannedSize(Math.min(file.size, 100 * 1024 * 1024)); // scan max size is capped at 100MB
      
      if (scanResults.length > 0) {
        toast(`Phát hiện ${scanResults.length} chữ ký khớp tập luật YARA!`, "warning");
      } else {
        toast("Rà soát hoàn tất: Không tìm thấy chữ ký YARA nguy hại.", "success");
      }
    } catch (err: any) {
      if (err.message === "Scan cancelled by user") {
        toast("Đã hủy rà soát YARA", "info");
      } else {
        toast(`Rà soát thất bại: ${err.message}`, "error");
      }
    } finally {
      setScanning(false);
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleGenerateAISummary = async () => {
    if (!results) return;
    setAiLoading(true);
    setAiSummary('');

    const simplifiedMatches = results.map(r => ({
      rule: r.ruleName,
      confidence: r.confidence,
      matchCount: r.matches.length,
      description: r.description
    }));

    try {
      const res = await fetch('/api/yara/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          filesize: file.size,
          ruleMatches: simplifiedMatches
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Lỗi tạo tóm tắt AI");
      }

      const data = await res.json();
      setAiSummary(data.summary || "Không nhận được phản hồi phân tích.");
    } catch (err: any) {
      toast(err.message, "error");
      setAiSummary(`Không thể kích hoạt trí tuệ nhân tạo: ${err.message || "Vui lòng kiểm tra cấu hình khóa API GEMINI trong Settings > Secrets."}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div id="yara-scanner-panel" className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 text-gray-100">
      
      {/* Top Banner and Summary Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-[#0e1626]/80 border border-purple-500/20 rounded-2xl relative overflow-hidden shadow-xl shadow-purple-950/10">
        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-2xl rounded-full" />
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center justify-center text-purple-400">
            <Shield className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              YARA Deep Scan Engine <span className="text-[10px] font-mono bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded uppercase">v2.1 Full Spec</span>
            </h1>
            <p className="text-xs text-white/60 mt-0.5">
              Rà soát chữ ký nhị phân, phát hiện malware, game engine, định dạng nén &amp; cấu trúc ẩn cấp độ sâu.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          {scanning ? (
            <>
              {/* Scan Status Metrics Inline */}
              <div className="flex flex-col text-right mr-2 hidden sm:flex">
                <span className={`text-[10px] font-mono font-bold ${isPaused ? 'text-amber-400' : 'text-purple-400'}`}>
                  {isPaused ? 'ĐÃ TẠM DỪNG' : scanStatus}
                </span>
                <span className="text-[9px] font-mono text-white/40">
                  {scanSpeed > 0 ? `${scanSpeed.toFixed(1)} MB/s` : ''} {scanEta ? `• ${scanEta}` : ''}
                </span>
              </div>

              {/* Progress percentage ring or chip */}
              <div className={`text-xs font-mono font-bold px-2.5 py-1.5 rounded-lg mr-1.5 animate-pulse ${isPaused ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300' : 'bg-purple-500/10 border border-purple-500/20 text-purple-300'}`}>
                {Math.round(scanProgress)}%
              </div>

              {/* Pause/Resume button */}
              <button
                onClick={() => {
                  const nextPaused = !isPaused;
                  setIsPaused(nextPaused);
                  isPausedRef.current = nextPaused;
                  toast(nextPaused ? "Đã tạm dừng rà soát YARA" : "Tiếp tục rà soát YARA...", "info");
                }}
                className={`p-2.5 border rounded-xl transition-all cursor-pointer ${isPaused ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 text-amber-400' : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/60'}`}
                title={isPaused ? "Tiếp tục" : "Tạm dừng"}
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>

              {/* Cancel Button */}
              <button
                onClick={() => {
                  abortControllerRef.current?.abort();
                  toast("Đang hủy rà soát...", "info");
                }}
                className="p-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-xl transition-all cursor-pointer"
                title="Hủy rà soát"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={handleStartScan}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-950/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <Play className="w-4 h-4" />
              Bắt đầu rà soát sâu
            </button>
          )}
        </div>
      </div>

      {/* Rules Browser & Custom Code Area (Left) vs Scan Result View (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Rule Configuration Panel */}
        <div className="lg:col-span-5 bg-[#0b0f19]/80 border border-white/5 rounded-2xl p-5 flex flex-col space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
              <Code className="w-4 h-4 text-purple-400" /> Cấu hình Tập Luật (YARA Rules)
            </h3>
            
            {/* Toggle Modes */}
            <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/5 text-[11px] font-medium">
              <button
                onClick={() => setEditorMode('preset')}
                className={`px-2.5 py-1 rounded-md transition-colors ${editorMode === 'preset' ? 'bg-purple-600 text-white font-bold' : 'text-white/60 hover:text-white'}`}
              >
                Mặc định
              </button>
              <button
                onClick={() => setEditorMode('custom')}
                className={`px-2.5 py-1 rounded-md transition-colors ${editorMode === 'custom' ? 'bg-purple-600 text-white font-bold' : 'text-white/60 hover:text-white'}`}
              >
                Tùy chỉnh
              </button>
            </div>
          </div>

          {editorMode === 'preset' ? (
            <div className="space-y-3 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs text-white/50 mb-3">
                  Chọn một trong các tập luật phân tích chữ ký hệ thống được tích hợp sẵn để xem đặc tả nhị phân:
                </p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {rules.map((rule) => {
                    const isSelected = selectedRule?.name === rule.name;
                    return (
                      <button
                        key={rule.name}
                        onClick={() => setSelectedRule(rule)}
                        className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex items-center justify-between ${
                          isSelected 
                            ? 'bg-purple-500/10 border-purple-500/40 text-white' 
                            : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/80'
                        }`}
                      >
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                            {rule.name}
                          </div>
                          <div className="text-[10px] text-white/40 mt-1 max-w-[240px] truncate">
                            {rule.meta.description}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono bg-white/5 px-2 py-0.5 rounded-md text-white/60 uppercase">
                          {rule.meta.category || 'Chữ ký'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedRule && (
                <div className="mt-4 p-4 bg-white/5 border border-white/5 rounded-xl space-y-2 text-xs">
                  <div className="font-bold text-white flex items-center justify-between">
                    <span>Đặc tả: rule {selectedRule.name}</span>
                    <span className="text-[10px] text-white/30 font-mono">Tác giả: {selectedRule.meta.author || "WebHexed"}</span>
                  </div>
                  <div className="text-white/60 text-[11px] leading-relaxed">
                    {selectedRule.meta.description}
                  </div>
                  <div className="pt-2 border-t border-white/5">
                    <div className="text-[10px] font-mono text-purple-300">strings:</div>
                    <div className="space-y-1 mt-1 font-mono text-[10px] text-white/50 pl-2">
                      {selectedRule.strings.map(s => (
                        <div key={s.id} className="truncate">
                          {s.id} = {s.type === 'hex' ? `{ ${s.value} }` : `"${s.value}"`}
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] font-mono text-purple-300 mt-2">condition:</div>
                    <div className="font-mono text-[10px] text-white/50 pl-2 mt-0.5">
                      {selectedRule.condition}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">Trình biên tập YARA Rule:</span>
                <span className="text-[10px] font-mono text-purple-400">YARA Syntax Compliant</span>
              </div>
              <textarea
                value={customRuleText}
                onChange={(e) => setCustomRuleText(e.target.value)}
                className="w-full h-[320px] bg-black/40 border border-white/10 rounded-xl p-3 font-mono text-[11px] text-purple-200 focus:outline-none focus:border-purple-500/50 resize-none leading-relaxed"
                spellCheck={false}
              />
              <p className="text-[10px] text-white/40 leading-relaxed">
                * Luật tùy chỉnh sẽ tự động được biên dịch khi nhấn nút <b>"Bắt đầu rà soát sâu"</b> phía trên. Hỗ trợ đầy đủ các kiểu chuỗi nhị phân (Hex Pattern), Regex và chuỗi văn bản thuần.
              </p>
            </div>
          )}

        </div>

        {/* Right: Scan Results Panel */}
        <div className="lg:col-span-7 flex flex-col space-y-6">

          {/* Scanning Progress Bar */}
          {scanning && (
            <div className={`bg-[#0b0f19]/80 border rounded-2xl p-5 space-y-4 shadow-lg transition-all ${isPaused ? 'border-amber-500/30 shadow-amber-950/5' : 'border-purple-500/30 shadow-purple-950/10'}`}>
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center space-x-2 font-medium">
                  {isPaused ? (
                    <div className="flex items-center gap-2 text-amber-400">
                      <Pause className="w-3.5 h-3.5 animate-pulse" />
                      <span>Đang tạm dừng: {scanStatus}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-purple-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{scanStatus}</span>
                    </div>
                  )}
                </div>
                <span className={`font-mono font-bold ${isPaused ? 'text-amber-300' : 'text-white'}`}>{Math.round(scanProgress)}%</span>
              </div>
              
              {/* Progress Track */}
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                <motion.div 
                  className={`h-full transition-all duration-300 ${isPaused ? 'bg-gradient-to-r from-amber-500 to-yellow-400' : 'bg-gradient-to-r from-purple-500 to-indigo-500'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${scanProgress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>

              {/* Advanced YARA Metrics Row */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="bg-black/20 p-2.5 rounded-xl border border-white/[0.02]">
                  <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold block">Tốc độ quét</span>
                  <span className="text-xs font-bold text-white font-mono mt-0.5 block">
                    {scanSpeed > 0 ? `${scanSpeed.toFixed(1)} MB/s` : '--'}
                  </span>
                </div>
                <div className="bg-black/20 p-2.5 rounded-xl border border-white/[0.02]">
                  <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold block">Thời gian còn lại</span>
                  <span className="text-xs font-bold text-white font-mono mt-0.5 block">
                    {isPaused ? 'Tạm dừng' : (scanEta || 'Tính toán...')}
                  </span>
                </div>
                <div className="bg-black/20 p-2.5 rounded-xl border border-white/[0.02]">
                  <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold block">Đã xử lý</span>
                  <span className="text-xs font-bold text-white font-mono mt-0.5 block">
                    {((scanProgress / 100) * Math.min(file.size, 100 * 1024 * 1024) / (1024 * 1024)).toFixed(1)} / {(Math.min(file.size, 100 * 1024 * 1024) / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Results Block */}
          {!scanning && results === null && (
            <div className="bg-[#0b0f19]/40 border border-dashed border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4">
              <Shield className="w-12 h-12 text-white/10" />
              <div>
                <h4 className="text-sm font-semibold text-white/80">Sẵn sàng rà soát Deep YARA</h4>
                <p className="text-xs text-white/40 max-w-sm mx-auto mt-1">
                  Hãy nhấn "Bắt đầu rà soát sâu" để chạy bộ giải mã pattern nhị phân trên toàn bộ dữ liệu tệp tin.
                </p>
              </div>
            </div>
          )}

          {!scanning && results !== null && (
            <div className="space-y-6">
              
              {/* Scan Metrics Row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#0b0f19]/80 border border-white/5 p-4 rounded-xl text-center">
                  <div className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Tổng tệp tin</div>
                  <div className="text-base font-bold text-white mt-1 truncate">{file.name}</div>
                </div>
                <div className="bg-[#0b0f19]/80 border border-white/5 p-4 rounded-xl text-center">
                  <div className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Dung lượng quét</div>
                  <div className="text-base font-bold text-white mt-1 font-mono">
                    {(totalScannedSize / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
                <div className="bg-[#0b0f19]/80 border border-white/5 p-4 rounded-xl text-center">
                  <div className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Chữ ký khớp</div>
                  <div className={`text-base font-bold mt-1 ${results.length > 0 ? 'text-red-400 animate-pulse' : 'text-green-400'}`}>
                    {results.length}
                  </div>
                </div>
              </div>

              {/* AI Deep Summary Trigger */}
              {results.length > 0 && (
                <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-5 space-y-3 relative overflow-hidden shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Lớp nhận diện thông minh (AI Summary Layer)</span>
                    </div>
                    {!aiSummary && !aiLoading && (
                      <button
                        onClick={handleGenerateAISummary}
                        className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        Báo cáo AI
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {aiLoading && (
                    <div className="flex items-center space-x-2 text-xs text-white/50 py-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                      <span>Đang phân tích cấu trúc nhị phân và tổng hợp kết quả...</span>
                    </div>
                  )}

                  {aiSummary && (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className="p-3 bg-black/40 border border-white/5 rounded-xl text-xs text-white/80 leading-relaxed font-sans"
                    >
                      <div className="flex items-center space-x-1.5 text-[10px] font-mono text-purple-300 uppercase tracking-widest mb-1.5">
                        <Terminal className="w-3 h-3" />
                        <span>AI Analyst Terminal:</span>
                      </div>
                      {aiSummary}
                    </motion.div>
                  )}
                </div>
              )}

              {/* Matches List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5" /> Danh sách kết quả chi tiết
                </h3>

                {results.length === 0 ? (
                  <div className="bg-[#0b0f19]/60 border border-green-500/10 rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-2">
                    <CheckCircle className="w-10 h-10 text-green-500/40" />
                    <span className="text-xs font-bold text-green-400">Trạng thái tệp tin: SẠCH</span>
                    <p className="text-[11px] text-white/40 max-w-xs leading-relaxed mt-1">
                      Không phát hiện bất cứ điểm trùng khớp chữ ký nào của tệp tin với bộ luật rà soát hiện tại.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {results.map((result) => {
                      const isHighConf = result.confidence >= 90;
                      const isMedConf = result.confidence >= 60 && result.confidence < 90;
                      
                      const badgeColor = isHighConf 
                        ? 'bg-red-500/10 text-red-400 border-red-500/30' 
                        : isMedConf 
                          ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' 
                          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';

                      return (
                        <div 
                          key={result.ruleName} 
                          className={`bg-[#0b0f19]/80 border rounded-2xl p-4 space-y-3 shadow-md transition-all hover:border-white/10 ${
                            isHighConf ? 'border-red-500/10 hover:shadow-red-950/5' : 'border-white/5'
                          }`}
                        >
                          {/* Header of Match Block */}
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${isHighConf ? 'bg-red-500' : isMedConf ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                                <h4 className="font-bold text-white text-xs">{result.ruleName}</h4>
                              </div>
                              <p className="text-[11px] text-white/50 mt-1">{result.description}</p>
                            </div>

                            <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border uppercase tracking-wider shrink-0 ${badgeColor}`}>
                              Độ tin cậy: {result.confidence}%
                            </span>
                          </div>

                          {/* Pattern Details inside Block */}
                          <div className="space-y-2 pt-2 border-t border-white/5">
                            <div className="text-[10px] text-white/30 font-semibold tracking-wider uppercase">Vị trí Pattern khớp ({result.matches.length}):</div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                              {result.matches.map((match, idx) => (
                                <div 
                                  key={idx}
                                  className="flex items-center justify-between p-2 bg-black/30 hover:bg-black/50 border border-white/5 rounded-lg text-xs"
                                >
                                  <div className="font-mono text-[10px] text-white/40 space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-purple-400 font-bold">{match.patternId}</span>
                                      <span>({match.type})</span>
                                    </div>
                                    <div className="text-white/70 font-bold truncate max-w-[160px]" title="Dữ liệu khớp">
                                      {match.preview}
                                    </div>
                                  </div>

                                  {/* Jump Button */}
                                  <button
                                    onClick={() => {
                                      onJumpToOffset(match.offset);
                                      toast(`Đang nhảy đến Offset: 0x${match.offset.toString(16).toUpperCase()}`, "info");
                                    }}
                                    className="px-2 py-1 bg-white/5 hover:bg-purple-600 hover:text-white rounded text-[10px] font-mono text-purple-400 flex items-center gap-1 border border-white/5 transition-colors cursor-pointer"
                                  >
                                    0x{match.offset.toString(16).toUpperCase()}
                                    <ArrowUpRight className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
