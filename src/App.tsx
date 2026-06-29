import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FileUp, LogOut, ShieldAlert, Monitor, Home, Loader2 } from 'lucide-react';
import Auth from './components/Auth';
import Workspace from './components/Workspace';
import Dashboard from './components/Dashboard';
import PremiumBackground from './components/PremiumBackground';
import { UserProfile, UserSession } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { addRecentFile } from './utils/stats';
import { storeFile } from './utils/db';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [banned, setBanned] = useState(false);
  const [view, setView] = useState<'auth' | 'dashboard' | 'workspace'>('auth');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setUser(currentUser);
            setUserProfile(docSnap.data() as UserProfile);
            setBanned(false);
            setView('dashboard');
            
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
          } else {
            const creationTime = new Date(currentUser.metadata.creationTime || '').getTime();
            const isJustCreated = Date.now() - creationTime < 10000;
            
            if (!isJustCreated) {
              await signOut(auth);
              setUser(null);
              setUserProfile(null);
              setBanned(true);
            } else {
              setUser(currentUser);
              setView('dashboard');
            }
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setView('auth');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    signOut(auth);
    handleCloseWorkspace();
    setBanned(false);
    setView('auth');
  };

  const handleUploadAndOpen = async (file: File) => {
    setSelectedFile(file);
    setFileId('local_stream');
    setView('workspace');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
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
    setView('dashboard');
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
      {/* Premium animated background */}
      <PremiumBackground />

      {!user ? (
        <div className="flex-1 flex items-center justify-center p-4 z-10">
          <Auth onSuccess={() => setView('dashboard')} />
        </div>
      ) : (
        <>
          {/* Global Navbar */}
          <nav className="bg-white/5 backdrop-blur-md border-b border-white/10 px-6 py-3 flex items-center justify-between shadow-sm z-20">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 to-blue-600 text-white rounded-md flex items-center justify-center font-bold font-mono">
                Hx
              </div>
              <span className="font-semibold text-white text-lg tracking-tight">WebHexed</span>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-4">
              {view === 'workspace' && (
                <button
                  onClick={handleCloseWorkspace}
                  className="flex items-center px-2 sm:px-3 py-1.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                >
                  <Home className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Về Dashboard</span>
                </button>
              )}
              {view === 'dashboard' && (
                <label className="flex items-center px-2 sm:px-4 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-md transition-colors text-sm font-medium cursor-pointer border border-blue-500/30">
                  <FileUp className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Mở File</span>
                  <input type="file" className="hidden" onChange={handleFileChange} />
                </label>
              )}
              
              <div className="h-6 w-px bg-white/10 mx-1 sm:mx-2"></div>
              
              <span className="text-sm text-white/50 hidden sm:block truncate max-w-[150px]">
                {userProfile?.displayName || user.email}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center px-2 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </nav>

          {/* Main Content Area */}
          <div className="flex-1 flex overflow-hidden z-10 relative">
            <AnimatePresence mode="wait">
              {view === 'dashboard' && (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 flex w-full h-full"
                >
                  <Dashboard 
                    user={user} 
                    profile={userProfile} 
                    onLogout={handleLogout}
                    onOpenFile={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.onchange = (e: any) => handleFileChange(e);
                      input.click();
                    }}
                    onOpenCloudFile={async (file) => {
                      await handleUploadAndOpen(file);
                    }}
                  />
                </motion.div>
              )}
              
              {view === 'workspace' && selectedFile && fileId && (
                <motion.div 
                  key="workspace"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 flex w-full h-full"
                >
                  <Workspace file={selectedFile} fileId={fileId} onClose={handleCloseWorkspace} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Global uploading screen overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-[#0B0F19]/90 backdrop-blur-md flex flex-col items-center justify-center z-50">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_24px_rgba(168,85,247,0.4)]"></div>
          <h3 className="text-xl font-semibold text-white mb-2">Đang xử lý tệp tin...</h3>
          <p className="text-sm text-white/60">Tải dữ liệu trực tiếp lên máy chủ để xử lý tối ưu</p>
        </div>
      )}
    </div>
  );
}
