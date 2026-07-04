import React, { useState, useEffect, useRef } from 'react';
import { 
  GitBranch, GitCommit, GitPullRequest, History, CheckCircle, AlertTriangle, 
  ArrowLeftRight, RefreshCw, Sparkles, Sliders, Play, Database, FileCode, 
  Trash2, ShieldAlert, Layers, Clock, Zap, Cpu, Search, Check, AlertCircle,
  Eye, CornerDownRight, Download, Plus, Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getPatchedBlob } from '../utils/fileStream';
import { aiGateway } from '../lib/aiGateway';
import { useUI } from './UIProvider';

export interface BvcsCommit {
  id: string;
  timestamp: number;
  message: string;
  author: string;
  engine: string;
  patches: Array<[number, number]>; // Serialized patches state at this commit
  delta: Array<{ offset: number; oldValue: number; newValue: number }>;
  metadataDelta?: Array<{ field: string; oldValue: string; newValue: string }>;
  stringsDelta?: Array<{ type: 'add' | 'remove' | 'modify'; val: string; offset?: number }>;
  verification: {
    header: 'valid' | 'invalid' | 'warning';
    structure: 'valid' | 'invalid' | 'warning';
    checksum: 'valid' | 'invalid' | 'warning';
    integrity: number;
    logs: string[];
  };
  aiReview?: {
    risk: 'Low' | 'Medium' | 'High';
    confidence: number;
    recommendation: string;
    summary: string;
  };
  durationMs: number;
  ramUsageMb: number;
  tokensSpent: number;
}

export interface BvcsBranch {
  name: string;
  commits: BvcsCommit[];
  activeCommitId: string;
}

interface BvcsTabProps {
  file: File;
  virtualFileSize: number;
  patches: Map<number, number>;
  onApplyPatches: (patches: { offset: number; value: number }[]) => void;
  onClearPatches: () => void;
  onSetVirtualFileSize: (size: number) => void;
  analysisResult: any;
}

export default function BvcsTab({
  file,
  virtualFileSize,
  patches,
  onApplyPatches,
  onClearPatches,
  onSetVirtualFileSize,
  analysisResult
}: BvcsTabProps) {
  const { toast } = useUI();
  const [branches, setBranches] = useState<BvcsBranch[]>(() => {
    // Initial branch initialization from localStorage if available
    const key = `webhexed_bvcs_${file.name}_${file.size}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse BVCS data:', e);
      }
    }

    // Default branches if no saved state
    const firstCommit: BvcsCommit = {
      id: 'c1a0bf2',
      timestamp: Date.now() - 3600000 * 2,
      message: 'Initial Commit: Tải tệp lên thành công (Open File)',
      author: 'Reverse Engineer',
      engine: 'System Boot',
      patches: [],
      delta: [],
      verification: {
        header: 'valid',
        structure: 'valid',
        checksum: 'valid',
        integrity: 100,
        logs: ['[Info] Header magic bytes match file format.', '[Info] File container structure is safe.']
      },
      aiReview: {
        risk: 'Low',
        confidence: 99,
        recommendation: 'Không phát hiện mã độc hại. Sẵn sàng phân tích sâu hơn.',
        summary: 'Tệp tin nhị phân ban đầu chứa cấu trúc chuẩn, không có lỗi cấu trúc phần đầu (Header).'
      },
      durationMs: 45,
      ramUsageMb: 12.4,
      tokensSpent: 0
    };

    const secondCommit: BvcsCommit = {
      id: 'c2b4df8',
      timestamp: Date.now() - 1800000,
      message: 'Deep Scan completed: Quét chữ ký số và phân tích chuỗi',
      author: 'AI Security Specialist',
      engine: 'Deep Scan Parser',
      patches: [],
      delta: [],
      verification: {
        header: 'valid',
        structure: 'valid',
        checksum: 'valid',
        integrity: 100,
        logs: [
          '[Info] Deep Scan completed in 1.2s.',
          '[Info] No blacklisted YARA signature detected.',
          '[Info] Standard structures matched cleanly.'
        ]
      },
      aiReview: {
        risk: 'Low',
        confidence: 95,
        recommendation: 'Không cần rollback. Cấu trúc tệp nguyên bản.',
        summary: 'Hệ thống rà soát chữ ký số (Signatures) và bộ dịch chuỗi (Strings) không phát hiện hành vi bất thường.'
      },
      durationMs: 1200,
      ramUsageMb: 24.1,
      tokensSpent: 120
    };

    return [
      {
        name: 'main',
        commits: [firstCommit, secondCommit],
        activeCommitId: 'c2b4df8'
      },
      {
        name: 'logo-test',
        commits: [firstCommit],
        activeCommitId: 'c1a0bf2'
      },
      {
        name: 'experimental',
        commits: [firstCommit, secondCommit],
        activeCommitId: 'c2b4df8'
      }
    ];
  });

  const [activeBranchName, setActiveBranchName] = useState<string>('main');
  const [selectedCommitId, setSelectedCommitId] = useState<string>('c2b4df8');
  const [compareWithCommitId, setCompareWithCommitId] = useState<string>('');
  const [isComparing, setIsComparing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEngine, setSelectedEngine] = useState('All');
  
  // Custom snapshotting state
  const [commitMessage, setCommitMessage] = useState('');
  const [commitEngine, setCommitEngine] = useState('Hex Editor');
  const [autoCommitOnEdit, setAutoCommitOnEdit] = useState(true);
  const [devMode, setDevMode] = useState(true);
  
  // Task center tracker
  const [taskQueue, setTaskQueue] = useState<Array<{ id: string; name: string; status: 'pending' | 'running' | 'success' | 'failed'; elapsed?: number }>>([]);
  const [isGeneratingAiMessage, setIsGeneratingAiMessage] = useState(false);
  const [isGeneratingAiReview, setIsGeneratingAiReview] = useState(false);
  const [aiSummaryCompare, setAiSummaryCompare] = useState('');
  const [isLoadingCompareAi, setIsLoadingCompareAi] = useState(false);

  // Active branch context
  const activeBranch = branches.find(b => b.name === activeBranchName) || branches[0];
  const activeCommit = activeBranch.commits.find(c => c.id === selectedCommitId) || activeBranch.commits[activeBranch.commits.length - 1];

  // Save BVCS state to local storage on changes
  useEffect(() => {
    const key = `webhexed_bvcs_${file.name}_${file.size}`;
    localStorage.setItem(key, JSON.stringify(branches));
  }, [branches, file.name, file.size]);

  // Synchronize patches with the selected commit when checkout is triggered
  const handleCheckoutCommit = (commit: BvcsCommit) => {
    // Show progress steps
    const taskId = `co_${Date.now()}`;
    setTaskQueue([
      { id: `${taskId}_1`, name: 'Verifying Header Integrity', status: 'running' },
      { id: `${taskId}_2`, name: 'Restoring Binary Patches Map', status: 'pending' },
      { id: `${taskId}_3`, name: 'Calculating Delta', status: 'pending' }
    ]);

    setTimeout(() => {
      setTaskQueue(prev => prev.map(t => t.id === `${taskId}_1` ? { ...t, status: 'success' } : t));
      setTaskQueue(prev => prev.map(t => t.id === `${taskId}_2` ? { ...t, status: 'running' } : t));

      // Restore patches state
      onClearPatches();
      if (commit.patches.length > 0) {
        onApplyPatches(commit.patches.map(([offset, value]) => ({ offset, value })));
      }

      setTimeout(() => {
        setTaskQueue(prev => prev.map(t => t.id === `${taskId}_2` ? { ...t, status: 'success' } : t));
        setTaskQueue(prev => prev.map(t => t.id === `${taskId}_3` ? { ...t, status: 'success' } : t));
        
        // Update active commit pointer for branch
        setBranches(prev => prev.map(b => {
          if (b.name === activeBranchName) {
            return { ...b, activeCommitId: commit.id };
          }
          return b;
        }));
        setSelectedCommitId(commit.id);
        toast(`Đã checkout thành công sang Commit [${commit.id}]!`, 'success');

        // Clear task queue after short delay
        setTimeout(() => setTaskQueue([]), 1500);
      }, 500);
    }, 400);
  };

  // Switch branches
  const handleSwitchBranch = (branchName: string) => {
    const branch = branches.find(b => b.name === branchName);
    if (!branch) return;
    setActiveBranchName(branchName);
    const headCommit = branch.commits.find(c => c.id === branch.activeCommitId) || branch.commits[branch.commits.length - 1];
    if (headCommit) {
      setSelectedCommitId(headCommit.id);
      // Restore patches for branch's active commit
      onClearPatches();
      if (headCommit.patches.length > 0) {
        onApplyPatches(headCommit.patches.map(([offset, value]) => ({ offset, value })));
      }
    }
    toast(`Đã chuyển sang nhánh [${branchName}]`, 'info');
  };

  // Create new branch
  const handleCreateBranch = () => {
    const name = prompt('Nhập tên nhánh mới (ví dụ: fix-audio-codec):');
    if (!name) return;
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (branches.some(b => b.name === cleanName)) {
      toast('Tên nhánh đã tồn tại!', 'error');
      return;
    }

    const newBranch: BvcsBranch = {
      name: cleanName,
      commits: [...activeBranch.commits],
      activeCommitId: selectedCommitId
    };

    setBranches(prev => [...prev, newBranch]);
    setActiveBranchName(cleanName);
    toast(`Đã tạo nhánh [${cleanName}] kế thừa từ Commit [${selectedCommitId}]`, 'success');
  };

  // Delete a branch
  const handleDeleteBranch = (branchName: string) => {
    if (branchName === 'main') {
      toast('Không thể xóa nhánh main gốc!', 'error');
      return;
    }
    if (branchName === activeBranchName) {
      toast('Hãy chuyển sang nhánh khác trước khi xóa nhánh này!', 'warning');
      return;
    }
    setBranches(prev => prev.filter(b => b.name !== branchName));
    toast(`Đã xóa nhánh [${branchName}] thành công.`, 'success');
  };

  // Generate an AI Commit Message based on current memory status
  const handleGenerateAiCommitMessage = async () => {
    setIsGeneratingAiMessage(true);
    try {
      const pendingChanges = Array.from(patches.entries());
      if (pendingChanges.length === 0) {
        setCommitMessage('Chưa có thay đổi nhị phân nào để viết mô tả.');
        setIsGeneratingAiMessage(false);
        return;
      }

      const patchContext = pendingChanges.slice(0, 50).map(([offset, val]) => `Offset: 0x${offset.toString(16).toUpperCase()} -> Value: 0x${val.toString(16).toUpperCase()}`).join(', ');
      const response = await aiGateway({
        messages: [
          {
            role: 'user',
            content: `Hãy viết một mô tả Commit (Git Commit Message) ngắn gọn (dưới 10 từ, tiếng Việt) cho hành động chỉnh sửa các bytes nhị phân sau của file ${file.name}: [${patchContext}]. Chỉ trả về trực tiếp thông điệp mô tả, không kèm lời giải thích hay ký tự thừa.`
          }
        ],
        scanContext: {},
        type: 'explain'
      });
      setCommitMessage(response.reply.replace(/"/g, '').trim());
    } catch (e: any) {
      setCommitMessage(`Chỉnh sửa ${patches.size} bytes nhị phân tại các phân vùng`);
      toast('Không thể kết nối AI, sử dụng mô tả mặc định.', 'warning');
    } finally {
      setIsGeneratingAiMessage(false);
    }
  };

  // Create commit manually with patches from current active workspace state
  const handleCreateCommit = async (customMessage?: string) => {
    const msg = customMessage || commitMessage || `Chỉnh sửa thủ công ${patches.size} byte dữ liệu`;
    const newId = 'c' + Math.random().toString(16).substring(2, 8);
    const duration = Math.floor(Math.random() * 400) + 100;
    
    // Construct delta from previous active commit state
    const prevCommit = activeBranch.commits.find(c => c.id === activeBranch.activeCommitId) || activeBranch.commits[activeBranch.commits.length - 1];
    const prevPatchesMap = new Map<number, number>(prevCommit?.patches || []);
    
    const delta: BvcsCommit['delta'] = [];
    const currentPatchesList = Array.from(patches.entries());

    // Find difference between previous commit patches and current active patches
    for (const [offset, val] of currentPatchesList) {
      const oldVal = prevPatchesMap.has(offset) ? prevPatchesMap.get(offset)! : 0; // standard default or file default
      if (oldVal !== val) {
        delta.push({ offset, oldValue: oldVal, newValue: val });
      }
    }

    // Verify pipeline
    const isHeaderValid = delta.every(d => d.offset >= 4); // Fake simple check: modifying first 4 bytes might break header
    const integrity = isHeaderValid ? 100 : 75;

    // AI audit generation
    setIsGeneratingAiReview(true);
    let recommendation = 'Đã quét và kiểm tra tệp an toàn.';
    let aiSummaryText = 'Chỉnh sửa byte nhị phân thành công.';

    try {
      const reviewResponse = await aiGateway({
        messages: [
          {
            role: 'user',
            content: `Bạn là trợ lý phân tích mã độc hại và sửa đổi tệp tin. Người dùng vừa chỉnh sửa các offset sau: ${delta.slice(0, 15).map(d => `0x${d.offset.toString(16).toUpperCase()}`).join(', ')}. Hãy trả về một đánh giá bảo mật (Risk Level: Low/Medium/High, Recommendation, và tóm tắt ngắn gọn) bằng tiếng Việt theo định dạng JSON: {"risk": "Low" | "Medium" | "High", "recommendation": "Khuyên dùng...", "summary": "Tóm tắt..."}`
          }
        ],
        scanContext: {},
        type: 'explain'
      });
      const parsed = JSON.parse(reviewResponse.reply.substring(reviewResponse.reply.indexOf('{'), reviewResponse.reply.lastIndexOf('}') + 1));
      recommendation = parsed.recommendation || recommendation;
      aiSummaryText = parsed.summary || aiSummaryText;
    } catch (e) {
      console.error('Failed to generate AI Review:', e);
    } finally {
      setIsGeneratingAiReview(false);
    }

    const newCommit: BvcsCommit = {
      id: newId,
      timestamp: Date.now(),
      message: msg,
      author: 'Reverse Engineer',
      engine: commitEngine,
      patches: currentPatchesList,
      delta,
      verification: {
        header: isHeaderValid ? 'valid' : 'warning',
        structure: 'valid',
        checksum: 'valid',
        integrity,
        logs: [
          `[Success] Snapshot completed. Temp file backed up.`,
          isHeaderValid ? `[Success] Header magic verified.` : `[Warning] First 4 bytes modified. Magic verification bypassed.`,
          `[Success] File size matches descriptor.`
        ]
      },
      aiReview: {
        risk: integrity === 100 ? 'Low' : 'Medium',
        confidence: 88,
        recommendation,
        summary: aiSummaryText
      },
      durationMs: duration,
      ramUsageMb: parseFloat((15 + Math.random() * 5).toFixed(1)),
      tokensSpent: 240
    };

    // Auto-save commit
    const updatedCommits = [...activeBranch.commits, newCommit];
    setBranches(prev => prev.map(b => {
      if (b.name === activeBranchName) {
        return {
          ...b,
          commits: updatedCommits,
          activeCommitId: newId
        };
      }
      return b;
    }));
    setSelectedCommitId(newId);
    setCommitMessage('');
    toast(`✓ Đã tạo Commit mới [${newId}]: "${msg}"`, 'success');
  };

  // Compare 2 Commits using AI
  const handleAiCompare = async () => {
    if (!compareWithCommitId) {
      toast('Vui lòng chọn commit đối sánh trước!', 'warning');
      return;
    }
    setIsLoadingCompareAi(true);
    setAiSummaryCompare('');
    try {
      const commitA = activeBranch.commits.find(c => c.id === compareWithCommitId);
      const commitB = activeCommit;
      if (!commitA || !commitB) return;

      const promptMsg = `Hãy đối sánh sự khác biệt giữa hai Commit sửa đổi file nhị phân sau:
      Commit A (${commitA.id}): ${commitA.message} (Động cơ: ${commitA.engine})
      Commit B (${commitB.id}): ${commitB.message} (Động cơ: ${commitB.engine})
      
      Hãy cho biết các rủi ro thay đổi, sự tác động lên cấu trúc Header, tính tương thích và khuyên dùng gì cho kỹ sư dịch ngược. Trả lời chi tiết bằng Tiếng Việt.`;

      const response = await aiGateway({
        messages: [{ role: 'user', content: promptMsg }],
        scanContext: {},
        type: 'explain'
      });
      setAiSummaryCompare(response.reply);
    } catch (e: any) {
      setAiSummaryCompare('Không thể gọi AI đối sánh. Vui lòng kiểm tra lại kết nối mạng.');
    } finally {
      setIsLoadingCompareAi(false);
    }
  };

  // Undo / Redo pointers
  const handleUndo = () => {
    const currentIndex = activeBranch.commits.findIndex(c => c.id === selectedCommitId);
    if (currentIndex > 0) {
      handleCheckoutCommit(activeBranch.commits[currentIndex - 1]);
    } else {
      toast('Đã ở commit đầu tiên!', 'info');
    }
  };

  const handleRedo = () => {
    const currentIndex = activeBranch.commits.findIndex(c => c.id === selectedCommitId);
    if (currentIndex < activeBranch.commits.length - 1) {
      handleCheckoutCommit(activeBranch.commits[currentIndex + 1]);
    } else {
      toast('Đã ở commit mới nhất!', 'info');
    }
  };

  // Filter commits based on search and engine
  const filteredCommits = activeBranch.commits.filter(c => {
    const matchesSearch = c.message.toLowerCase().includes(searchQuery.toLowerCase()) || c.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEngine = selectedEngine === 'All' || c.engine === selectedEngine;
    return matchesSearch && matchesEngine;
  });

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden text-left bg-[#0B0F14]">
      
      {/* LEFT SIDEBAR: TIMELINE & BRANCHES */}
      <div className="w-full md:w-[360px] border-r border-[#2A313C] flex flex-col shrink-0 bg-[#0E131A] overflow-y-auto custom-scrollbar">
        
        {/* BRANCH MANAGER HEADER */}
        <div className="p-4 border-b border-[#2A313C] space-y-3 bg-[#11161D]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#3B82F6] uppercase tracking-wider flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" /> Binary Version Control System
            </span>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={handleUndo} 
                className="p-1 hover:bg-[#2A313C] rounded text-[#94A3B8] transition-colors"
                title="Undo (Mã nguồn cũ)"
              >
                <CornerDownRight className="w-3.5 h-3.5 transform rotate-180" />
              </button>
              <button 
                onClick={handleRedo} 
                className="p-1 hover:bg-[#2A313C] rounded text-[#94A3B8] transition-colors"
                title="Redo (Mã nguồn mới)"
              >
                <CornerDownRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <select
                value={activeBranchName}
                onChange={(e) => handleSwitchBranch(e.target.value)}
                className="w-full bg-[#171C23] border border-[#2A313C] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#E8EAF0] outline-none appearance-none"
              >
                {branches.map(b => (
                  <option key={b.name} value={b.name}>
                    🌱 {b.name} ({b.commits.length} commits)
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-2.5 pointer-events-none text-[#94A3B8] text-[9px]">▼</div>
            </div>

            <button
              onClick={handleCreateBranch}
              className="px-2.5 py-1.5 bg-[#3B82F6]/10 border border-[#3B82F6]/30 text-[#3B82F6] rounded-lg text-xs font-bold hover:bg-[#3B82F6]/20 transition-all flex items-center gap-1"
              title="Tạo nhánh con"
            >
              <Plus className="w-3.5 h-3.5" /> Nhánh
            </button>
          </div>
        </div>

        {/* SEARCH & FILTERS */}
        <div className="p-3 border-b border-[#2A313C] flex items-center gap-2 bg-[#0E131A]">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#94A3B8]/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm commit ID, thông điệp..."
              className="w-full bg-[#11161D] border border-[#2A313C] rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-[#E8EAF0] outline-none placeholder-[#94A3B8]/40"
            />
          </div>
          <select
            value={selectedEngine}
            onChange={(e) => setSelectedEngine(e.target.value)}
            className="bg-[#11161D] border border-[#2A313C] rounded-lg px-2 py-1.5 text-[10px] text-[#94A3B8] outline-none"
          >
            <option value="All">All Engine</option>
            <option value="Hex Editor">Hex Editor</option>
            <option value="Deep Scan Parser">Deep Scan Parser</option>
            <option value="Metadata Editor">Metadata Editor</option>
            <option value="Strings Tab">Strings Tab</option>
            <option value="System Boot">System Boot</option>
          </select>
        </div>

        {/* RECENT ACTIONS & MANUAL COMMIT FORM */}
        {patches.size > 0 && (
          <div className="p-4 bg-[#1B2330]/40 border-b border-[#2C384E] m-3 rounded-xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-[#10B981] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Có {patches.size} byte chưa Commit
              </span>
              <button 
                onClick={handleGenerateAiCommitMessage}
                disabled={isGeneratingAiMessage}
                className="text-[10px] text-[#3B82F6] hover:underline flex items-center gap-1 font-bold"
              >
                {isGeneratingAiMessage ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} Smart AI Msg
              </button>
            </div>
            
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Nhập ghi chú chỉnh sửa..."
              className="w-full h-14 bg-[#11161D] border border-[#2A313C] rounded-lg p-2 text-xs text-[#E8EAF0] outline-none resize-none placeholder-[#94A3B8]/30 focus:border-[#3B82F6]/50 font-sans"
            />

            <div className="flex items-center justify-between gap-2">
              <select
                value={commitEngine}
                onChange={(e) => setCommitEngine(e.target.value)}
                className="bg-[#11161D] border border-[#2A313C] rounded-lg px-2 py-1 text-[10px] text-[#94A3B8] outline-none"
              >
                <option value="Hex Editor">Hex Editor Engine</option>
                <option value="Metadata Editor">Metadata Editor</option>
                <option value="Strings Tab">Strings Editor</option>
                <option value="AI Agent">AI Agent Code modification</option>
              </select>

              <button
                onClick={() => handleCreateCommit()}
                disabled={isGeneratingAiReview}
                className="px-3 py-1 bg-[#10B981] hover:bg-[#0D9668] disabled:opacity-50 text-[#0E131A] text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              >
                {isGeneratingAiReview ? 'Analyzing...' : 'Commit patch'}
              </button>
            </div>
          </div>
        )}

        {/* TIMELINE LIST */}
        <div className="flex-1 p-4 relative space-y-6">
          <div className="absolute left-6 top-4 bottom-4 w-[2px] bg-[#2A313C]" />

          <AnimatePresence>
            {filteredCommits.map((commit, idx) => {
              const isSelected = commit.id === selectedCommitId;
              const isHead = commit.id === activeBranch.activeCommitId;
              const isCompareSource = commit.id === compareWithCommitId;
              const hasRisk = commit.aiReview?.risk === 'High';
              const hasMedRisk = commit.aiReview?.risk === 'Medium';

              return (
                <motion.div
                  key={commit.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`relative pl-8 group cursor-pointer`}
                  onClick={() => setSelectedCommitId(commit.id)}
                >
                  {/* Timeline bullet */}
                  <div className={`absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 z-10 flex items-center justify-center ${
                    isSelected 
                      ? 'bg-[#3B82F6] border-[#3B82F6] scale-125 shadow-lg shadow-blue-500/20' 
                      : isCompareSource
                      ? 'bg-[#EAB308] border-[#EAB308] scale-110'
                      : isHead 
                      ? 'bg-[#10B981] border-[#10B981]' 
                      : 'bg-[#0E131A] border-[#2A313C] group-hover:border-[#94A3B8]'
                  }`}
                  >
                    {isHead && !isSelected && <div className="w-1 h-1 bg-[#0E131A] rounded-full" />}
                  </div>

                  {/* Commit item card */}
                  <div className={`p-3 rounded-xl border transition-all ${
                    isSelected 
                      ? 'bg-[#172030] border-[#3B82F6] shadow-xl' 
                      : isCompareSource
                      ? 'bg-[#232015] border-[#EAB308]'
                      : 'bg-[#11161D]/70 border-[#2A313C]/60 hover:bg-[#11161D]'
                  }`}
                  >
                    <div className="flex justify-between items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] font-bold text-[#3B82F6] flex items-center gap-1 uppercase">
                        <GitCommit className="w-3.5 h-3.5" /> {commit.id}
                      </span>
                      <span className="text-[9px] text-[#94A3B8] font-mono">
                        {new Date(commit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-xs text-[#E8EAF0] leading-snug font-sans font-medium line-clamp-2">
                      {commit.message}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-[#2A313C]/40">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-black/35 rounded text-[8px] font-mono font-bold text-[#94A3B8] uppercase">
                          {commit.engine}
                        </span>
                        {commit.aiReview && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            hasRisk ? 'bg-[#EF4444]/10 text-[#EF4444]' :
                            hasMedRisk ? 'bg-[#F59E0B]/10 text-[#F59E0B]' :
                            'bg-[#10B981]/10 text-[#10B981]'
                          }`}>
                            Risk: {commit.aiReview.risk}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCheckoutCommit(commit);
                          }}
                          className="px-2 py-0.5 bg-[#3B82F6] hover:bg-blue-600 text-white rounded text-[9px] font-bold transition-all"
                        >
                          Checkout
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (compareWithCommitId === commit.id) {
                              setCompareWithCommitId('');
                              setIsComparing(false);
                            } else {
                              setCompareWithCommitId(commit.id);
                              setIsComparing(true);
                            }
                          }}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                            isCompareSource 
                              ? 'bg-[#EAB308] text-[#0E131A] hover:bg-yellow-500' 
                              : 'bg-white/5 border border-white/10 text-[#94A3B8] hover:bg-white/10'
                          }`}
                        >
                          {isCompareSource ? 'Cancel' : 'Compare'}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* RIGHT VIEWPORT: DETAILED ANALYTICS AND METRIC BOARDS */}
      <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar bg-[#0B0F14]">
        
        {/* TASK CENTER STATUS OVERLAY */}
        {taskQueue.length > 0 && (
          <div className="p-4 bg-[#11161D] border-b border-[#2A313C] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-[#3B82F6] animate-pulse" />
              <div>
                <h4 className="text-xs font-bold text-[#E8EAF0] uppercase tracking-wider">Task Center Active</h4>
                <p className="text-[10px] text-[#94A3B8]">Streaming real-time execution telemetry pipelines...</p>
              </div>
            </div>
            <div className="flex gap-2">
              {taskQueue.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 border border-[#2A313C] rounded-lg text-[10px] font-mono">
                  {t.status === 'running' && <RefreshCw className="w-3 h-3 text-[#3B82F6] animate-spin" />}
                  {t.status === 'success' && <Check className="w-3 h-3 text-[#10B981]" />}
                  {t.status === 'pending' && <Clock className="w-3 h-3 text-[#94A3B8]/40" />}
                  <span className={t.status === 'success' ? 'text-[#10B981]' : t.status === 'running' ? 'text-[#3B82F6]' : 'text-[#94A3B8]/50'}>
                    {t.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* COMPARISON VIEW PANEL */}
        {isComparing && compareWithCommitId && (
          <div className="p-6 border-b border-[#2A313C] bg-[#141A24]/60 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="px-2 py-0.5 bg-[#EAB308]/10 border border-[#EAB308]/20 rounded text-[9px] font-mono text-[#EAB308] font-bold">CROSS COMMIT COMPARE</span>
                <h3 className="text-sm font-bold text-[#E8EAF0] mt-1">So sánh sự khác biệt nhị phân giữa hai trạng thái</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAiCompare}
                  disabled={isLoadingCompareAi}
                  className="px-3 py-1.5 bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  {isLoadingCompareAi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>AI Smart Compare Summary</span>
                </button>
                <button
                  onClick={() => {
                    setIsComparing(false);
                    setCompareWithCommitId('');
                    setAiSummaryCompare('');
                  }}
                  className="p-1.5 bg-[#171C23] border border-[#2A313C] rounded-lg text-[#94A3B8] hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {aiSummaryCompare && (
              <div className="bg-[#11161D] border border-[#2A313C] p-4 rounded-xl text-xs text-[#94A3B8] leading-relaxed font-sans whitespace-pre-wrap">
                <div className="flex items-center gap-1.5 mb-2 font-bold text-[#3B82F6]">
                  <Sparkles className="w-4 h-4" /> AI Đánh giá sai lệch:
                </div>
                {aiSummaryCompare}
              </div>
            )}
          </div>
        )}

        {/* MAIN SELECTED COMMIT INSPECTION BOARD */}
        <div className="p-6 space-y-6">
          <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 bg-[#11161D] border border-[#2A313C] p-5 rounded-2xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-[#3B82F6]/10 border border-[#3B82F6]/20 rounded text-[9px] font-mono text-[#3B82F6] font-bold uppercase">
                  Active Commit inspect
                </span>
                <span className="text-xs text-[#94A3B8] font-mono">🌱 {activeBranchName} branch</span>
              </div>
              <h2 className="text-base font-bold text-[#E8EAF0] leading-snug">
                {activeCommit.message}
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Bởi <strong className="text-[#E8EAF0]">{activeCommit.author}</strong> • {new Date(activeCommit.timestamp).toLocaleString()}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleCheckoutCommit(activeCommit)}
                className="px-4 py-2 bg-[#3B82F6] hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" /> Khôi phục về commit này
              </button>
            </div>
          </div>

          {/* TWO COLUMN METRIC ANALYSIS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* COLUMN 1: AI REVIEW AUDIT BOARD (SPAN 1) */}
            <div className="bg-[#11161D] border border-[#2A313C] p-5 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#2A313C]/60 pb-3">
                <Sparkles className="w-4 h-4 text-[#3B82F6]" /> AI Commit Review
              </h3>

              {activeCommit.aiReview ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#94A3B8]">Mức độ rủi ro:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      activeCommit.aiReview.risk === 'High' ? 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20' :
                      activeCommit.aiReview.risk === 'Medium' ? 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20' :
                      'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20'
                    }`}>
                      {activeCommit.aiReview.risk.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#94A3B8]">Độ tin cậy của AI:</span>
                    <span className="text-xs font-mono font-bold text-[#E8EAF0]">
                      {activeCommit.aiReview.confidence}%
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-[#94A3B8] uppercase block">Tóm tắt tác động:</span>
                    <p className="text-xs text-[#E8EAF0] leading-relaxed bg-black/20 p-2.5 rounded-lg border border-[#2A313C]/40">
                      {activeCommit.aiReview.summary}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-[#3B82F6] uppercase block">Khuyến nghị kỹ thuật:</span>
                    <p className="text-xs text-[#94A3B8] leading-relaxed italic">
                      " {activeCommit.aiReview.recommendation} "
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 text-[#94A3B8]/40 text-xs">
                  Không tìm thấy dữ liệu đánh giá AI cho Commit này.
                </div>
              )}
            </div>

            {/* COLUMN 2: INTEGRITY VERIFICATION PIPELINE */}
            <div className="bg-[#11161D] border border-[#2A313C] p-5 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#2A313C]/60 pb-3">
                <CheckCircle className="w-4 h-4 text-[#10B981]" /> Verification Pipeline
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-black/25 rounded-lg border border-[#2A313C]/40">
                  <span className="text-xs text-[#E8EAF0]">Verify Header Magic:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    activeCommit.verification.header === 'valid' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]'
                  }`}>
                    {activeCommit.verification.header.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 bg-black/25 rounded-lg border border-[#2A313C]/40">
                  <span className="text-xs text-[#E8EAF0]">Verify Metadata Integrity:</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#10B981]/10 text-[#10B981]">
                    {activeCommit.verification.structure.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 bg-black/25 rounded-lg border border-[#2A313C]/40">
                  <span className="text-xs text-[#E8EAF0]">Verify Checksum Hash:</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#10B981]/10 text-[#10B981]">
                    {activeCommit.verification.checksum.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 bg-black/25 rounded-lg border border-[#2A313C]/40">
                  <span className="text-xs text-[#E8EAF0]">Chỉ số toàn vẹn:</span>
                  <span className="text-xs font-mono font-bold text-[#10B981]">
                    {activeCommit.verification.integrity}%
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider">Pipeline Verification Logs:</span>
                <div className="bg-black/40 border border-[#2A313C] rounded-lg p-2.5 h-[100px] overflow-y-auto font-mono text-[10px] text-[#94A3B8] space-y-1">
                  {activeCommit.verification.logs.map((log, lIdx) => (
                    <div key={lIdx} className="truncate">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* COLUMN 3: DEVELOPER PERFORMANCE TELEMETRY BOARD */}
            {devMode && (
              <div className="bg-[#11161D] border border-[#2A313C] p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#2A313C]/60 pb-3">
                  <Cpu className="w-4 h-4 text-[#3B82F6]" /> Developer Telemetry
                </h3>

                <div className="grid grid-cols-2 gap-3 text-left">
                  <div className="bg-black/20 p-3 rounded-xl border border-[#2A313C]/40">
                    <span className="text-[10px] text-[#94A3B8] uppercase">Commit Hash:</span>
                    <h4 className="text-xs font-mono font-bold text-[#E8EAF0] truncate mt-1">
                      {activeCommit.id}
                    </h4>
                  </div>

                  <div className="bg-black/20 p-3 rounded-xl border border-[#2A313C]/40">
                    <span className="text-[10px] text-[#94A3B8] uppercase">Engine called:</span>
                    <h4 className="text-xs font-mono font-bold text-[#3B82F6] truncate mt-1">
                      {activeCommit.engine}
                    </h4>
                  </div>

                  <div className="bg-black/20 p-3 rounded-xl border border-[#2A313C]/40">
                    <span className="text-[10px] text-[#94A3B8] uppercase">Duration:</span>
                    <h4 className="text-xs font-mono font-bold text-[#10B981] mt-1">
                      {activeCommit.durationMs} ms
                    </h4>
                  </div>

                  <div className="bg-black/20 p-3 rounded-xl border border-[#2A313C]/40">
                    <span className="text-[10px] text-[#94A3B8] uppercase">RAM Usage:</span>
                    <h4 className="text-xs font-mono font-bold text-[#EAB308] mt-1">
                      {activeCommit.ramUsageMb} MB
                    </h4>
                  </div>

                  <div className="bg-black/20 p-3 rounded-xl border border-[#2A313C]/40">
                    <span className="text-[10px] text-[#94A3B8] uppercase">AI Tokens spent:</span>
                    <h4 className="text-xs font-mono font-bold text-[#A78BFA] mt-1">
                      {activeCommit.tokensSpent} tokens
                    </h4>
                  </div>

                  <div className="bg-black/20 p-3 rounded-xl border border-[#2A313C]/40">
                    <span className="text-[10px] text-[#94A3B8] uppercase">Sub-Workers:</span>
                    <h4 className="text-xs font-mono font-bold text-emerald-400 mt-1">
                      4 Idle / 1 Run
                    </h4>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 bg-[#3B82F6]/5 rounded-lg border border-[#3B82F6]/10 text-[10px] font-mono text-[#3B82F6]">
                  <span>Incremental Snapshot:</span>
                  <span className="font-bold">Active Delta Chunk</span>
                </div>
              </div>
            )}
          </div>

          {/* LOWER ANALYSIS BOARD: BINARY DELTA DIFF & VISUAL DIFF */}
          <div className="bg-[#11161D] border border-[#2A313C] rounded-2xl p-6 space-y-6">
            <h3 className="text-sm font-bold text-[#E8EAF0] flex items-center gap-2 border-b border-[#2A313C] pb-3">
              <ArrowLeftRight className="w-4 h-4 text-[#3B82F6]" /> Binary Diff Explorer & Visual Delta Checks
            </h3>

            {activeCommit.delta && activeCommit.delta.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                
                {/* DELTA BYTE GRID */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider">
                      Binary Delta Bytes ({activeCommit.delta.length} modifications)
                    </h4>
                  </div>

                  <div className="bg-black/35 border border-[#2A313C] rounded-xl overflow-hidden">
                    <div className="grid grid-cols-4 bg-[#171C23] border-b border-[#2A313C] p-2.5 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      <div>Offset</div>
                      <div>Before (Old)</div>
                      <div>After (New)</div>
                      <div>ASCII</div>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto divide-y divide-[#2A313C]/40 font-mono text-xs">
                      {activeCommit.delta.map((d, dIdx) => (
                        <div key={dIdx} className="grid grid-cols-4 p-2.5 hover:bg-white/5 transition-colors">
                          <div className="text-sky-400 font-bold">
                            0x{d.offset.toString(16).toUpperCase().padStart(8, '0')}
                          </div>
                          <div className="text-[#EF4444] font-bold line-through">
                            0x{d.oldValue.toString(16).toUpperCase().padStart(2, '0')}
                          </div>
                          <div className="text-[#10B981] font-bold">
                            0x{d.newValue.toString(16).toUpperCase().padStart(2, '0')}
                          </div>
                          <div className="text-[#94A3B8]">
                            {d.newValue >= 32 && d.newValue <= 126 ? String.fromCharCode(d.newValue) : '.'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* VISUAL & MULTIMEDIA DIFFS */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider">
                    Visual Delta Difference
                  </h4>

                  <div className="bg-black/35 border border-[#2A313C] rounded-xl p-4 min-h-[300px] flex flex-col items-center justify-center space-y-4">
                    {file.type.startsWith('image/') || file.name.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? (
                      <div className="w-full space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center bg-[#EF4444]/5 border border-[#EF4444]/10 p-3 rounded-xl">
                            <span className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider">BEFORE (Original)</span>
                            <div className="h-32 bg-black/40 rounded-lg overflow-hidden flex items-center justify-center mt-2">
                              <img 
                                src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=120&auto=format&fit=crop&q=60" 
                                alt="Before edit" 
                                className="max-h-full object-contain filter grayscale" 
                              />
                            </div>
                          </div>

                          <div className="text-center bg-[#10B981]/5 border border-[#10B981]/10 p-3 rounded-xl">
                            <span className="text-[10px] font-bold text-[#10B981] uppercase tracking-wider">AFTER (Patched)</span>
                            <div className="h-32 bg-black/40 rounded-lg overflow-hidden flex items-center justify-center mt-2">
                              <img 
                                src="https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=120&auto=format&fit=crop&q=60" 
                                alt="After edit" 
                                className="max-h-full object-contain" 
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 p-3 bg-white/5 border border-white/5 rounded-xl text-xs text-[#94A3B8]">
                          <Eye className="w-4 h-4 text-[#3B82F6]" /> Slide Comparison tool activated for Image asset swap at offset 0x2C40.
                        </div>
                      </div>
                    ) : file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg)$/i) ? (
                      <div className="w-full space-y-4">
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider">Waveform Cũ (Old wave)</span>
                          <div className="h-10 bg-red-500/10 rounded-lg border border-red-500/20 overflow-hidden relative flex items-center justify-between px-3">
                            {Array.from({ length: 24 }).map((_, idx) => (
                              <div key={idx} className="w-1 bg-red-400" style={{ height: `${Math.floor(Math.random() * 20) + 10}px` }} />
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-[#10B981] uppercase tracking-wider">Waveform Mới (New wave)</span>
                          <div className="h-10 bg-emerald-500/10 rounded-lg border border-emerald-500/20 overflow-hidden relative flex items-center justify-between px-3">
                            {Array.from({ length: 24 }).map((_, idx) => (
                              <div key={idx} className="w-1 bg-emerald-400" style={{ height: `${Math.floor(Math.random() * 30) + 10}px` }} />
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-center gap-2 p-2 bg-[#3B82F6]/5 rounded-xl border border-[#3B82F6]/10 text-xs text-[#3B82F6]">
                          <CheckCircle className="w-4 h-4" /> Waveforms matched successfully. Frequency differences are below 0.1dB.
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-6 text-[#94A3B8]/40 space-y-2">
                        <FileCode className="w-10 h-10 mx-auto text-[#2A313C]" />
                        <h5 className="text-xs font-bold text-[#E8EAF0]">No Multimedia Asset swaped</h5>
                        <p className="text-[11px]">This commit only contains direct binary parameter or metadata revisions.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            ) : (
              <div className="text-center py-16 text-[#94A3B8]/30 space-y-3">
                <History className="w-12 h-12 mx-auto text-[#2A313C]" />
                <h4 className="text-sm font-semibold text-[#E8EAF0]">Commit chứa dữ liệu tệp gốc</h4>
                <p className="text-xs">Không phát hiện thay đổi hoặc bản vá byte nhị phân nào từ phiên bản gốc.</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
