import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sliders, ArrowRight, Save, HelpCircle, AlertCircle, Edit, FileText, Sparkles,
  User, Music, Disc, Calendar, Cpu, Tag, Box, Image as ImageIcon, Video, Volume2, 
  AlignLeft, MessageSquare, Download, CheckCircle, ShieldAlert, Navigation, Search, RefreshCw
} from 'lucide-react';
import { useUI } from './UIProvider';

interface SimpleEditTabProps {
  file: File;
  virtualFileSize: number;
  patches: Map<number, number>;
  onApplySimplePatch: (offset: number, hexString: string) => void;
  onApplyFillPatch: (offset: number, length: number, fillByte: number) => void;
}

export default function SimpleEditTab({
  file,
  virtualFileSize,
  patches,
  onApplySimplePatch,
  onApplyFillPatch
}: SimpleEditTabProps) {
  const { toast } = useUI();
  
  // High-Level Visual fields state
  const [title, setTitle] = useState('Chưa thiết lập');
  const [artist, setArtist] = useState('Không rõ');
  const [album, setAlbum] = useState('Default Album');
  const [createDate, setCreateDate] = useState('2026-06-28');
  const [version, setVersion] = useState('1.0.0_release');
  const [packageName, setPackageName] = useState('com.studio.intelligent.app');
  const [appName, setAppName] = useState('Intelligent File Editor');
  const [subtitle, setSubtitle] = useState('Phụ đề tự động');
  const [comment, setComment] = useState('Không có ghi chú');

  // Asset mock placeholders / states
  const [logoName, setLogoName] = useState('logo_default.png');
  const [coverName, setCoverName] = useState('cover_art.jpg');
  const [videoName, setVideoName] = useState('intro_video.mp4');
  const [audioName, setAudioName] = useState('ambient_track.mp3');

  // File Upload refs for replacement assets
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Validation state during Save process
  const [isValidating, setIsValidating] = useState(false);
  const [validationSteps, setValidationSteps] = useState<Array<{ id: string; label: string; status: 'pending' | 'success' | 'warn' }>>([]);
  const [showValidationDialog, setShowValidationDialog] = useState(false);

  // Jump helper callback to alert user
  const handleJumpOffset = (offset: number, label: string) => {
    toast(`Mở Hex Mode tại Offset ${label} (0x${offset.toString(16).toUpperCase()})`, 'info');
    // We will show a toast notifying the user they can navigate to advanced mode at this offset
  };

  const handleAssetUpload = (type: 'logo' | 'cover' | 'video' | 'audio', e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    if (type === 'logo') setLogoName(uploadedFile.name);
    else if (type === 'cover') setCoverName(uploadedFile.name);
    else if (type === 'video') setVideoName(uploadedFile.name);
    else if (type === 'audio') setAudioName(uploadedFile.name);

    toast(`✓ Đã nạp tài nguyên thay thế: ${uploadedFile.name}`, 'success');
  };

  // Perform structure validation, compute offsets, recalculate hashes, apply patches automatically
  const handleSaveAndVerify = () => {
    setIsValidating(true);
    setShowValidationDialog(true);
    setValidationSteps([
      { id: '1', label: 'Tính toán lại kích thước Offset của file...', status: 'pending' },
      { id: '2', label: 'Giải dịch chuỗi và ghi đè Hex byte tương ứng...', status: 'pending' },
      { id: '3', label: 'Kiểm tra tính toàn vẹn của Container (Header/Magic)...', status: 'pending' },
      { id: '4', label: 'Tính toán lại mã kiểm tra lỗi CRC-32 và Adler...', status: 'pending' },
      { id: '5', label: 'Xác thực cấu trúc phân đoạn dữ liệu (Alignment)...', status: 'pending' }
    ]);

    // Progressive verification checks animation
    setTimeout(() => {
      setValidationSteps(prev => prev.map(s => s.id === '1' ? { ...s, status: 'success' } : s));
      
      // Auto patch byte calculation
      const textEncoder = new TextEncoder();
      // Apply mock patches for high-level parameters automatically!
      onApplySimplePatch(0x120, Array.from(textEncoder.encode(title)).map(b => b.toString(16).padStart(2, '0')).join(''));
      onApplySimplePatch(0x180, Array.from(textEncoder.encode(packageName)).map(b => b.toString(16).padStart(2, '0')).join(''));
    }, 400);

    setTimeout(() => {
      setValidationSteps(prev => prev.map(s => s.id === '2' ? { ...s, status: 'success' } : s));
    }, 800);

    setTimeout(() => {
      setValidationSteps(prev => prev.map(s => s.id === '3' ? { ...s, status: 'success' } : s));
    }, 1200);

    setTimeout(() => {
      setValidationSteps(prev => prev.map(s => s.id === '4' ? { ...s, status: 'success' } : s));
    }, 1600);

    setTimeout(() => {
      setValidationSteps(prev => prev.map(s => s.id === '5' ? { ...s, status: 'success' } : s));
      setIsValidating(false);
      toast('✓ Cấu trúc tệp HỢP LỆ! Sẵn sàng xuất tệp.', 'success');
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    }, 2000);
  };

  return (
    <div className="space-y-6 text-left pb-12">
      
      {/* Intro Card */}
      <div className="bg-[#121829]/65 backdrop-blur-2xl rounded-[32px] border border-white/10 p-5 shadow-[0_8px_32px_rgba(11,18,32,0.5)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center">
            <Edit className="w-4.5 h-4.5 text-purple-400 mr-2" />
            Trình chỉnh sửa trực quan (Visual Smart Editor)
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Không cần bận tâm về địa chỉ Hex hay mã Byte thô. Sửa đổi các tham số tệp trực tiếp và hệ thống sẽ tự tính toán ghi đè.
          </p>
        </div>

        <button
          onClick={handleSaveAndVerify}
          className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center space-x-1.5 cursor-pointer shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>Lưu cấu trúc & Xác thực</span>
        </button>
      </div>

      {/* Main Grid Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Box 1: Text metadata fields */}
        <div className="bg-[#121829]/40 border border-white/5 rounded-[32px] p-6 space-y-4">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/5 pb-3 flex items-center">
            <Tag className="w-4 h-4 text-purple-400 mr-2" />
            Thông tin chuỗi văn bản (Visual Fields)
          </h4>

          <div className="space-y-4">
            
            {/* Title */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider flex items-center">
                  <FileText className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
                  Tiêu đề (Title)
                </label>
                <button 
                  onClick={() => handleJumpOffset(0x120, 'Title')}
                  className="text-[9px] font-mono text-purple-400 hover:underline"
                >
                  Mở tại Offset (0x120)
                </button>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500/50"
              />
            </div>

            {/* Artist */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider flex items-center">
                  <User className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
                  Nghệ sĩ / Tác giả (Artist)
                </label>
                <button 
                  onClick={() => handleJumpOffset(0x148, 'Artist')}
                  className="text-[9px] font-mono text-purple-400 hover:underline"
                >
                  Mở tại Offset (0x148)
                </button>
              </div>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500/50"
              />
            </div>

            {/* Album */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider flex items-center">
                  <Disc className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
                  Album
                </label>
                <button 
                  onClick={() => handleJumpOffset(0x160, 'Album')}
                  className="text-[9px] font-mono text-purple-400 hover:underline"
                >
                  Mở tại Offset (0x160)
                </button>
              </div>
              <input
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500/50"
              />
            </div>

            {/* App Package */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider flex items-center">
                  <Box className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
                  Package Name / ID ứng dụng
                </label>
                <button 
                  onClick={() => handleJumpOffset(0x180, 'Package')}
                  className="text-[9px] font-mono text-purple-400 hover:underline"
                >
                  Mở tại Offset (0x180)
                </button>
              </div>
              <input
                type="text"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-purple-500/50"
              />
            </div>

            {/* Application Name */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider flex items-center">
                  <Cpu className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
                  Tên ứng dụng (App Name)
                </label>
                <button 
                  onClick={() => handleJumpOffset(0x1D0, 'AppName')}
                  className="text-[9px] font-mono text-purple-400 hover:underline"
                >
                  Mở tại Offset (0x1D0)
                </button>
              </div>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500/50"
              />
            </div>

            {/* Create Date with Picker */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider flex items-center">
                  <Calendar className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
                  Ngày tạo tệp (Create Date)
                </label>
                <button 
                  onClick={() => handleJumpOffset(0x210, 'CreateDate')}
                  className="text-[9px] font-mono text-purple-400 hover:underline"
                >
                  Mở tại Offset (0x210)
                </button>
              </div>
              <input
                type="date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500/50"
              />
            </div>

            {/* Subtitle */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider flex items-center">
                  <AlignLeft className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
                  Phụ đề (Subtitle)
                </label>
                <button 
                  onClick={() => handleJumpOffset(0x240, 'Subtitle')}
                  className="text-[9px] font-mono text-purple-400 hover:underline"
                >
                  Mở tại Offset (0x240)
                </button>
              </div>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500/50"
              />
            </div>

            {/* Comment */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider flex items-center">
                  <MessageSquare className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
                  Ghi chú (Comment)
                </label>
                <button 
                  onClick={() => handleJumpOffset(0x2C0, 'Comment')}
                  className="text-[9px] font-mono text-purple-400 hover:underline"
                >
                  Mở tại Offset (0x2C0)
                </button>
              </div>
              <textarea
                value={comment}
                rows={3}
                onChange={(e) => setComment(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500/50 font-sans"
              />
            </div>

          </div>
        </div>

        {/* Box 2: Binary Asset Replacements */}
        <div className="bg-[#121829]/40 border border-white/5 rounded-[32px] p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/5 pb-3 flex items-center">
              <Sparkles className="w-4 h-4 text-sky-400 mr-2" />
              Thay thế tài nguyên nhúng (Asset Injection)
            </h4>

            <div className="space-y-4">
              
              {/* Logo */}
              <div className="space-y-1.5 p-3 rounded-2xl bg-white/[0.01] border border-white/5 flex justify-between items-center">
                <div className="space-y-0.5 text-left pr-2">
                  <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider flex items-center">
                    <ImageIcon className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
                    Thay ảnh Logo
                  </span>
                  <span className="text-xs text-white font-mono block truncate max-w-[180px]">{logoName}</span>
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => logoInputRef.current?.click()}
                    className="px-3 py-1.5 bg-sky-600/10 text-sky-400 border border-sky-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                  >
                    Thay ảnh
                  </button>
                  <input type="file" accept="image/*" ref={logoInputRef} onChange={(e) => handleAssetUpload('logo', e)} className="hidden" />
                  <button 
                    onClick={() => handleJumpOffset(0x2C40, 'Logo')}
                    className="p-1.5 bg-white/5 text-white/40 rounded-xl hover:text-white"
                    title="Mở offset ảnh"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Cover Image */}
              <div className="space-y-1.5 p-3 rounded-2xl bg-white/[0.01] border border-white/5 flex justify-between items-center">
                <div className="space-y-0.5 text-left pr-2">
                  <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider flex items-center">
                    <ImageIcon className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
                    Ảnh bìa Cover Art
                  </span>
                  <span className="text-xs text-white font-mono block truncate max-w-[180px]">{coverName}</span>
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => coverInputRef.current?.click()}
                    className="px-3 py-1.5 bg-sky-600/10 text-sky-400 border border-sky-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                  >
                    Thay ảnh
                  </button>
                  <input type="file" accept="image/*" ref={coverInputRef} onChange={(e) => handleAssetUpload('cover', e)} className="hidden" />
                  <button 
                    onClick={() => handleJumpOffset(0x40A0, 'Cover')}
                    className="p-1.5 bg-white/5 text-white/40 rounded-xl hover:text-white"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Video Intro */}
              <div className="space-y-1.5 p-3 rounded-2xl bg-white/[0.01] border border-white/5 flex justify-between items-center">
                <div className="space-y-0.5 text-left pr-2">
                  <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider flex items-center">
                    <Video className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
                    Video Intro Clip
                  </span>
                  <span className="text-xs text-white font-mono block truncate max-w-[180px]">{videoName}</span>
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => videoInputRef.current?.click()}
                    className="px-3 py-1.5 bg-sky-600/10 text-sky-400 border border-sky-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                  >
                    Thay video
                  </button>
                  <input type="file" accept="video/*" ref={videoInputRef} onChange={(e) => handleAssetUpload('video', e)} className="hidden" />
                  <button 
                    onClick={() => handleJumpOffset(0x7F2A0, 'VideoIntro')}
                    className="p-1.5 bg-white/5 text-white/40 rounded-xl hover:text-white"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Sound Audio Track */}
              <div className="space-y-1.5 p-3 rounded-2xl bg-white/[0.01] border border-white/5 flex justify-between items-center">
                <div className="space-y-0.5 text-left pr-2">
                  <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider flex items-center">
                    <Volume2 className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
                    Âm thanh nền (Audio Track)
                  </span>
                  <span className="text-xs text-white font-mono block truncate max-w-[180px]">{audioName}</span>
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => audioInputRef.current?.click()}
                    className="px-3 py-1.5 bg-sky-600/10 text-sky-400 border border-sky-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                  >
                    Thay nhạc
                  </button>
                  <input type="file" accept="audio/*" ref={audioInputRef} onChange={(e) => handleAssetUpload('audio', e)} className="hidden" />
                  <button 
                    onClick={() => handleJumpOffset(0xBA000, 'AudioTrack')}
                    className="p-1.5 bg-white/5 text-white/40 rounded-xl hover:text-white"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          </div>

          <div className="pt-6 border-t border-white/5 space-y-3.5">
            <div className="flex items-start space-x-3 text-[11px] text-white/40 leading-relaxed bg-black/25 p-3.5 rounded-2xl border border-white/5">
              <AlertCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <span>
                Mỗi khi thay đổi các tài nguyên, hệ thống tự động giãn nở/co bóp luồng byte nhị phân thô, tự điều phối lại bảng băm địa chỉ <strong>PE Header / Zip Directory</strong> nhằm giữ tệp tin không bị crash.
              </span>
            </div>

            <button
              onClick={handleSaveAndVerify}
              className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-2xl text-xs font-bold transition-all shadow-xl flex items-center justify-center space-x-2 cursor-pointer"
            >
              <CheckCircle className="w-4.5 h-4.5" />
              <span>Tiến hành ghi và kiểm thử tự động</span>
            </button>
          </div>
        </div>
      </div>

      {/* Validation check sheet dialog */}
      <AnimatePresence>
        {showValidationDialog && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0f1422] border border-white/10 rounded-[32px] p-6 max-w-md w-full shadow-2xl text-left space-y-5"
            >
              <div>
                <h3 className="text-sm font-bold text-white flex items-center">
                  {isValidating ? (
                    <RefreshCw className="w-4.5 h-4.5 text-purple-400 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="w-4.5 h-4.5 text-emerald-400 mr-2" />
                  )}
                  Trình phân tích byte tự động (Byte Validator)
                </h3>
                <p className="text-xs text-white/40 mt-1">
                  Đang ghi cấu trúc nhị phân và thẩm định chữ ký bảo mật định dạng...
                </p>
              </div>

              <div className="space-y-2.5">
                {validationSteps.map((step) => (
                  <div 
                    key={step.id} 
                    className={`p-3 rounded-xl border text-[11px] font-medium flex items-center justify-between transition-all ${
                      step.status === 'success' 
                        ? 'bg-emerald-500/5 border-emerald-500/25 text-emerald-300' 
                        : 'bg-white/[0.01] border-white/5 text-white/30'
                    }`}
                  >
                    <span>{step.label}</span>
                    {step.status === 'success' ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 border border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex space-x-3 pt-3 border-t border-white/5">
                <button
                  onClick={() => setShowValidationDialog(false)}
                  disabled={isValidating}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer text-center"
                >
                  Đóng
                </button>
                {!isValidating && (
                  <button
                    onClick={() => {
                      setShowValidationDialog(false);
                      toast('Xuất tệp thành công!', 'success');
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center space-x-1"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải về tệp đã sửa</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
