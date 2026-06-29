import React, { useState } from 'react';
import { auth, googleProvider, githubProvider, db } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  AuthProvider,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Lock, Mail, Github, Chrome, ArrowRight, ShieldAlert } from 'lucide-react';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export default function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
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

    if (requiresCaptcha) {
      if (parseInt(captchaAnswer) !== captchaQuestion.a + captchaQuestion.b) {
        setError('Mã CAPTCHA không chính xác. Vui lòng thử lại.');
        generateCaptcha();
        return;
      }
    }

    setLoading(true);

    try {
      if (isForgotPassword) {
        await sendPasswordResetEmail(auth, email);
        setSuccessMsg('Đã gửi email khôi phục mật khẩu. Vui lòng kiểm tra hộp thư của bạn.');
        setIsForgotPassword(false);
        setLoading(false);
        return;
      }

      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userProfile: UserProfile = {
          uid: user.uid,
          email: user.email,
          provider: 'Email',
          role: user.email === 'thanhthao02032012@gmail.com' ? 'admin' : 'user',
          createdAt: Date.now()
        };
        try {
          await setDoc(doc(db, 'users', user.uid), userProfile);
        } catch (dbErr) {
          console.warn("Could not save user profile:", dbErr);
        }
      }
      
      setFailedAttempts(0);
      setRequiresCaptcha(false);
      onSuccess();
    } catch (err: any) {
      let friendlyMessage = err.message || 'Đã xảy ra lỗi';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        friendlyMessage = 'Email hoặc mật khẩu không chính xác.';
      } else if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = 'Email này đã được sử dụng.';
      } else if (err.code === 'auth/weak-password') {
        friendlyMessage = 'Mật khẩu quá yếu (tối thiểu 6 ký tự).';
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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-md mx-auto relative z-10"
    >
      <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5 pointer-events-none"></div>
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50"></div>
        
        <div className="text-center mb-8 relative z-10">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-blue-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-purple-500/30"
          >
            <span className="font-mono font-bold text-white text-2xl tracking-tighter">Hx</span>
          </motion.div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {isForgotPassword ? 'Khôi phục mật khẩu' : (isLogin ? 'Đăng nhập vào hệ thống' : 'Tạo tài khoản mới')}
          </h2>
          <p className="text-white/60 text-sm mt-2">
            {isForgotPassword ? 'Nhập email để nhận liên kết đặt lại mật khẩu.' : 'Hệ thống phân tích & chỉnh sửa dữ liệu nhị phân'}
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

        {!isForgotPassword && (
          <div className="space-y-3 mb-6">
            <button 
              onClick={() => handleProviderSignIn(googleProvider, 'Google')}
              type="button" 
              className="w-full flex items-center justify-center px-4 py-3 border border-white/10 rounded-xl bg-white/5 text-white hover:bg-white/10 transition-all text-sm font-medium"
            >
              <Chrome className="w-5 h-5 mr-3 text-red-400" /> Tiếp tục với Google
            </button>
            <button 
              onClick={() => handleProviderSignIn(githubProvider, 'GitHub')}
              type="button" 
              className="w-full flex items-center justify-center px-4 py-3 border border-white/10 rounded-xl bg-white/5 text-white hover:bg-white/10 transition-all text-sm font-medium"
            >
              <Github className="w-5 h-5 mr-3" /> Tiếp tục với GitHub
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-transparent text-white/40">hoặc</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1 ml-1 uppercase tracking-wider">Email Address</label>
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
                <label className="block text-xs font-medium text-white/60 uppercase tracking-wider">Password</label>
                {isLogin && (
                  <button type="button" onClick={() => setIsForgotPassword(true)} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                    Quên mật khẩu?
                  </button>
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

          {requiresCaptcha && (
            <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-xl mt-4">
              <div className="flex items-center mb-2">
                <ShieldAlert className="w-4 h-4 text-orange-400 mr-2" />
                <label className="block text-xs font-semibold text-orange-400 uppercase tracking-wider">Xác minh bảo mật</label>
              </div>
              <p className="text-xs text-white/60 mb-3">Phát hiện hoạt động bất thường. Vui lòng giải phép toán để tiếp tục.</p>
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

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-3 mt-6 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 disabled:opacity-50 transition-all group"
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Đang xử lý...
              </span>
            ) : (
              <>
                {isForgotPassword ? 'Gửi liên kết khôi phục' : (isLogin ? 'Đăng nhập' : 'Đăng ký')}
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          {isForgotPassword ? (
            <button onClick={() => setIsForgotPassword(false)} className="text-sm font-medium text-white/60 hover:text-white transition-colors">
              Quay lại đăng nhập
            </button>
          ) : (
            <p className="text-sm text-white/60">
              {isLogin ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{' '}
              <button
                onClick={() => { setIsLogin(!isLogin); setError(''); setRequiresCaptcha(false); }}
                className="font-medium text-purple-400 hover:text-purple-300 transition-colors"
              >
                {isLogin ? 'Đăng ký ngay' : 'Đăng nhập'}
              </button>
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
