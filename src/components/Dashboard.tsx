import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { UserProfile, UserStats, FileMeta } from '../types';
import { Settings, FileText, HardDrive, Edit3, BarChart2, Cpu, Activity, Zap, ShieldAlert, Layers, ChevronRight, User as UserIcon, LogOut, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getStats, getRecentFiles } from '../utils/stats';
import { getFile } from '../utils/db';
import { useUI } from './UIProvider';
import { useLanguage } from './LanguageProvider';

// Performance Monitor Component
function PerfMonitor() {
  const { language, t } = useLanguage();
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
    <div className="bg-[#171C23] border border-[#2A313C] rounded-xl p-5 shadow-sm">
      <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider flex items-center mb-4">
        <Activity className="w-4 h-4 mr-2 text-[#22C55E]" />
        {language === 'vi' ? 'HIỆU NĂNG HỆ THỐNG' : 'SYSTEM ENGINE METRICS'}
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] text-[#94A3B8]">CPU</p>
          <p className="text-lg font-mono text-[#E8EAF0]">{cpu.toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-[#94A3B8]">RAM SAFETY</p>
          <p className="text-lg font-mono text-[#E8EAF0]">{ram.toFixed(0)} MB</p>
        </div>
      </div>
      <div className="h-1 bg-black/30 rounded-full mt-4 overflow-hidden border border-[#2A313C]">
        <div className="h-full bg-[#22C55E]" style={{ width: `${cpu}%` }} />
      </div>
    </div>
  );
}

export default function Dashboard({ user, profile, onLogout, onViewProfile, onOpenFile, onOpenCloudFile, onViewAdmin }: { user: User, profile: UserProfile | null, onLogout: () => void, onViewProfile: () => void, onOpenFile: () => void, onOpenCloudFile?: (file: File) => void, onViewAdmin?: () => void }) {
  const { toast } = useUI();
  const { language, t } = useLanguage();
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
      toast(language === 'vi' ? `Đang tải tệp: ${fileMeta.name}...` : `Loading file: ${fileMeta.name}...`, 'info');
      const file = await getFile(fileMeta.id);
      if (file && onOpenCloudFile) {
        onOpenCloudFile(file);
      } else {
        toast(language === 'vi' ? `Không tìm thấy tệp tin: ${fileMeta.name}.` : `File not found: ${fileMeta.name}.`, 'error');
      }
    } catch (error) {
      console.error("Error:", error);
      toast(language === 'vi' ? "Lỗi khi mở tệp!" : "Failed to open file!", 'error');
    }
  };

  return (
    <div className="flex-1 bg-[#0B0F14] text-[#E8EAF0] p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2A313C] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#E8EAF0] flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#3B82F6]" />
            {language === 'vi' ? 'Hệ thống Phân tích Nhị phân (Binary Analysis Suite)' : 'Binary Analysis Suite'}
          </h1>
          <p className="text-[#94A3B8] text-xs mt-1">{language === 'vi' ? 'Phân tích tệp tin cấp độ thấp, rà soát mã độc YARA & vá mã nhị phân thời gian thực.' : 'Low-level static analysis, YARA scan pipeline & real-time patching.'}</p>
        </div>
        <button onClick={onOpenFile} className="px-4 py-2 bg-[#3B82F6] hover:bg-blue-600 rounded-lg text-[#E8EAF0] font-semibold text-xs transition-colors flex items-center justify-center cursor-pointer shadow-sm">
          <Edit3 className="w-4 h-4 mr-2" />
          {t('openFile')}
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Stats */}
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard icon={<FileText />} title={language === 'vi' ? 'Tệp Đã Tải' : 'Files Uploaded'} value={stats.filesUploaded} color="blue" />
            <StatCard icon={<Edit3 />} title={language === 'vi' ? 'Số Bản Vá' : 'Active Patches'} value={stats.hexEdits + stats.bitEdits} color="purple" />
            <StatCard icon={<HardDrive />} title={language === 'vi' ? 'Hạn Mức Bộ Nhớ' : 'Storage limit'} value="2.5 GB" color="cyan" />
          </div>

          <div className="bg-[#171C23] border border-[#2A313C] rounded-xl p-5 shadow-sm flex flex-col h-full min-h-[300px]">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#2A313C]/50">
              <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider">{language === 'vi' ? 'LỊCH SỬ TỆP TIN' : 'FILE HISTORY'}</h3>
              {recentFiles.length > 0 && (
                <button 
                  onClick={() => {
                    if (window.confirm(language === 'vi' ? "Xác nhận xóa toàn bộ lịch sử?" : "Are you sure you want to clear your file history?")) {
                      localStorage.removeItem(`webhex_files_${user.uid}`);
                      setRecentFiles([]);
                      toast(language === 'vi' ? "Đã xóa lịch sử tệp tin" : "Cleared file history successfully", "success");
                    }
                  }}
                  className="text-[10px] uppercase font-bold text-[#EF4444] hover:text-red-400 transition-colors cursor-pointer"
                >
                  {language === 'vi' ? 'Xóa lịch sử' : 'Clear history'}
                </button>
              )}
            </div>
            
            <div className="space-y-2 flex-1">
              {recentFiles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#94A3B8]/30 py-12">
                  <HardDrive className="w-10 h-10 mb-3 opacity-20" />
                  <p className="text-xs font-semibold">{language === 'vi' ? 'Chưa phân tích tệp nào' : 'No files analyzed yet'}</p>
                  <p className="text-[10px] text-center max-w-xs mt-1 opacity-60">{language === 'vi' ? 'Tải tệp tin lên để xem báo cáo cấu trúc chi tiết' : 'Upload or open a file to generate reports'}</p>
                </div>
              ) : (
                recentFiles.map(file => (
                  <div key={file.id} onClick={() => handleOpenRecentFile(file)} className="flex items-center justify-between p-3 bg-[#11161D] border border-[#2A313C] rounded-lg hover:border-[#3B82F6]/50 transition-colors cursor-pointer group">
                    <div className="flex items-center space-x-3">
                      <div className="p-1.5 bg-[#3B82F6]/10 border border-[#3B82F6]/20 rounded transition-colors text-[#3B82F6]">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-semibold text-[#E8EAF0]">{file.name}</p>
                        <div className="flex items-center space-x-2 text-[10px] text-[#94A3B8]">
                          <span>{new Date(file.uploadedAt).toLocaleString()}</span>
                          <span>•</span>
                          <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#94A3B8]/30 group-hover:text-[#3B82F6] transition-colors" />
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
          <div className="bg-[#171C23] border border-[#2A313C] rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#2A313C]/50 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-[#3B82F6]/10 flex items-center justify-center border border-[#3B82F6]/20 text-[#3B82F6]">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-bold text-[#E8EAF0] truncate">{profile?.displayName || user.email}</p>
                  <p className="text-[10px] text-[#94A3B8] truncate">ID: {user.uid.substring(0, 8)}...</p>
                </div>
              </div>
              <button 
                onClick={onViewProfile}
                className="px-2.5 py-1 bg-[#11161D] hover:bg-[#2A313C] border border-[#2A313C] text-[#E8EAF0] rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Hồ sơ' : 'Profile'}
              </button>
            </div>
            {profile?.role === 'admin' && onViewAdmin && (
              <button 
                onClick={onViewAdmin}
                className="w-full py-2 bg-[#22C55E]/15 hover:bg-[#22C55E]/25 border border-[#22C55E]/30 rounded-lg text-[#22C55E] text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 mr-2 text-[#22C55E]" />
                {language === 'vi' ? 'Cổng Quản Trị Admin' : 'Admin Portal'}
              </button>
            )}
            <button 
              onClick={onLogout}
              className="w-full py-2 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 border border-[#EF4444]/25 text-[#EF4444] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" />
              {language === 'vi' ? 'Đăng xuất' : 'Sign out'}
            </button>
          </div>

          <div className="bg-[#171C23] border border-[#2A313C] rounded-xl p-5 shadow-sm space-y-3 text-left">
            <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider">{language === 'vi' ? 'TIỆN ÍCH NHANH' : 'QUICK UTILITIES'}</h3>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction icon={<Zap />} label="Scan" onClick={() => toast(language === 'vi' ? "Tính năng đang được tối ưu" : "Scan active", "info")} />
              <QuickAction icon={<ShieldAlert />} label="Compare" onClick={() => toast(language === 'vi' ? "Chưa có tệp để so sánh" : "Compare engine", "info")} />
              <QuickAction icon={<Layers />} label="Modules" onClick={() => toast(language === 'vi' ? "Quản lý module" : "Modules management", "info")} />
              <QuickAction icon={<Cpu />} label="System" onClick={() => toast(language === 'vi' ? "Chẩn đoán hệ thống" : "System diagnostics", "info")} />
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
