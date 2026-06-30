import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { FileUp, LogOut, ShieldAlert, Monitor, Home, Loader2 } from 'lucide-react';
import Auth from './components/Auth';
import Workspace from './components/Workspace';
import Dashboard from './components/Dashboard';
import PremiumBackground from './components/PremiumBackground';
import { UserProfile, UserSession } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { addRecentFile } from './utils/stats';
import { storeFile, getFile } from './utils/db';
import { useUI } from './components/UIProvider';
import { useLanguage } from './components/LanguageProvider';
import { useNavigate, useLocation, Routes, Route, Navigate, Outlet } from 'react-router-dom';

import LogoutConfirmModal from './components/LogoutConfirmModal';
import UserProfileView from './components/UserProfile';
import AdminPanel from './components/AdminPanel';

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
              {/* Global Navbar */}
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
                        <span className="hidden sm:inline">{t('backToDashboard')}</span>
                      </button>
                    } />
                    <Route path="/profile" element={
                      <button
                        onClick={() => navigate('/')}
                        className="flex items-center px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
                      >
                        <Home className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">{t('backToDashboard')}</span>
                      </button>
                    } />
                    <Route path="/admin" element={
                      <button
                        onClick={() => navigate('/')}
                        className="flex items-center px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
                      >
                        <Home className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">{t('backToDashboard')}</span>
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

              <div className="flex-1 flex overflow-hidden z-10 relative">
                <Outlet />
              </div>
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

        {/* Catch-all Redirect */}
        <Route path="*" element={<Navigate to={user ? "/" : "/auth"} replace />} />
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
    </div>
  );
}
