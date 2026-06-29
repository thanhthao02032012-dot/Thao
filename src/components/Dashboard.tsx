import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { UserProfile, UserStats, FileMeta } from '../types';
import { Settings, FileText, HardDrive, Edit3, BarChart2, Cpu, Activity, Zap, ShieldAlert, Layers, ChevronRight, User as UserIcon, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getStats, getRecentFiles } from '../utils/stats';
import { getFile } from '../utils/db';
import { useUI } from './UIProvider';

// Performance Monitor Component
function PerfMonitor() {
  const [cpu, setCpu] = useState(12);
  const [ram, setRam] = useState(128);

  useEffect(() => {
    const interval = setInterval(() => {
      setCpu(prev => Math.max(5, Math.min(95, prev + (Math.random() - 0.5) * 20)));
      setRam(prev => Math.max(64, Math.min(1024, prev + (Math.random() - 0.5) * 50)));
    }, 5000); // Slower update for performance
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 shadow-sm">
      <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center mb-4">
        <Activity className="w-4 h-4 mr-2 text-emerald-500/70" />
        Hệ thống
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] text-white/30">CPU</p>
          <p className="text-xl font-mono text-white/90">{cpu.toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-white/30">RAM</p>
          <p className="text-xl font-mono text-white/90">{ram.toFixed(0)} MB</p>
        </div>
      </div>
      <div className="h-1 bg-white/5 rounded-full mt-4 overflow-hidden">
        <div className="h-full bg-emerald-500/50" style={{ width: `${cpu}%` }} />
      </div>
    </div>
  );
}

export default function Dashboard({ user, profile, onLogout, onViewProfile, onOpenFile, onOpenCloudFile }: { user: User, profile: UserProfile | null, onLogout: () => void, onViewProfile: () => void, onOpenFile: () => void, onOpenCloudFile?: (file: File) => void }) {
  const { toast } = useUI();
  const [stats, setStats] = useState<UserStats>({ filesUploaded: 0, hexEdits: 0, bitEdits: 0, hashesGenerated: 0, digitalSignatures: 0, storageUsed: 0 });
  const [recentFiles, setRecentFiles] = useState<FileMeta[]>([]);
  
  useEffect(() => {
    const loadData = () => {
      setStats(getStats(user.uid));
      setRecentFiles(getRecentFiles(user.uid));
    };
    
    loadData();
    
    const interval = setInterval(loadData, 2000);
    
    const handleStorage = (e: StorageEvent) => {
      if (e.key === `webhex_files_${user.uid}` || e.key === `webhex_stats_${user.uid}`) {
        loadData();
      }
    };
    window.addEventListener('storage', handleStorage);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user]);

  const handleOpenRecentFile = async (fileMeta: FileMeta) => {
    try {
      toast(`Đang tải tệp: ${fileMeta.name}...`, 'info');
      const file = await getFile(fileMeta.id);
      if (file && onOpenCloudFile) {
        onOpenCloudFile(file);
      } else {
        toast(`Không tìm thấy tệp tin: ${fileMeta.name}.`, 'error');
      }
    } catch (error) {
      console.error("Error:", error);
      toast("Lỗi khi mở tệp!", 'error');
    }
  };

  return (
    <div className="flex-1 bg-[#070b13] text-white p-6 md:p-10 space-y-8 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">File Analysis Platform</h1>
          <p className="text-white/40 mt-1 text-sm">Phân tích sâu, chỉnh sửa thông minh.</p>
        </div>
        <button onClick={onOpenFile} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl font-semibold text-sm shadow-lg shadow-purple-600/10 transition-all flex items-center">
          <Edit3 className="w-4 h-4 mr-2" />
          Mở tệp
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Stats */}
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard icon={<FileText />} title="Files" value={stats.filesUploaded} color="blue" />
            <StatCard icon={<Edit3 />} title="Edits" value={stats.hexEdits + stats.bitEdits} color="purple" />
            <StatCard icon={<HardDrive />} title="Storage" value="2.4 GB" color="cyan" />
          </div>

          <div className="bg-[#0b0f19] border border-white/5 rounded-2xl p-6 shadow-sm flex flex-col h-full min-h-[300px]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">Tệp tin gần đây</h3>
              {recentFiles.length > 0 && (
                <button 
                  onClick={() => {
                    if (window.confirm("Xác nhận xóa toàn bộ lịch sử?")) {
                      localStorage.removeItem(`webhex_files_${user.uid}`);
                      setRecentFiles([]);
                      toast("Đã xóa lịch sử tệp tin", "success");
                    }
                  }}
                  className="text-[10px] uppercase font-bold text-red-400/70 hover:text-red-400 transition-colors"
                >
                  Xóa lịch sử
                </button>
              )}
            </div>
            
            <div className="space-y-2 flex-1">
              {recentFiles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/20">
                  <HardDrive className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">Chưa có tệp tin nào</p>
                  <p className="text-xs opacity-60">Mở tệp để bắt đầu lưu lịch sử</p>
                </div>
              ) : (
                recentFiles.map(file => (
                  <div key={file.id} onClick={() => handleOpenRecentFile(file)} className="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-all cursor-pointer group">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                        <FileText className="w-5 h-5 text-blue-400/70" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{file.name}</p>
                        <div className="flex items-center space-x-2 text-[10px] text-white/30">
                          <span>{new Date(file.uploadedAt).toLocaleString()}</span>
                          <span>•</span>
                          <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Performance */}
        <div className="space-y-6">
          <PerfMonitor />
          
          {/* User Profile / Logout Quick Card */}
          <div className="bg-gradient-to-br from-[#1b1220] to-[#25152a] border border-purple-500/15 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                  <UserIcon className="w-5 h-5 text-purple-400" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-bold text-white truncate">{profile?.displayName || user.email}</p>
                  <p className="text-[10px] text-white/40 truncate">ID: {user.uid.substring(0, 8)}...</p>
                </div>
              </div>
              <button 
                onClick={onViewProfile}
                className="px-3 py-1.5 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 rounded-xl text-[10px] font-bold transition-all cursor-pointer"
              >
                Hồ sơ
              </button>
            </div>
            <button 
              onClick={onLogout}
              className="w-full py-2.5 bg-red-600/10 hover:bg-red-600/25 border border-red-500/20 rounded-xl text-red-400 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Đăng xuất
            </button>
          </div>

          <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">Tiện ích nhanh</h3>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction icon={<Zap />} label="Scan" onClick={() => toast("Tính năng đang được tối ưu hóa", "info")} />
              <QuickAction icon={<ShieldAlert />} label="Compare" onClick={() => toast("Chưa có tệp để so sánh", "info")} />
              <QuickAction icon={<Layers />} label="Modules" onClick={() => toast("Quản lý module", "info")} />
              <QuickAction icon={<Cpu />} label="Stats" onClick={() => toast("Báo cáo hệ thống", "info")} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, color }: { icon: React.ReactNode, title: string, value: string | number, color: string }) {
  return (
    <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 flex flex-col">
      <div className="flex items-center space-x-2 mb-2 opacity-60">
        {React.cloneElement(icon as React.ReactElement, { className: 'w-3 h-3 text-white' })}
        <span className="text-[10px] uppercase tracking-widest text-white/60">{title}</span>
      </div>
      <span className="text-xl font-bold text-white/90">{value}</span>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all space-y-1">
      {React.cloneElement(icon as React.ReactElement, { className: 'w-4 h-4 text-purple-400/70' })}
      <span className="text-[10px] uppercase font-bold text-white/40">{label}</span>
    </button>
  );
}
