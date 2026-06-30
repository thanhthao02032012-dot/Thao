import React, { useState } from 'react';
import { auth, googleProvider, githubProvider, db } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  AuthProvider,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Lock, Mail, Github, Chrome, ArrowRight, ShieldAlert, User as UserIcon } from 'lucide-react';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from './LanguageProvider';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function Auth({ onSuccess }: { onSuccess: () => void }) {
  const { language, t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isForgotEmail, setIsForgotEmail] = useState(false);
  const [recoveryDisplayName, setRecoveryDisplayName] = useState('');
  const [recoveryResults, setRecoveryResults] = useState<{ emailMasked: string, provider: string }[] | null>(null);
  const [regDisplayName, setRegDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // CAPTCHA State
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState({ a: 0, b: 0 });
  const [requiresCaptcha, setRequiresCaptcha] = useState(false);

  const generateCaptcha = () => {
    setCaptchaQuestion({ 
      a: Math.floor(Math.random() * 10) + 1, 
      b: Math.floor(Math.random() * 10) + 1 
    });
    setCaptchaAnswer('');
    setRequiresCaptcha(true);
  };

  const handleProviderSignIn = async (provider: AuthProvider, providerName: string) => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        const userProfile: UserProfile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          provider: providerName,
          role: user.email === 'thanhthao02032012@gmail.com' ? 'admin' : 'user',
          createdAt: Date.now()
        };
        await setDoc(docRef, userProfile);
      }
      onSuccess();
    } catch (err: any) {
      console.error(`Firebase Auth error for ${providerName}:`, err);
      if (err.code === 'auth/account-exists-with-different-credential') {
        setError('Email của tài khoản này đã được đăng ký bằng phương thức khác (ví dụ: đăng nhập mật khẩu hoặc nhà cung cấp khác). Vui lòng đăng nhập bằng phương thức ban đầu.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Trình duyệt đã chặn cửa sổ bật lên (popup). Vui lòng cấp quyền mở popup cho trang web này ở thanh địa chỉ trình duyệt rồi thử lại.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất đăng nhập.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError(`Phương thức đăng nhập bằng ${providerName} chưa được kích hoạt trong cấu hình Firebase. Vui lòng liên hệ quản trị viên để bật tính năng này.`);
      } else if (err.code === 'auth/network-request-failed') {
        setError('Lỗi kết nối mạng. Vui lòng kiểm tra lại kết nối internet của bạn.');
      } else {
        setError(`Lỗi đăng nhập ${providerName}: ${err.message || 'Vui lòng thử lại hoặc sử dụng đăng nhập bằng Email.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (requiresCaptcha && !isForgotEmail) {
      if (parseInt(captchaAnswer) !== captchaQuestion.a + captchaQuestion.b) {
        setError(language === 'vi' ? 'Mã CAPTCHA không chính xác. Vui lòng thử lại.' : 'Incorrect CAPTCHA answer. Please try again.');
        generateCaptcha();
        return;
      }
    }

    setLoading(true);

    try {
      if (isForgotEmail) {
        setRecoveryResults(null);
        const trimmedName = recoveryDisplayName.trim();
        if (!trimmedName) {
          setError(language === 'vi' ? 'Vui lòng nhập tên hiển thị để khôi phục.' : 'Please enter a display name to recover.');
          setLoading(false);
          return;
        }

        let querySnapshot;
        try {
          const q = query(collection(db, 'public_profiles'), where('displayName', '==', trimmedName));
          querySnapshot = await getDocs(q);
        } catch (dbErr: any) {
          handleFirestoreError(dbErr, OperationType.LIST, 'public_profiles');
        }
        
        if (querySnapshot && querySnapshot.empty) {
          setError(language === 'vi' ? 'Không tìm thấy tài khoản nào khớp với tên hiển thị này.' : 'No accounts match this display name.');
        } else if (querySnapshot) {
          const results: { emailMasked: string, provider: string }[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            results.push({
              emailMasked: data.emailMasked || '***',
              provider: data.provider || 'Email'
            });
          });
          setRecoveryResults(results);
          setSuccessMsg(language === 'vi' ? `Tìm thấy ${results.length} tài khoản liên kết.` : `Found ${results.length} matching accounts.`);
        }
        setLoading(false);
        return;
      }

      if (isForgotPassword) {
        await sendPasswordResetEmail(auth, email);
        setSuccessMsg(language === 'vi' ? 'Đã gửi email khôi phục mật khẩu. Vui lòng kiểm tra hộp thư của bạn.' : 'Password reset email sent. Please check your inbox.');
        setIsForgotPassword(false);
        setLoading(false);
        return;
      }

      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const trimmedRegDisplayName = regDisplayName.trim();
        if (!trimmedRegDisplayName) {
          setError(language === 'vi' ? 'Vui lòng nhập tên hiển thị / tên tài khoản.' : 'Please enter a display name / account name.');
          setLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userProfile: UserProfile = {
          uid: user.uid,
          email: user.email,
          displayName: trimmedRegDisplayName,
          provider: 'Email',
          role: user.email === 'thanhthao02032012@gmail.com' ? 'admin' : 'user',
          createdAt: Date.now()
        };
        try {
          try {
            await setDoc(doc(db, 'users', user.uid), userProfile);
          } catch (errUser) {
            handleFirestoreError(errUser, OperationType.WRITE, `users/${user.uid}`);
          }
          
          let currentMasked = '***';
          const emailToMask = user.email || '';
          if (emailToMask && emailToMask.includes('@')) {
            const [local, domain] = emailToMask.split('@');
            if (local.length > 2) {
              currentMasked = local.slice(0, 2) + '*'.repeat(Math.max(3, local.length - 4)) + local.slice(-2) + '@' + domain;
            } else {
              currentMasked = local[0] + '***@' + domain;
            }
          }

          try {
            await setDoc(doc(db, 'public_profiles', user.uid), {
              uid: user.uid,
              displayName: trimmedRegDisplayName,
              emailMasked: currentMasked,
              provider: 'Email',
              createdAt: Date.now()
            });
          } catch (errPub) {
            handleFirestoreError(errPub, OperationType.WRITE, `public_profiles/${user.uid}`);
          }
        } catch (dbErr) {
          console.warn("Could not save user profile:", dbErr);
        }
      }
      
      setFailedAttempts(0);
      setRequiresCaptcha(false);
      onSuccess();
    } catch (err: any) {
      let friendlyMessage = err.message || (language === 'vi' ? 'Đã xảy ra lỗi' : 'An error occurred');
      
      // Check if it is a security rule / permission error
      let isPermissionError = false;
      if (err.message && err.message.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.error && (parsed.error.includes('permission') || parsed.error.includes('denied'))) {
            isPermissionError = true;
          }
        } catch (e) {}
      } else if (err.code === 'permission-denied' || (err.message && err.message.includes('permission'))) {
        isPermissionError = true;
      }

      if (isPermissionError) {
        friendlyMessage = language === 'vi' 
          ? 'Hệ thống từ chối truy cập do lỗi phân quyền. Vui lòng liên hệ Admin để được hỗ trợ.' 
          : 'Access denied due to system permission rules. Please contact Admin for assistance.';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        friendlyMessage = language === 'vi' ? 'Email hoặc mật khẩu không chính xác.' : 'Incorrect email or password.';
      } else if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = language === 'vi' ? 'Email này đã được sử dụng.' : 'This email is already in use.';
      } else if (err.code === 'auth/weak-password') {
        friendlyMessage = language === 'vi' ? 'Mật khẩu quá yếu (tối thiểu 6 ký tự).' : 'Weak password (minimum 6 characters).';
      }
      
      setError(friendlyMessage);
      
      if (isLogin) {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        if (newAttempts >= 2) {
          generateCaptcha();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto relative z-10">
      <div className="bg-[#121829] border border-white/10 rounded-2xl shadow-lg p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5 pointer-events-none"></div>
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50"></div>
        
        <div className="text-center mb-8 relative z-10">
          <div className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-blue-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-md">
            <span className="font-mono font-bold text-white text-2xl tracking-tighter">Hx</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {isForgotEmail ? (language === 'vi' ? 'Tìm tài khoản' : 'Find Account') : isForgotPassword ? (language === 'vi' ? 'Khôi phục mật khẩu' : 'Reset Password') : (isLogin ? t('welcomeBack') : (language === 'vi' ? 'Tạo tài khoản mới' : 'Create New Account'))}
          </h2>
          <p className="text-white/60 text-sm mt-2">
            {isForgotEmail ? (language === 'vi' ? 'Nhập tên hiển thị chính xác để khôi phục email tài khoản.' : 'Enter your exact display name to find your account email.') : isForgotPassword ? (language === 'vi' ? 'Nhập email để nhận liên kết đặt lại mật khẩu.' : 'Enter email to receive reset link.') : t('authDesc')}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start text-red-400 text-sm backdrop-blur-sm">
            <ShieldAlert className="w-5 h-5 mr-2 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-3 bg-green-500/10 border border-green-500/30 rounded-xl flex items-start text-green-400 text-sm backdrop-blur-sm">
            <span>{successMsg}</span>
          </div>
        )}

        {!isForgotPassword && !isForgotEmail && (
          <div className="space-y-3 mb-6">
            <button 
              onClick={() => handleProviderSignIn(googleProvider, 'Google')}
              type="button" 
              className="w-full flex items-center justify-center px-4 py-3 border border-white/10 rounded-xl bg-white/5 text-white hover:bg-white/10 transition-all text-sm font-medium cursor-pointer"
            >
              <Chrome className="w-5 h-5 mr-3 text-red-400" /> {language === 'vi' ? 'Tiếp tục với Google' : 'Continue with Google'}
            </button>
            <button 
              onClick={() => handleProviderSignIn(githubProvider, 'GitHub')}
              type="button" 
              className="w-full flex items-center justify-center px-4 py-3 border border-white/10 rounded-xl bg-white/5 text-white hover:bg-white/10 transition-all text-sm font-medium cursor-pointer"
            >
              <Github className="w-5 h-5 mr-3" /> {language === 'vi' ? 'Tiếp tục với GitHub' : 'Continue with GitHub'}
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-[#0d0d12]/90 text-white/40">{language === 'vi' ? 'hoặc' : 'or'}</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isForgotEmail ? (
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1 ml-1 uppercase tracking-wider">{language === 'vi' ? 'Tên hiển thị để khôi phục' : 'Display name to find'}</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="text"
                  required
                  value={recoveryDisplayName}
                  onChange={(e) => setRecoveryDisplayName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-white placeholder-white/20"
                  placeholder={language === 'vi' ? 'Ví dụ: thhao02' : 'e.g. thhao02'}
                />
              </div>
            </div>
          ) : (
            <>
              {!isLogin && !isForgotPassword && (
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1 ml-1 uppercase tracking-wider">{language === 'vi' ? 'Tên hiển thị / Tên tài khoản' : 'Display name / Account name'}</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <input
                      type="text"
                      required
                      value={regDisplayName}
                      onChange={(e) => setRegDisplayName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-white placeholder-white/20"
                      placeholder={language === 'vi' ? 'Ví dụ: thhao02' : 'e.g. thhao02'}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-white/60 mb-1 ml-1 uppercase tracking-wider">{t('emailAddress')}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-white placeholder-white/20"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              {!isForgotPassword && (
                <div>
                  <div className="flex justify-between items-center mb-1 ml-1">
                    <label className="block text-xs font-medium text-white/60 uppercase tracking-wider">{t('password')}</label>
                    {isLogin && (
                      <div className="flex items-center space-x-2 text-xs">
                        <button type="button" onClick={() => { setIsForgotEmail(true); setIsForgotPassword(false); setError(''); setSuccessMsg(''); setRecoveryResults(null); }} className="text-purple-400 hover:text-purple-300 transition-colors cursor-pointer">
                          {language === 'vi' ? 'Quên tài khoản?' : 'Forgot username?'}
                        </button>
                        <span className="text-white/20 select-none">•</span>
                        <button type="button" onClick={() => { setIsForgotPassword(true); setIsForgotEmail(false); setError(''); setSuccessMsg(''); }} className="text-purple-400 hover:text-purple-300 transition-colors cursor-pointer">
                          {t('forgotPassword')}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-white placeholder-white/20"
                      placeholder="••••••••"
                      minLength={6}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {requiresCaptcha && !isForgotEmail && (
            <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-xl mt-4">
              <div className="flex items-center mb-2">
                <ShieldAlert className="w-4 h-4 text-orange-400 mr-2" />
                <label className="block text-xs font-semibold text-orange-400 uppercase tracking-wider">{language === 'vi' ? 'Xác minh bảo mật' : 'Security Verification'}</label>
              </div>
              <p className="text-xs text-white/60 mb-3">{language === 'vi' ? 'Phát hiện hoạt động bất thường. Vui lòng giải phép toán để tiếp tục.' : 'Unusual activity detected. Please solve the math problem to continue.'}</p>
              <div className="flex items-center space-x-3">
                <div className="text-sm font-bold bg-black/30 px-3 py-2 border border-white/10 rounded-lg whitespace-nowrap text-white">
                  {captchaQuestion.a} + {captchaQuestion.b} =
                </div>
                <input
                  type="number"
                  required
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg focus:outline-none focus:border-purple-500 text-white"
                  placeholder="?"
                />
              </div>
            </div>
          )}

          {isForgotEmail && recoveryResults && (
            <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl space-y-3 mt-4 border-dashed">
              <p className="text-xs text-purple-300 font-bold uppercase tracking-wider">{language === 'vi' ? 'Tài khoản tìm thấy:' : 'Accounts found:'}</p>
              <div className="space-y-2">
                {recoveryResults.map((res, i) => (
                  <div key={i} className="flex justify-between items-center bg-black/30 p-3 rounded-lg border border-white/5">
                    <div className="text-left min-w-0">
                      <p className="text-sm font-mono text-white select-all truncate">{res.emailMasked}</p>
                      <p className="text-[10px] text-white/40">{language === 'vi' ? 'Phương thức đăng nhập:' : 'Login Method:'} {res.provider}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded font-semibold ml-2 whitespace-nowrap">
                      {res.provider === 'Email' ? (language === 'vi' ? 'Mật khẩu' : 'Password') : res.provider}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-3 mt-6 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 disabled:opacity-50 transition-all group cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                {language === 'vi' ? 'Đang xử lý...' : 'Processing...'}
              </span>
            ) : (
              <>
                {isForgotEmail ? (language === 'vi' ? 'Tìm tài khoản liên kết' : 'Find accounts') : isForgotPassword ? (language === 'vi' ? 'Gửi liên kết khôi phục' : 'Send reset link') : (isLogin ? t('loginButton') : t('registerButton'))}
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          {isForgotPassword || isForgotEmail ? (
            <button 
              onClick={() => { setIsForgotPassword(false); setIsForgotEmail(false); setError(''); setSuccessMsg(''); setRecoveryResults(null); }} 
              className="text-sm font-medium text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              {language === 'vi' ? 'Quay lại đăng nhập' : 'Back to login'}
            </button>
          ) : (
            <p className="text-sm text-white/60">
              {isLogin ? t('noAccount') : t('hasAccount')}{' '}
              <button
                onClick={() => { setIsLogin(!isLogin); setError(''); setRequiresCaptcha(false); }}
                className="font-medium text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
              >
                {isLogin ? (language === 'vi' ? 'Đăng ký ngay' : 'Register now') : (language === 'vi' ? 'Đăng nhập' : 'Sign in')}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
