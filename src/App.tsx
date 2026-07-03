import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { FileUp, LogOut, ShieldAlert, Monitor, Home, Loader2, Menu, X, ChevronRight, Bookmark, Beaker, Shield, Clock, Globe, Settings, HelpCircle, ShieldCheck, FileCode, Search, User as UserIcon } from 'lucide-react';
import Auth from './components/Auth';
import Workspace from './components/Workspace';
import Dashboard from './components/Dashboard';
import PremiumBackground from './components/PremiumBackground';
import { UserProfile, UserSession } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { addRecentFile, getRecentFiles } from './utils/stats';
import { storeFile, getFile } from './utils/db';
import { useUI } from './components/UIProvider';
import { useLanguage } from './components/LanguageProvider';
import { useNavigate, useLocation, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';

import { engineManager } from './lib/engine/manager';
import { AiEngine } from './lib/engine/aiEngine';

// Register Engines
engineManager.register('AiEngine', new AiEngine());

import LogoutConfirmModal from './components/LogoutConfirmModal';
import UserProfileView from './components/UserProfile';
import AdminPanel from './components/AdminPanel';
import NotFound from './components/NotFound';

interface ProtectedRouteProps {
  user: User | null;
  loading: boolean;
}

function ProtectedRoute({ user, loading }: ProtectedRouteProps) {
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0F19]">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  return user ? <Outlet /> : <Navigate to="/auth" replace />;
}

export default function App() {
  const { toast } = useUI();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [banned, setBanned] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isRecentSheetOpen, setIsRecentSheetOpen] = useState(false);
  const [isAboutSheetOpen, setIsAboutSheetOpen] = useState(false);
  const [isSupportSheetOpen, setIsSupportSheetOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (currentUser) {
        try {
          const docRef = doc(db, 'users', currentUser.uid);

          unsubscribeProfile = onSnapshot(docRef, async (docSnap) => {
            if (docSnap.exists()) {
              const profileData = docSnap.data() as UserProfile;
              if (profileData.banned === true) {
                if (unsubscribeProfile) {
                  unsubscribeProfile();
                  unsubscribeProfile = null;
                }
                await signOut(auth);
                setUser(null);
                setUserProfile(null);
                setBanned(true);
                navigate('/auth');
                toast(language === 'vi' ? "Tài khoản của bạn đã bị cấm bởi Admin." : "Your account has been banned by Admin.", "error");
              } else {
                setUser(currentUser);
                setUserProfile(profileData);
                setBanned(false);
                if (location.pathname === '/auth') {
                  navigate('/');
                }

                // Sync to public profiles
                try {
                  const pubRef = doc(db, 'public_profiles', currentUser.uid);
                  const emailToMask = profileData.email || currentUser.email || '';
                  let currentMasked = '***';
                  if (emailToMask && emailToMask.includes('@')) {
                    const [local, domain] = emailToMask.split('@');
                    if (local.length > 2) {
                      currentMasked = local.slice(0, 2) + '*'.repeat(Math.max(3, local.length - 4)) + local.slice(-2) + '@' + domain;
                    } else {
                      currentMasked = local[0] + '***@' + domain;
                    }
                  }

                  await setDoc(pubRef, {
                    uid: currentUser.uid,
                    displayName: profileData.displayName || currentUser.displayName || 'Người dùng',
                    emailMasked: currentMasked,
                    provider: profileData.provider || 'Email',
                    createdAt: profileData.createdAt || Date.now()
                  }, { merge: true });
                } catch (pubErr) {
                  console.warn("Could not sync public profile:", pubErr);
                }
              }
            } else {
              const creationTime = new Date(currentUser.metadata.creationTime || '').getTime();
              const isJustCreated = Date.now() - creationTime < 15000;

              if (!isJustCreated) {
                if (unsubscribeProfile) {
                  unsubscribeProfile();
                  unsubscribeProfile = null;
                }
                await signOut(auth);
                setUser(null);
                setUserProfile(null);
                setBanned(true);
                navigate('/auth');
              } else {
                setUser(currentUser);
                if (location.pathname === '/auth') {
                  navigate('/');
                }
              }
            }
            setLoading(false);
          }, (err) => {
            console.error("Profile subscription error:", err);
            setLoading(false);
          });

          // Log session info
          try {
            const session: UserSession = {
              uid: currentUser.uid,
              device: navigator.platform || 'Unknown',
              browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Unknown',
              os: navigator.platform || 'Unknown',
              lastLogin: Date.now()
            };
            await setDoc(doc(db, 'sessions', `${currentUser.uid}_${Date.now()}`), session);
          } catch (e) {
            console.warn("Could not log session");
          }

        } catch (error) {
          console.error("Error setting up user profile snapshot:", error);
          setLoading(false);
        }
      } else {
        setUser(null);
        setUserProfile(null);
        if (location.pathname !== '/auth') {
          navigate('/auth');
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, [language]);

  // Restore active file session on page refresh (F5)
  useEffect(() => {
    const restoreActiveFile = async () => {
      const activeId = sessionStorage.getItem('active_file_id');
      if (activeId && !selectedFile) {
        const file = await getFile('last_active_file');
        if (file) {
          setSelectedFile(file);
          setFileId(activeId);
        }
      }
    };
    if (user) {
      restoreActiveFile();
    }
  }, [user]);

  const handleLogout = () => {
    setIsLogoutModalOpen(true);
  };

  const confirmLogout = () => {
    signOut(auth);
    handleCloseWorkspace();
    setBanned(false);
    navigate('/auth');
    setIsLogoutModalOpen(false);
  };

  const handleUpdateProfile = (updated: UserProfile) => {
    setUserProfile(updated);
  };

  const handleUploadAndOpen = async (file: File) => {
    setSelectedFile(file);
    setFileId('local_stream');
    sessionStorage.setItem('active_file_id', 'local_stream');
    try {
      await storeFile('last_active_file', file);
    } catch (e) {
      console.error(e);
    }
    navigate('/workspace');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      if (file.size > 150 * 1024 * 1024) {
        toast(`Tệp tin lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Chế độ Balanced/Lite sẽ được áp dụng để tiết kiệm RAM.`, "warning");
      }
      
      if (user) {
        const generatedId = addRecentFile(user.uid, file.name, file.size, file.type);
        // Skip storing massive files (e.g. > 100MB) to prevent IndexedDB writing freeze
        if (file.size <= 100 * 1024 * 1024) {
          try {
            await storeFile(generatedId, file);
          } catch (err) {
            console.error("Failed to store file in offline DB:", err);
          }
        }
      }
      await handleUploadAndOpen(file);
    }
  };

  const handleCloseWorkspace = async () => {
    if (fileId) {
      try {
        await fetch('/api/file/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId })
        });
      } catch (err) {
        console.error('Failed to close server file session:', err);
      }
    }
    setSelectedFile(null);
    setFileId(null);
    sessionStorage.removeItem('active_file_id');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0F19]">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (banned) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B0F19] p-4 text-center">
        <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Tài khoản bị cấm</h1>
        <p className="text-white/60 mb-6 max-w-md">
          Tài khoản của bạn đã bị vô hiệu hóa hoặc xóa khỏi hệ thống. Vui lòng liên hệ quản trị viên.
        </p>
        <button
          onClick={() => setBanned(false)}
          className="px-6 py-2 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors"
        >
          Quay lại đăng nhập
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-gray-100 font-sans selection:bg-purple-500/30 flex flex-col relative overflow-hidden">
      <PremiumBackground />

      <Routes>
        {/* Auth Route */}
        <Route path="/auth" element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <div className="flex-1 flex items-center justify-center p-4 z-10">
              <Auth onSuccess={() => navigate('/')} />
            </div>
          )
        } />

        {/* Protected Routes Wrapper */}
        <Route element={<ProtectedRoute user={user} loading={loading} />}>
          {/* Main Layout containing Navbar */}
          <Route element={
            <>
              {/* Responsive App Bar & Navigation */}
              {!isMobile ? (
                /* Desktop Global Navbar */
                <nav className="bg-white/5 border-b border-white/10 px-6 py-3 flex items-center justify-between shadow-sm z-20">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 to-blue-600 text-white rounded-md flex items-center justify-center font-bold font-mono">
                      Hx
                    </div>
                    <span className="font-semibold text-white text-lg tracking-tight">WebHexed</span>
                  </div>
                  
                  <div className="flex items-center space-x-2 sm:space-x-4">
                    {/* Language Switcher */}
                    <button
                      onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
                      className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-xs font-semibold cursor-pointer transition-all duration-150 active:scale-95 shrink-0"
                      title={language === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
                    >
                      <span className="text-sm leading-none">{language === 'vi' ? '🇻🇳' : '🇬🇧'}</span>
                      <span className="uppercase font-mono text-[10px] tracking-wider leading-none">{language === 'vi' ? 'VI' : 'EN'}</span>
                    </button>

                    <div className="h-6 w-px bg-white/10 mx-1 sm:mx-2"></div>

                    <Routes>
                      <Route path="/workspace" element={
                        <button
                          onClick={handleCloseWorkspace}
                          className="flex items-center px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
                        >
                          <Home className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">{t('backToDashboard' as any)}</span>
                        </button>
                      } />
                      <Route path="/profile" element={
                        <button
                          onClick={() => navigate('/')}
                          className="flex items-center px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
                        >
                          <Home className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">{t('backToDashboard' as any)}</span>
                        </button>
                      } />
                      <Route path="/admin" element={
                        <button
                          onClick={() => navigate('/')}
                          className="flex items-center px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
                        >
                          <Home className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">{t('backToDashboard' as any)}</span>
                        </button>
                      } />
                      <Route path="/" element={
                        <label className="flex items-center px-2 sm:px-4 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-md transition-colors text-xs sm:text-sm font-semibold cursor-pointer border border-blue-500/30">
                          <FileUp className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">{t('openFile')}</span>
                          <input type="file" className="hidden" onChange={handleFileChange} />
                        </label>
                      } />
                    </Routes>
                    
                    <div className="h-6 w-px bg-white/10 mx-1 sm:mx-2"></div>
                    
                    <button
                      onClick={() => navigate('/profile')}
                      className={`text-xs sm:text-sm hover:text-purple-300 font-semibold transition-colors truncate max-w-[80px] sm:max-w-[150px] cursor-pointer ${location.pathname === '/profile' ? 'text-purple-400' : 'text-white/70'}`}
                      title="Xem hồ sơ cá nhân"
                    >
                      {userProfile?.displayName || user?.email}
                    </button>

                    <button
                      onClick={handleLogout}
                      className="flex items-center px-2 py-1.5 text-xs sm:text-sm font-semibold text-red-400 hover:bg-red-500/20 rounded-md transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </nav>
              ) : (
                /* Mobile Top App Bar */
                <header className="fixed top-0 left-0 right-0 h-[56px] bg-[#11161D] border-b border-[#2A313C] z-30 flex items-center justify-between px-4 select-none shadow-md">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setIsSideMenuOpen(!isSideMenuOpen)}
                      className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white active:bg-white/5 transition-all cursor-pointer"
                    >
                      <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col text-left">
                      <span className="font-bold text-white text-xs tracking-tight uppercase">WebHexed</span>
                      <span className="text-[10px] text-[#94A3B8] font-mono truncate max-w-[140px] block">
                        {location.pathname === '/workspace' && selectedFile ? selectedFile.name : (location.pathname === '/profile' ? t('viewProfile' as any) || 'Profile' : 'Dashboard')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    {/* Search Icon triggering Search Tab directly inside workspace */}
                    <button
                      onClick={() => {
                        if (location.pathname === '/workspace') {
                          navigate('/workspace?tab=search');
                        } else {
                          toast(language === 'vi' ? 'Vui lòng mở một tệp tin trước!' : 'Please open a file first!', 'warning');
                        }
                      }}
                      className="p-2 rounded-lg text-[#94A3B8] hover:text-white active:bg-white/5 transition-all cursor-pointer"
                    >
                      <Search className="w-4.5 h-4.5" />
                    </button>

                    {/* Quick File Uploader */}
                    <label className="p-2 rounded-lg text-[#3B82F6] hover:text-white active:bg-white/5 transition-all cursor-pointer">
                      <FileUp className="w-4.5 h-4.5" />
                      <input type="file" className="hidden" onChange={handleFileChange} />
                    </label>
                  </div>
                </header>
              )}

              <div className={`flex-1 flex overflow-hidden z-10 relative ${isMobile ? 'pt-[56px] pb-[64px]' : ''}`}>
                <ErrorBoundary>
                  <Outlet />
                </ErrorBoundary>
              </div>

              {/* Mobile Bottom Navigation */}
              {isMobile && (
                <nav className="fixed bottom-0 left-0 right-0 h-[64px] bg-[#11161D] border-t border-[#2A313C] z-30 flex items-center justify-around px-2 select-none shadow-lg">
                  {/* Home */}
                  <button
                    onClick={() => navigate('/')}
                    className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-bold tracking-tight transition-colors cursor-pointer ${
                      location.pathname === '/' ? 'text-[#3B82F6]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <Home className="w-5 h-5 mb-0.5" />
                    <span>{language === 'vi' ? 'Trang Chủ' : 'Home'}</span>
                  </button>

                  {/* Workspace */}
                  <button
                    onClick={() => {
                      if (selectedFile) {
                        navigate('/workspace?tab=edit');
                      } else {
                        toast(language === 'vi' ? 'Vui lòng mở một tệp tin trước!' : 'Please open a file first!', 'warning');
                      }
                    }}
                    className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-bold tracking-tight transition-colors cursor-pointer ${
                      location.pathname === '/workspace' && !location.search.includes('tab=scan_pipeline') ? 'text-[#3B82F6]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <FileCode className="w-5 h-5 mb-0.5" />
                    <span>Workspace</span>
                  </button>

                  {/* Scan Pipeline */}
                  <button
                    onClick={() => {
                      if (selectedFile) {
                        navigate('/workspace?tab=scan_pipeline');
                      } else {
                        toast(language === 'vi' ? 'Vui lòng mở một tệp tin trước!' : 'Please open a file first!', 'warning');
                      }
                    }}
                    className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-bold tracking-tight transition-colors cursor-pointer ${
                      location.pathname === '/workspace' && location.search.includes('tab=scan_pipeline') ? 'text-[#3B82F6]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <ShieldCheck className="w-5 h-5 mb-0.5" />
                    <span>{language === 'vi' ? 'Quét Deep' : 'Deep Scan'}</span>
                  </button>

                  {/* Recent Files Bottom Sheet Trigger */}
                  <button
                    onClick={() => setIsRecentSheetOpen(true)}
                    className="flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-bold tracking-tight text-[#94A3B8] active:text-[#3B82F6] cursor-pointer"
                  >
                    <Clock className="w-5 h-5 mb-0.5" />
                    <span>{language === 'vi' ? 'Gần Đây' : 'Recent'}</span>
                  </button>

                  {/* Profile */}
                  <button
                    onClick={() => navigate('/profile')}
                    className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-bold tracking-tight transition-colors cursor-pointer ${
                      location.pathname === '/profile' ? 'text-[#3B82F6]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <UserIcon className="w-5 h-5 mb-0.5" />
                    <span>{language === 'vi' ? 'Hồ Sơ' : 'Profile'}</span>
                  </button>
                </nav>
              )}
            </>
          }>
            {/* Nested Child Routes inside Layout with Navbar */}
            <Route path="/" element={
              <Dashboard 
                user={user} 
                profile={userProfile} 
                onLogout={handleLogout}
                onViewProfile={() => navigate('/profile')}
                onOpenFile={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.onchange = (e: any) => handleFileChange(e);
                  input.click();
                }}
                onOpenCloudFile={async (file) => {
                  await handleUploadAndOpen(file);
                }}
                onViewAdmin={() => navigate('/admin')}
              />
            } />
            <Route path="/workspace" element={
              selectedFile && fileId ? (
                <Workspace file={selectedFile} fileId={fileId} onClose={handleCloseWorkspace} />
              ) : (
                <Navigate to="/" replace />
              )
            } />
            <Route path="/profile" element={
              <UserProfileView 
                user={user} 
                profile={userProfile} 
                onUpdateProfile={handleUpdateProfile} 
                onBack={() => navigate('/')} 
              />
            } />
            <Route path="/admin" element={
              userProfile?.role === 'admin' ? (
                <AdminPanel 
                  currentUserUid={user?.uid || ''}
                  onBack={() => navigate('/')} 
                />
              ) : (
                <Navigate to="/" replace />
              )
            } />
          </Route>
        </Route>

        {/* Catch-all Not Found Page */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Global uploading screen overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-[#0B0F19]/90 backdrop-blur-md flex flex-col items-center justify-center z-50">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_24px_rgba(168,85,247,0.4)]"></div>
          <h3 className="text-xl font-semibold text-white mb-2">Đang xử lý tệp tin...</h3>
          <p className="text-sm text-white/60">Tải dữ liệu trực tiếp lên máy chủ để xử lý tối ưu</p>
        </div>
      )}

      {/* Logout Confirmation */}
      <LogoutConfirmModal 
        isOpen={isLogoutModalOpen} 
        onClose={() => setIsLogoutModalOpen(false)} 
        onConfirm={confirmLogout} 
      />

      {/* 1. Mobile Side Menu (Drawer) */}
      <AnimatePresence>
        {isMobile && isSideMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSideMenuOpen(false)}
              className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-[#11161D] border-r border-[#2A313C] z-50 flex flex-col justify-between overflow-y-auto"
            >
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#2A313C]">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-lg flex items-center justify-center font-bold text-white text-sm">
                      Hx
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight">WebHexed Mobile</h3>
                      <p className="text-[10px] text-white/40 font-mono">v2.4.0 • Enterprise</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsSideMenuOpen(false)}
                    className="p-1.5 rounded-lg bg-[#171C23] border border-[#2A313C] text-[#94A3B8]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Drawer Links */}
                <div className="space-y-1.5 flex-1 text-left">
                  {[
                    { label: language === 'vi' ? 'Bảng Điều Khiển' : 'Dashboard', icon: Home, action: () => { navigate('/'); setIsSideMenuOpen(false); } },
                    { label: language === 'vi' ? 'Lịch Sử Tệp Tin' : 'Recent Files', icon: Clock, action: () => { setIsRecentSheetOpen(true); setIsSideMenuOpen(false); } },
                    { label: language === 'vi' ? 'Bookmarks' : 'Bookmarks', icon: Bookmark, action: () => { if (!selectedFile) { toast(language === 'vi' ? 'Vui lòng mở một tệp tin trước!' : 'Please open a file first!', 'warning'); } else { navigate('/workspace?tab=bookmarks'); } setIsSideMenuOpen(false); } },
                    { label: language === 'vi' ? 'Quản Lý Plugins' : 'Plugins', icon: Beaker, action: () => { if (!selectedFile) { toast(language === 'vi' ? 'Vui lòng mở một tệp tin trước!' : 'Please open a file first!', 'warning'); } else { navigate('/workspace?tab=plugins'); } setIsSideMenuOpen(false); } },
                    { label: language === 'vi' ? 'Mã Độc YARA' : 'YARA Rules', icon: Shield, action: () => { if (!selectedFile) { toast(language === 'vi' ? 'Vui lòng mở một tệp tin trước!' : 'Please open a file first!', 'warning'); } else { navigate('/workspace?tab=yara'); } setIsSideMenuOpen(false); } },
                    { label: language === 'vi' ? 'Cài Đặt Hệ Thống' : 'Settings', icon: Settings, action: () => { if (!selectedFile) { toast(language === 'vi' ? 'Vui lòng mở một tệp tin trước!' : 'Please open a file first!', 'warning'); } else { navigate('/workspace?tab=settings'); } setIsSideMenuOpen(false); } },
                  ].map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={idx}
                        onClick={item.action}
                        className="w-full px-3.5 py-3 hover:bg-[#171C23] rounded-xl text-left text-xs font-semibold text-[#E8EAF0] flex items-center justify-between border border-transparent hover:border-[#2A313C] transition-all cursor-pointer"
                      >
                        <div className="flex items-center space-x-3 text-white/80">
                          <Icon className="w-4 h-4 text-[#3B82F6]" />
                          <span>{item.label}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8]/30" />
                      </button>
                    );
                  })}
                </div>

                {/* Additional Sidebar Actions */}
                <div className="pt-6 border-t border-[#2A313C] space-y-2 mt-auto">
                  {/* Language Selector inside Sidebar */}
                  <button
                    onClick={() => {
                      setLanguage(language === 'vi' ? 'en' : 'vi');
                      if (navigator.vibrate) navigator.vibrate(10);
                    }}
                    className="w-full p-3 bg-[#171C23] border border-[#2A313C] rounded-xl text-xs font-bold text-[#E8EAF0] flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center space-x-2">
                      <Globe className="w-4 h-4 text-emerald-400" />
                      <span>{language === 'vi' ? 'Ngôn Ngữ / Language' : 'Language / Ngôn ngữ'}</span>
                    </div>
                    <span className="text-[10px] uppercase font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                      {language === 'vi' ? 'TIẾNG VIỆT' : 'ENGLISH'}
                    </span>
                  </button>

                  <button
                    onClick={() => { setIsAboutSheetOpen(true); setIsSideMenuOpen(false); }}
                    className="w-full px-3 py-2.5 bg-transparent text-left text-xs text-[#94A3B8] hover:text-[#E8EAF0] flex items-center space-x-3 cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>{language === 'vi' ? 'Giới thiệu WebHexed' : 'About WebHexed'}</span>
                  </button>
                  <button
                    onClick={() => { setIsSupportSheetOpen(true); setIsSideMenuOpen(false); }}
                    className="w-full px-3 py-2.5 bg-transparent text-left text-xs text-[#94A3B8] hover:text-[#E8EAF0] flex items-center space-x-3 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{language === 'vi' ? 'Hỗ Trợ Kỹ Thuật' : 'Technical Support'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 2. Recent Files Bottom Sheet */}
      <AnimatePresence>
        {isMobile && isRecentSheetOpen && (
          <>
            <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40" onClick={() => setIsRecentSheetOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed bottom-0 left-0 right-0 max-h-[80vh] bg-[#171C23] border-t border-[#2A313C] rounded-t-3xl p-5 z-50 flex flex-col overflow-hidden text-left shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-[#3B82F6]" />
                  <h3 className="text-xs font-bold text-[#E8EAF0] uppercase tracking-wider">
                    {language === 'vi' ? 'Tệp Gần Đây' : 'Recent Files'}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsRecentSheetOpen(false)}
                  className="p-1.5 rounded-lg bg-[#11161D] text-[#94A3B8] border border-[#2A313C]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 overflow-y-auto pb-6">
                {getRecentFiles(user?.uid || '').length === 0 ? (
                  <div className="py-12 text-center text-[#94A3B8]/40">
                    <p className="text-xs">{language === 'vi' ? 'Chưa phân tích tệp nào gần đây.' : 'No recent files found.'}</p>
                  </div>
                ) : (
                  getRecentFiles(user?.uid || '').map((item) => (
                    <div 
                      key={item.id}
                      onClick={async () => {
                        setIsRecentSheetOpen(false);
                        toast(language === 'vi' ? `Đang tải: ${item.name}...` : `Loading: ${item.name}...`, 'info');
                        const file = await getFile(item.id);
                        if (file) {
                          await handleUploadAndOpen(file);
                        } else {
                          toast(language === 'vi' ? 'Không tìm thấy tệp này offline!' : 'Could not find file offline!', 'error');
                        }
                      }}
                      className="p-3.5 bg-[#11161D] border border-[#2A313C] rounded-xl flex items-center justify-between cursor-pointer active:bg-[#1C232E] transition-all"
                    >
                      <div className="flex items-center space-x-3">
                        <FileCode className="w-4 h-4 text-[#3B82F6]" />
                        <div>
                          <p className="text-xs font-bold text-[#E8EAF0] truncate max-w-[180px]">{item.name}</p>
                          <p className="text-[10px] font-mono text-[#94A3B8]">{(item.size / 1024 / 1024).toFixed(2)} MB • {new Date(item.uploadedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#94A3B8]/30" />
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 3. About Bottom Sheet */}
      <AnimatePresence>
        {isMobile && isAboutSheetOpen && (
          <>
            <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40" onClick={() => setIsAboutSheetOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed bottom-0 left-0 right-0 bg-[#171C23] border-t border-[#2A313C] rounded-t-3xl p-6 z-50 flex flex-col text-left shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4 border-b border-[#2A313C] pb-3">
                <h3 className="text-xs font-bold text-[#E8EAF0] uppercase tracking-wider">{language === 'vi' ? 'Giới Thiệu WebHexed' : 'About WebHexed'}</h3>
                <button onClick={() => setIsAboutSheetOpen(false)} className="p-1 bg-[#11161D] text-[#94A3B8] rounded border border-[#2A313C]"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3.5 text-xs text-[#94A3B8] leading-relaxed pb-4 text-left">
                <p>
                  <strong>WebHexed Mobile</strong> là phiên bản ứng dụng di động tối ưu hóa hiệu năng vượt trội dựa trên hệ thống phân tích nhị phân gốc <code>WebHexed Suite</code>.
                </p>
                <p>
                  Được thiết kế hoàn chỉnh cho mục đích dịch mã ngược (reverse engineering), dò lỗi, biên dịch phần mềm, và quản trị an toàn thông tin chuyên sâu ngay trên thiết bị di động của bạn.
                </p>
                <div className="bg-[#11161D] border border-[#2A313C] p-3 rounded-xl space-y-1 font-mono text-[10px] text-emerald-400">
                  <div>• Công nghệ virtual scroll tải siêu tốc tệp tin lớn</div>
                  <div>• Bảng lệnh bit-toggle đảo chiều trực tiếp cực trực quan</div>
                  <div>• Pipeline rà soát bảo mật tự động 24 bước chuyên sâu</div>
                </div>
                <button onClick={() => setIsAboutSheetOpen(false)} className="w-full py-3 bg-[#3B82F6] text-white text-xs font-bold rounded-xl active:bg-blue-600 mt-2">{language === 'vi' ? 'Đóng Giới Thiệu' : 'Close'}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 4. Support Bottom Sheet */}
      <AnimatePresence>
        {isMobile && isSupportSheetOpen && (
          <>
            <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40" onClick={() => setIsSupportSheetOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed bottom-0 left-0 right-0 bg-[#171C23] border-t border-[#2A313C] rounded-t-3xl p-6 z-50 flex flex-col text-left shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4 border-b border-[#2A313C] pb-3">
                <h3 className="text-xs font-bold text-[#E8EAF0] uppercase tracking-wider">{language === 'vi' ? 'Hỗ Trợ Kỹ Thuật' : 'Technical Support'}</h3>
                <button onClick={() => setIsSupportSheetOpen(false)} className="p-1 bg-[#11161D] text-[#94A3B8] rounded border border-[#2A313C]"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3 text-xs text-[#94A3B8] pb-4 text-left">
                <p>{language === 'vi' ? 'Nếu bạn gặp sự cố hiệu năng hoặc lỗi giải mã nhị phân, vui lòng tham khảo các cổng kết nối dưới đây:' : 'If you experience system issues or decoding errors, please consult our official channels:'}</p>
                <div className="space-y-2 pt-2 text-left">
                  <div className="p-3 bg-[#11161D] border border-[#2A313C] rounded-xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white">Email Hotline Support</p>
                      <p className="text-[10px] text-[#94A3B8]">support@webhexed.io</p>
                    </div>
                    <span className="text-[10px] font-bold text-[#3B82F6] uppercase">24/7 Active</span>
                  </div>
                  <div className="p-3 bg-[#11161D] border border-[#2A313C] rounded-xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white">Discord DevOps Channel</p>
                      <p className="text-[10px] text-[#94A3B8]">discord.gg/webhexed</p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">Live Chat</span>
                  </div>
                </div>
                <button onClick={() => setIsSupportSheetOpen(false)} className="w-full py-3 bg-[#3B82F6] text-white text-xs font-bold rounded-xl active:bg-blue-600 mt-3">{language === 'vi' ? 'Quay Lại' : 'Close'}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
