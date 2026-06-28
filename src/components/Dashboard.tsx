import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserStats, FileMeta, UserSession } from '../types';
import { Settings, FileText, HardDrive, Edit3, BarChart2, CheckCircle, Clock, Smartphone, Globe, LogOut, ChevronRight, User as UserIcon, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getStats, getRecentFiles } from '../utils/stats';
import { getFile, clearAllFiles } from '../utils/db';

interface DashboardProps {
  user: User;
  profile: UserProfile | null;
  onLogout: () => void;
  onOpenFile: () => void;
  onOpenCloudFile?: (file: File) => void;
}

export default function Dashboard({ user, profile, onLogout, onOpenFile, onOpenCloudFile }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'files' | 'settings'>('overview');
  const [stats, setStats] = useState<UserStats>({
    filesUploaded: 0,
    hexEdits: 0,
    bitEdits: 0,
    hashesGenerated: 0,
    digitalSignatures: 0,
    storageUsed: 0
  });
  const [recentFiles, setRecentFiles] = useState<FileMeta[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      // Get Real Stats
      const realStats = getStats(user.uid);
      setStats(realStats);

      // Get Real Recent Files
      const realFiles = getRecentFiles(user.uid);
      setRecentFiles(realFiles);

      // Simple real-time user session based on current environment
      const fakeSessions: UserSession[] = [
        { 
          id: '1', 
          uid: user.uid, 
          device: navigator.platform || 'Thiết bị hiện tại', 
          browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Trình duyệt Web', 
          os: navigator.userAgent.includes('Windows') ? 'Windows' : navigator.userAgent.includes('Mac') ? 'macOS' : navigator.userAgent.includes('Linux') ? 'Linux' : 'Hệ điều hành', 
          ip: '127.0.0.1', 
          lastLogin: Date.now(), 
          isCurrent: true 
        }
      ];
      setSessions(fakeSessions);

      setLoading(false);
    };

    fetchDashboardData();
  }, [user]);

  const handleOpenRecentFile = async (fileMeta: FileMeta) => {
    try {
      const file = await getFile(fileMeta.id);
      if (file) {
        if (onOpenCloudFile) {
          onOpenCloudFile(file);
        }
      } else {
        if (fileMeta.size > 100 * 1024 * 1024) {
          alert(`Tệp tin "${fileMeta.name}" (${formatBytes(fileMeta.size)}) có dung lượng quá lớn (> 100MB) nên không được lưu trữ trong bộ nhớ đệm tạm thời của trình duyệt để tránh tràn bộ nhớ.\n\nVui lòng mở trực tiếp tệp tin này từ máy tính của bạn bằng nút "Mở File" để tiếp tục xem và chỉnh sửa với hiệu năng tối đa.`);
        } else {
          alert("Không tìm thấy tệp tin này trong bộ nhớ cục bộ. Có thể tệp đã bị xóa khỏi trình duyệt hoặc lịch sử.");
        }
      }
    } catch (error) {
      console.error("Error reopening recent file:", error);
      alert("Lỗi khi mở lại tệp tin!");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('vi-VN', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed md:relative inset-y-0 left-0 w-64 border-r border-white/10 bg-[#121827]/95 md:bg-white/5 backdrop-blur-xl flex flex-col p-4 z-50 transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex flex-col items-center mb-8 mt-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 p-1 shadow-lg shadow-purple-500/20 mb-3 relative">
            <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-8 h-8 text-white/50" />
              )}
            </div>
          </div>
          <h2 className="text-white font-semibold text-lg">{profile?.displayName || user.displayName || 'Người dùng'}</h2>
          <p className="text-white/50 text-xs text-center break-all px-2">{profile?.username || user.email}</p>
          <div className="mt-2 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] uppercase font-bold tracking-wider border border-blue-500/30">
            {profile?.provider || 'Email'}
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <button
            onClick={() => { setActiveTab('overview'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === 'overview' ? 'bg-white/10 text-white shadow-lg border border-white/10' : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            <BarChart2 className="w-5 h-5" />
            <span className="font-medium text-sm">Tổng quan</span>
          </button>
          
          <button
            onClick={() => { setActiveTab('files'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === 'files' ? 'bg-white/10 text-white shadow-lg border border-white/10' : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="font-medium text-sm">Tệp đã tải lên</span>
          </button>
          
          <button
            onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === 'settings' ? 'bg-white/10 text-white shadow-lg border border-white/10' : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium text-sm">Cài đặt & Bảo mật</span>
          </button>
        </nav>

        <div className="mt-auto">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20"
          >
            <LogOut className="w-4 h-4" />
            <span className="font-medium text-sm">Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 z-10 w-full">
        
        {/* Header Action */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-4">
            <button 
              className="md:hidden p-2 bg-white/5 text-white/70 hover:text-white rounded-lg border border-white/10"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-white mb-1">
                {activeTab === 'overview' && 'Dashboard Tổng quan'}
                {activeTab === 'files' && 'Quản lý Tệp'}
                {activeTab === 'settings' && 'Cài đặt Tài khoản'}
              </h1>
              <p className="text-white/50 text-xs sm:text-sm">Chào mừng trở lại, {profile?.displayName || user.displayName || 'bạn'}</p>
            </div>
          </div>
          
          <button 
            onClick={onOpenFile}
            className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-medium shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center border border-white/10"
          >
            <Edit3 className="w-4 h-4 mr-2" />
            Mở Hex Editor
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-8 relative">
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <motion.div 
                  key="overview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StatCard icon={<FileText />} title="Files Uploaded" value={stats.filesUploaded} color="blue" />
                    <StatCard icon={<Edit3 />} title="Hex Edits" value={stats.hexEdits} color="purple" />
                    <StatCard icon={<BarChart2 />} title="Bit Edits" value={stats.bitEdits} color="green" />
                    <StatCard icon={<CheckCircle />} title="Hashes Generated" value={stats.hashesGenerated} color="orange" />
                    <StatCard icon={<Settings />} title="Digital Signatures" value={stats.digitalSignatures} color="pink" />
                    <StatCard icon={<HardDrive />} title="Storage Used" value={formatBytes(stats.storageUsed)} color="cyan" />
                  </div>

                  {/* Recent Files Table */}
                  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_24px_0_rgba(0,0,0,0.2)]">
                    <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-white">Recent Files (Cloud Sync)</h3>
                      <button onClick={() => setActiveTab('files')} className="text-sm text-blue-400 hover:text-blue-300 flex items-center">
                        Xem tất cả <ChevronRight className="w-4 h-4 ml-1" />
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                            <th className="px-6 py-3 font-medium">Tên file</th>
                            <th className="px-6 py-3 font-medium">Kích thước</th>
                            <th className="px-6 py-3 font-medium">Lần cuối</th>
                            <th className="px-6 py-3 font-medium">Hành động</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-sm text-white/80">
                          {recentFiles.map(file => (
                            <tr 
                              key={file.id} 
                              onClick={() => handleOpenRecentFile(file)}
                              className="hover:bg-white/5 transition-colors cursor-pointer group"
                            >
                              <td className="px-6 py-4 flex items-center">
                                <FileText className="w-4 h-4 mr-3 text-blue-400 group-hover:scale-110 transition-transform" />
                                {file.name}
                              </td>
                              <td className="px-6 py-4 text-white/60">{formatBytes(file.size)}</td>
                              <td className="px-6 py-4 text-white/60">{formatDate(file.uploadedAt)}</td>
                              <td className="px-6 py-4">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenRecentFile(file);
                                  }}
                                  className="text-purple-400 hover:text-purple-300 font-medium hover:underline"
                                >
                                  Mở lại
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'files' && (
                <motion.div 
                  key="files"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-[0_4px_24px_0_rgba(0,0,0,0.2)]">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/10 pb-4 mb-4">
                      <div>
                        <h3 className="text-xl font-semibold text-white">Lịch sử tệp tin ngoại tuyến</h3>
                        <p className="text-white/50 text-sm mt-1">Danh sách các tệp tin bạn đã chỉnh sửa cục bộ trên thiết bị này. Dữ liệu của bạn được giữ an toàn 100% offline.</p>
                      </div>
                      {recentFiles.length > 0 && (
                        <button 
                          onClick={async () => {
                            if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử tệp và thống kê ngoại tuyến?')) {
                              localStorage.removeItem(`webhex_files_${user.uid}`);
                              localStorage.removeItem(`webhex_stats_${user.uid}`);
                              await clearAllFiles();
                              setRecentFiles([]);
                              setStats({
                                filesUploaded: 0,
                                hexEdits: 0,
                                bitEdits: 0,
                                hashesGenerated: 0,
                                digitalSignatures: 0,
                                storageUsed: 0
                              });
                            }
                          }}
                          className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-medium border border-red-500/20 transition-all self-start sm:self-auto"
                        >
                          Xóa lịch sử
                        </button>
                      )}
                    </div>

                    {recentFiles.length === 0 ? (
                      <div className="py-16 text-center text-white/40">
                        <HardDrive className="w-16 h-16 mx-auto mb-4 opacity-25" />
                        <p className="text-lg font-medium mb-1">Chưa có tệp tin nào được mở</p>
                        <p className="text-sm max-w-sm mx-auto mb-6">Mở một tệp tin bất kỳ từ thiết bị của bạn để bắt đầu chỉnh sửa Hex và xem lịch sử ở đây.</p>
                        <button onClick={onOpenFile} className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-xl hover:from-blue-500 hover:to-purple-500 transition-all shadow-lg shadow-purple-500/20">
                          Mở tệp tin đầu tiên
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                              <th className="px-6 py-3 font-medium">Tên file</th>
                              <th className="px-6 py-3 font-medium">Kích thước</th>
                              <th className="px-6 py-3 font-medium">Định dạng</th>
                              <th className="px-6 py-3 font-medium">Thời gian mở</th>
                              <th className="px-6 py-3 font-medium">Hành động</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-sm text-white/80">
                            {recentFiles.map(file => (
                              <tr 
                                key={file.id} 
                                onClick={() => handleOpenRecentFile(file)}
                                className="hover:bg-white/5 transition-colors cursor-pointer group"
                              >
                                <td className="px-6 py-4 flex items-center font-medium">
                                  <FileText className="w-4 h-4 mr-3 text-blue-400 group-hover:scale-110 transition-transform" />
                                  {file.name}
                                </td>
                                <td className="px-6 py-4 text-white/60">{formatBytes(file.size)}</td>
                                <td className="px-6 py-4 text-white/50 font-mono text-xs">{file.type || 'unknown'}</td>
                                <td className="px-6 py-4 text-white/60">{formatDate(file.uploadedAt)}</td>
                                <td className="px-6 py-4">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenRecentFile(file);
                                    }}
                                    className="text-purple-400 hover:text-purple-300 font-medium hover:underline"
                                  >
                                    Mở lại
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div 
                  key="settings"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                
                {/* Profile Settings */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4 border-b border-white/10 pb-4">Hồ sơ cá nhân</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Display Name</label>
                      <input type="text" className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors" defaultValue={profile?.displayName || ''} placeholder="Tên hiển thị" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Username</label>
                      <input type="text" className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors" defaultValue={profile?.username || ''} placeholder="@username" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Email</label>
                      <input type="email" disabled className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2 text-white/50 cursor-not-allowed" defaultValue={user.email || ''} />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium">Lưu thay đổi</button>
                  </div>
                </div>

                {/* Session Management */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">Quản lý Phiên đăng nhập (Sessions)</h3>
                    <button className="text-sm text-red-400 hover:text-red-300 font-medium">Đăng xuất tất cả thiết bị</button>
                  </div>
                  <div className="divide-y divide-white/5">
                    {sessions.map(session => (
                      <div key={session.id} className="p-6 flex items-center justify-between">
                        <div className="flex items-center">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${session.isCurrent ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>
                            {session.device.includes('iPhone') || session.device.includes('Android') ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center">
                              <p className="text-white font-medium">{session.device} - {session.browser}</p>
                              {session.isCurrent && <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] uppercase font-bold rounded-full border border-green-500/30">Current</span>}
                            </div>
                            <p className="text-white/50 text-sm mt-0.5">{session.os} • IP: {session.ip} • Đăng nhập: {formatDate(session.lastLogin)}</p>
                          </div>
                        </div>
                        {!session.isCurrent && (
                          <button className="px-3 py-1.5 border border-white/10 hover:bg-white/10 text-white/70 rounded-lg text-sm transition-colors">
                            Thu hồi
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Security */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4 border-b border-white/10 pb-4 text-red-400">Vùng nguy hiểm</h3>
                  <p className="text-white/60 text-sm mb-4">Sau khi xóa tài khoản, toàn bộ dữ liệu, files, và lịch sử phân tích sẽ bị xóa vĩnh viễn.</p>
                  <button className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors text-sm font-medium">
                    Xóa tài khoản
                  </button>
                </div>

              </motion.div>
            )}

            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, title, value, color }: { icon: React.ReactNode, title: string, value: string | number, color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/20',
    purple: 'from-purple-500/20 to-purple-600/5 text-purple-400 border-purple-500/20',
    green: 'from-green-500/20 to-green-600/5 text-green-400 border-green-500/20',
    orange: 'from-orange-500/20 to-orange-600/5 text-orange-400 border-orange-500/20',
    pink: 'from-pink-500/20 to-pink-600/5 text-pink-400 border-pink-500/20',
    cyan: 'from-cyan-500/20 to-cyan-600/5 text-cyan-400 border-cyan-500/20',
  };

  const currentClass = colorMap[color] || colorMap.blue;

  return (
    <div className={`bg-gradient-to-br ${currentClass} border rounded-2xl p-6 flex flex-col backdrop-blur-xl relative overflow-hidden group`}>
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-current opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity"></div>
      <div className="flex items-center space-x-3 mb-4 text-current">
        <div className="p-2 bg-current bg-opacity-10 rounded-lg">
          {icon}
        </div>
        <h4 className="font-medium text-white/80">{title}</h4>
      </div>
      <div className="text-3xl font-bold text-white mt-auto tracking-tight">
        {value}
      </div>
    </div>
  );
}
