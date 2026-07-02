import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { 
  User, Shield, ShieldAlert, ShieldCheck, Edit3, X, 
  Search, Check, RefreshCw, AlertCircle, Ban, ArrowLeft
} from 'lucide-react';
import { useUI } from './UIProvider';
import { useLanguage } from './LanguageProvider';

interface AdminPanelProps {
  onBack: () => void;
  currentUserUid: string;
}

export default function AdminPanel({ onBack, currentUserUid }: AdminPanelProps) {
  const { toast } = useUI();
  const { language } = useLanguage();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  
  // Form states for editing
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');
  const [editBanned, setEditBanned] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const loadedUsers: UserProfile[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedUsers.push({
          uid: docSnap.id,
          email: data.email || '',
          displayName: data.displayName || '',
          role: data.role || 'user',
          provider: data.provider || 'Email',
          createdAt: data.createdAt || Date.now(),
          banned: data.banned || false,
          country: data.country || ''
        });
      });
      
      // Sort users: admins first, then newest users
      loadedUsers.sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        return b.createdAt - a.createdAt;
      });

      setUsers(loadedUsers);
    } catch (err: any) {
      console.error("Error loading users for admin:", err);
      toast(language === 'vi' ? 'Không có quyền truy cập dữ liệu quản trị hoặc lỗi mạng!' : 'No admin permissions or connection error!', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenEdit = (user: UserProfile) => {
    setSelectedUser(user);
    setEditDisplayName(user.displayName || '');
    setEditRole(user.role);
    setEditBanned(user.banned || false);
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    if (!editDisplayName.trim()) {
      toast(language === 'vi' ? 'Tên hiển thị không được bỏ trống!' : 'Display name cannot be empty!', 'error');
      return;
    }

    setSaving(true);
    try {
      // 1. Update main user profile in /users using merge write (prevents data loss)
      const userRef = doc(db, 'users', selectedUser.uid);
      await setDoc(userRef, {
        displayName: editDisplayName.trim(),
        role: editRole,
        banned: editBanned
      }, { merge: true });

      // 2. Update search profile in /public_profiles
      const pubRef = doc(db, 'public_profiles', selectedUser.uid);
      await setDoc(pubRef, {
        displayName: editDisplayName.trim()
      }, { merge: true });

      toast(language === 'vi' ? 'Cập nhật tài khoản người dùng thành công!' : 'User updated successfully!', 'success');
      
      // Refresh user list locally
      setUsers(prev => prev.map(u => u.uid === selectedUser.uid ? {
        ...u,
        displayName: editDisplayName.trim(),
        role: editRole,
        banned: editBanned
      } : u));

      setSelectedUser(null);
    } catch (err: any) {
      console.error("Error saving user modifications:", err);
      toast(language === 'vi' ? 'Lỗi khi lưu thay đổi!' : 'Failed to save modifications!', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const term = searchTerm.toLowerCase();
    return (
      (user.email || '').toLowerCase().includes(term) ||
      (user.displayName || '').toLowerCase().includes(term) ||
      user.uid.toLowerCase().includes(term)
    );
  });

  // Calculate quick stats
  const totalUsers = users.length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const bannedCount = users.filter(u => u.banned === true).length;

  return (
    <div className="flex-1 bg-[#070b13] text-white p-6 md:p-10 space-y-8 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center text-purple-400 hover:text-purple-300 transition-colors text-xs font-semibold mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            {language === 'vi' ? 'Quay lại Dashboard' : 'Back to Dashboard'}
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <Shield className="w-7 h-7 mr-3 text-purple-500" />
            {language === 'vi' ? 'Cổng Quản Trị Hệ Thống' : 'System Administration Portal'}
          </h1>
          <p className="text-white/40 mt-1 text-sm">
            {language === 'vi' ? 'Quản lý tài khoản, phân quyền, bảo mật hệ thống.' : 'Manage user credentials, roles, and platform security.'}
          </p>
        </div>
        
        <button 
          onClick={fetchUsers} 
          disabled={loading}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {language === 'vi' ? 'Làm mới' : 'Refresh'}
        </button>
      </div>

      {/* Quick Statistics Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 text-left">
          <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">{language === 'vi' ? 'Tổng Số Người Dùng' : 'Total Users'}</p>
          <p className="text-2xl font-mono font-bold text-sky-400 mt-1">{totalUsers}</p>
        </div>
        <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 text-left">
          <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">{language === 'vi' ? 'Quản Trị Viên (Admins)' : 'Administrators'}</p>
          <p className="text-2xl font-mono font-bold text-purple-400 mt-1">{adminCount}</p>
        </div>
        <div className="bg-[#121829] border border-white/5 rounded-2xl p-5 text-left">
          <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">{language === 'vi' ? 'Tài Khoản Bị Khóa' : 'Banned Users'}</p>
          <p className="text-2xl font-mono font-bold text-red-400 mt-1">{bannedCount}</p>
        </div>
      </div>

      {/* Filter and Table Card */}
      <div className="bg-[#0b0f19] border border-white/5 rounded-2xl p-5 shadow-sm space-y-4 text-left">
        <div className="flex items-center bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 max-w-md">
          <Search className="w-4 h-4 text-white/40 mr-2 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={language === 'vi' ? 'Tìm kiếm theo Tên, Email hoặc UID...' : 'Search by Name, Email, or UID...'}
            className="bg-transparent border-none outline-none focus:ring-0 text-xs text-white placeholder-white/30 w-full"
          />
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
            <p className="text-xs text-white/40">{language === 'vi' ? 'Đang tải danh sách người dùng...' : 'Loading user directory...'}</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-white/30 border border-dashed border-white/5 rounded-xl">
            <User className="w-10 h-10 mx-auto opacity-20 mb-2" />
            <p className="text-sm">{language === 'vi' ? 'Không tìm thấy người dùng nào khớp.' : 'No users match your criteria.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-white/5 text-white/50 border-b border-white/5 font-medium">
                  <th className="p-4">{language === 'vi' ? 'Người Dùng' : 'User'}</th>
                  <th className="p-4">UID</th>
                  <th className="p-4">{language === 'vi' ? 'Vai Trò' : 'Role'}</th>
                  <th className="p-4">{language === 'vi' ? 'Nhà Cung Cấp' : 'Provider'}</th>
                  <th className="p-4">{language === 'vi' ? 'Ngày Tham Gia' : 'Joined Date'}</th>
                  <th className="p-4">{language === 'vi' ? 'Trạng Thái' : 'Status'}</th>
                  <th className="p-4 text-right">{language === 'vi' ? 'Thao Tác' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {filteredUsers.map((item) => (
                  <tr key={item.uid} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                          <User className="w-4 h-4 text-white/60" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{item.displayName || language === 'vi' ? 'Không tên' : 'No Name'}</p>
                          <p className="text-[10px] text-white/40 truncate">{item.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-white/50 text-[10px] select-all">
                      {item.uid}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        item.role === 'admin' 
                          ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20' 
                          : 'bg-white/5 text-white/60 border border-white/10'
                      }`}>
                        {item.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="p-4 text-white/60">
                      {item.provider}
                    </td>
                    <td className="p-4 text-white/50">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      {item.banned ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          <Ban className="w-3 h-3 mr-1" />
                          {language === 'vi' ? 'Bị Khóa' : 'Banned'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck className="w-3 h-3 mr-1" />
                          {language === 'vi' ? 'Hoạt Động' : 'Active'}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleOpenEdit(item)}
                        className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 hover:text-white transition-all cursor-pointer"
                        title={language === 'vi' ? 'Chỉnh sửa tài khoản' : 'Edit Account'}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Editor Modal Sheet */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 ">
          <div className="w-full max-w-md bg-[#121829] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-left">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/20">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center">
                <Edit3 className="w-4 h-4 mr-2 text-purple-400" />
                {language === 'vi' ? 'Cập Nhật Tài Khoản' : 'Update Account'}
              </h3>
              <button 
                onClick={() => setSelectedUser(null)}
                className="p-1 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* User details readout */}
              <div className="bg-black/20 p-3.5 rounded-xl border border-white/5 space-y-1">
                <p className="text-[10px] text-white/30 uppercase tracking-widest">{language === 'vi' ? 'Đang chỉnh sửa:' : 'Editing User:'}</p>
                <p className="text-sm font-semibold text-white">{selectedUser.email}</p>
                <p className="text-[9px] text-white/40 font-mono select-all">UID: {selectedUser.uid}</p>
              </div>

              {/* Display Name Input */}
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40">{language === 'vi' ? 'Tên hiển thị / Tên tài khoản' : 'Display name'}</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500 text-xs text-white"
                />
              </div>

              {/* Role Selection */}
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40">{language === 'vi' ? 'Vai trò (Role)' : 'Role'}</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setEditRole('user')}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      editRole === 'user'
                        ? 'bg-white/10 border-white/25 text-white'
                        : 'bg-black/20 border-white/5 text-white/40 hover:text-white/60'
                    }`}
                  >
                    User
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditRole('admin')}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      editRole === 'admin'
                        ? 'bg-purple-500/20 border-purple-500/30 text-purple-300'
                        : 'bg-black/20 border-white/5 text-white/40 hover:text-white/60'
                    }`}
                  >
                    Admin
                  </button>
                </div>
              </div>

              {/* Ban Toggle Switch */}
              <div className="flex items-center justify-between p-3 bg-black/10 rounded-xl border border-white/5">
                <div>
                  <p className="text-xs font-bold text-white flex items-center">
                    <Ban className="w-3.5 h-3.5 mr-1.5 text-red-500" />
                    {language === 'vi' ? 'Khóa tài khoản này' : 'Ban this account'}
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    {language === 'vi' ? 'Người dùng sẽ bị đăng xuất lập tức.' : 'Force logout and deny access immediately.'}
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={() => setEditBanned(!editBanned)}
                  disabled={selectedUser.uid === currentUserUid}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40 ${
                    editBanned ? 'bg-red-500' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      editBanned ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {selectedUser.uid === currentUserUid && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl flex items-start text-[10px]">
                  <AlertCircle className="w-4 h-4 mr-1.5 shrink-0" />
                  <span>{language === 'vi' ? 'Bạn không thể tự khóa tài khoản của chính mình!' : 'You cannot ban your own administrative account!'}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end space-x-2">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white/60 hover:text-white transition-all cursor-pointer"
              >
                {language === 'vi' ? 'Hủy' : 'Cancel'}
              </button>
              <button
                onClick={handleSaveUser}
                disabled={saving}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-all flex items-center cursor-pointer"
              >
                {saving && <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {language === 'vi' ? 'Lưu thay đổi' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
