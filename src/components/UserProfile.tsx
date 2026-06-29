import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  User, Mail, Shield, Calendar, Edit2, Save, ArrowLeft, 
  Activity, Check, Cloud, Key, HardDrive
} from 'lucide-react';
import { UserProfile as ProfileType } from '../types';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useUI } from './UIProvider';
import { useLanguage } from './LanguageProvider';

interface UserProfileProps {
  user: any;
  profile: ProfileType | null;
  onUpdateProfile: (updated: ProfileType) => void;
  onBack: () => void;
}

export default function UserProfile({ user, profile, onUpdateProfile, onBack }: UserProfileProps) {
  const { toast } = useUI();
  const { language, t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '');
  const [saving, setSaving] = useState(false);

  if (!user || !profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-center font-sans">
        <User className="w-12 h-12 text-white/20 mb-4 animate-pulse" />
        <p className="text-sm text-white/60">{language === 'vi' ? 'Không thể tải thông tin hồ sơ.' : 'Unable to load profile details.'}</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-white/10 text-white rounded-xl text-xs font-semibold hover:bg-white/15 transition-colors cursor-pointer">
          {language === 'vi' ? 'Quay lại Dashboard' : 'Back to Dashboard'}
        </button>
      </div>
    );
  }

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast(language === 'vi' ? 'Tên hiển thị không được bỏ trống!' : 'Display name cannot be empty!', 'error');
      return;
    }

    setSaving(true);
    try {
      const updatedProfile: ProfileType = {
        ...profile,
        displayName: displayName.trim()
      };

      const docRef = doc(db, 'users', profile.uid);
      await setDoc(docRef, { displayName: displayName.trim() }, { merge: true });
      
      onUpdateProfile(updatedProfile);
      setIsEditing(false);
      toast(language === 'vi' ? 'Cập nhật hồ sơ thành công!' : 'Profile updated successfully!', 'success');
      if (navigator.vibrate) navigator.vibrate([10, 30]);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      toast(language === 'vi' ? 'Lỗi khi cập nhật hồ sơ!' : 'Error updating profile details!', 'error');
    } finally {
      setSaving(false);
    }
  };

  const formattedDate = new Date(profile.createdAt).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 font-sans text-left">
      {/* Header Navigation */}
      <button 
        onClick={onBack}
        className="mb-6 flex items-center text-xs font-bold uppercase tracking-widest text-white/50 hover:text-white transition-colors cursor-pointer group"
      >
        <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
        {language === 'vi' ? 'Quay lại Dashboard' : 'Back to Dashboard'}
      </button>

      {/* Main card */}
      <div className="bg-[#121829] border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-purple-900/30 via-indigo-950/30 to-blue-900/30 blur-xl rounded-full pointer-events-none" />
        
        {/* Profile Card Header Banner */}
        <div className="px-6 sm:px-8 pt-8 pb-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center space-x-4 sm:space-x-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center text-white border-2 border-white/10 shadow-xl shadow-purple-900/10 shrink-0">
              {profile.photoURL ? (
                <img src={profile.photoURL} className="w-full h-full object-cover rounded-2xl" alt={profile.displayName} referrerPolicy="no-referrer" />
              ) : (
                <User className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              )}
            </div>
            
            <div className="min-w-0">
              {isEditing ? (
                <div className="flex items-center space-x-2 mt-1">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={50}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:border-purple-500/50 w-44 sm:w-60"
                    placeholder={language === 'vi' ? 'Tên hiển thị...' : 'Display name...'}
                    autoFocus
                  />
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 rounded-xl transition-colors cursor-pointer"
                  >
                    {saving ? (
                      <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button 
                    onClick={() => {
                      setDisplayName(profile.displayName);
                      setIsEditing(false);
                    }}
                    className="p-2 bg-white/5 hover:bg-white/10 text-white/50 border border-white/10 rounded-xl transition-colors cursor-pointer"
                  >
                    {language === 'vi' ? 'Hủy' : 'Cancel'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">{profile.displayName || (language === 'vi' ? 'Người dùng' : 'User')}</h2>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="p-1 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors cursor-pointer"
                    title={language === 'vi' ? 'Chỉnh sửa tên hiển thị' : 'Edit display name'}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-white/40 mt-1 font-mono truncate">{profile.email}</p>
            </div>
          </div>

          <div className="flex sm:flex-col items-start sm:items-end gap-2 shrink-0">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              profile.role === 'admin' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}>
              {profile.role === 'admin' ? (language === 'vi' ? 'Quyền Quản Trị' : 'Administrator') : (language === 'vi' ? 'Thành viên' : 'Member')}
            </span>
            <span className="text-[10px] font-mono text-white/30 hidden sm:block">
              UID: {profile.uid}
            </span>
          </div>
        </div>

        {/* Profile Stats Grid / Body */}
        <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          
          {/* Details Section */}
          <div className="md:col-span-2 space-y-6">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">{language === 'vi' ? 'Thông tin tài khoản' : 'Account profile details'}</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center space-x-3.5">
                <div className="p-2.5 bg-black/40 rounded-xl border border-white/5 text-purple-400">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-white/30 block font-bold uppercase tracking-wider">Email</span>
                  <span className="text-xs text-white/80 font-mono truncate max-w-full block">{profile.email || (language === 'vi' ? 'Không có' : 'None')}</span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center space-x-3.5">
                <div className="p-2.5 bg-black/40 rounded-xl border border-white/5 text-blue-400">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-white/30 block font-bold uppercase tracking-wider">{language === 'vi' ? 'Nhà Cung Cấp' : 'Auth Provider'}</span>
                  <span className="text-xs text-white/80 uppercase font-semibold">{profile.provider || 'Password'}</span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center space-x-3.5">
                <div className="p-2.5 bg-black/40 rounded-xl border border-white/5 text-emerald-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-white/30 block font-bold uppercase tracking-wider">{language === 'vi' ? 'Ngày đăng ký' : 'Join date'}</span>
                  <span className="text-xs text-white/80 font-medium">{formattedDate}</span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center space-x-3.5">
                <div className="p-2.5 bg-black/40 rounded-xl border border-white/5 text-orange-400">
                  <Key className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-white/30 block font-bold uppercase tracking-wider">{language === 'vi' ? 'ID tài khoản' : 'User account ID'}</span>
                  <span className="text-xs text-white/80 font-mono truncate max-w-[150px] block">{profile.uid.substring(0, 12)}...</span>
                </div>
              </div>
            </div>

            {/* Account Settings / Help Notice */}
            <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-2xl flex items-start space-x-3">
              <Shield className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-white">{language === 'vi' ? 'Bảo mật tài khoản đám mây' : 'Secure Cloud Authorization'}</h4>
                <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">
                  {language === 'vi' 
                    ? 'Tài khoản của bạn được đồng bộ hóa đám mây thông qua Firebase Auth an toàn. Các thay đổi về tên hiển thị sẽ ngay lập tức được đồng bộ hóa trên tất cả các phiên làm việc của bạn.'
                    : 'Your account and preferences are securely encrypted and synchronized across environments using Firebase cloud auth architecture. Changes take effect globally.'}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats Sidebar */}
          <div className="space-y-6">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">{language === 'vi' ? 'Hoạt động' : 'Real-time activity'}</h3>
            
            <div className="bg-black/20 border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-semibold text-white/70">{language === 'vi' ? 'Trạng thái' : 'Status'}</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse"></span>
                  {language === 'vi' ? 'Trực tuyến' : 'Online'}
                </span>
              </div>

              <div className="h-px bg-white/5"></div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-white/70">{language === 'vi' ? 'Lưu trữ đám mây' : 'Cloud Storage'}</span>
                </div>
                <span className="text-xs text-white/50 font-mono">{language === 'vi' ? 'Không giới hạn' : 'Unlimited'}</span>
              </div>

              <div className="h-px bg-white/5"></div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] text-white/30 font-bold uppercase tracking-wider">
                  <span>{language === 'vi' ? 'RAM Trình duyệt' : 'Browser Sandbox'}</span>
                  <span className="text-purple-400">Balanced</span>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                  <div className="w-1/3 h-full bg-purple-500 rounded-full" />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
