import React, { useState, useEffect } from 'react';
import HexEditor from './HexEditor';
import ByteChart from './ByteChart';
import MediaPreview from './MediaPreview';
import FileAnalyzer from './FileAnalyzer';
import BulkEditor from './BulkEditor';
import SignatureEditor from './SignatureEditor';
import { Edit3, Eye, FileSearch, X, PenTool, Database, ShieldCheck, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface WorkspaceProps {
  file: File;
  fileId: string;
  onClose: () => void;
}

export default function Workspace({ file, fileId, onClose }: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'hex' | 'analyze' | 'bulk' | 'sign'>('preview');
  const [editedData, setEditedData] = useState<Uint8Array | null>(null);
  const [jumpToOffset, setJumpToOffset] = useState<number | null>(null);

  useEffect(() => {
    if (!fileId) return;
    
    const fetchFirstSlice = async () => {
      try {
        // Read up to 5MB for analysis tools to avoid freezing the browser or connection
        const sliceLimit = Math.min(5 * 1024 * 1024, file.size);
        const res = await fetch(`/api/file/${fileId}/chunk?offset=0&length=${sliceLimit}`);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          setEditedData(new Uint8Array(arrayBuffer));
        }
      } catch (err) {
        console.error("Failed to load preview slice from server:", err);
      }
    };

    fetchFirstSlice();
  }, [file, fileId]);

  const handleDataChange = (newData: Uint8Array) => {
    setEditedData(newData);
  };

  const handleGoToOffset = (offset: number) => {
    setJumpToOffset(offset);
    setActiveTab('hex');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0F19]">
      {/* Top Navbar */}
      <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/10 backdrop-blur-xl shrink-0 z-20">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold text-white text-lg">{file.name}</h1>
            <p className="text-sm text-white/50">{formatBytes(file.size)}</p>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="hidden md:flex bg-black/20 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex items-center space-x-2 py-2 px-4 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'preview' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Tổng quan</span>
          </button>
          <button
            onClick={() => setActiveTab('hex')}
            className={`flex items-center space-x-2 py-2 px-4 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'hex' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Hex Editor</span>
          </button>
          <button
            onClick={() => setActiveTab('analyze')}
            className={`flex items-center space-x-2 py-2 px-4 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'analyze' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileSearch className="w-4 h-4" />
            <span>Phân tích</span>
          </button>
          <button
            onClick={() => setActiveTab('bulk')}
            className={`flex items-center space-x-2 py-2 px-4 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'bulk' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            <span>Sửa loạt</span>
          </button>
          <button
            onClick={() => setActiveTab('sign')}
            className={`flex items-center space-x-2 py-2 px-4 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'sign' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>Ký File</span>
          </button>
        </div>

        {/* Mobile menu trigger */}
        <div className="md:hidden">
          <select 
            value={activeTab} 
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="bg-white/10 text-white text-sm rounded-lg p-2 border border-white/20 outline-none"
          >
            <option value="preview">Tổng quan</option>
            <option value="hex">Hex Editor</option>
            <option value="analyze">Phân tích</option>
            <option value="bulk">Sửa loạt</option>
            <option value="sign">Ký File</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative z-10 flex flex-col p-2 lg:p-6 bg-gradient-to-br from-[#0B0F19] to-[#121827]">
        <AnimatePresence mode="wait">
          {activeTab === 'preview' && (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-y-auto space-y-6 max-w-5xl mx-auto w-full custom-scrollbar"
            >
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 shadow-2xl">
                <h3 className="font-semibold text-white mb-6 flex items-center text-lg">
                  <span className="w-3 h-3 rounded-full bg-blue-500 mr-3 shadow-[0_0_12px_rgba(59,130,246,0.5)]"></span>
                  Thông tin cơ bản
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                    <span className="text-white/40 text-[10px] uppercase tracking-widest block mb-2">Tên file</span>
                    <span className="font-medium text-white break-all">{file.name}</span>
                  </div>
                  <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                    <span className="text-white/40 text-[10px] uppercase tracking-widest block mb-2">Loại</span>
                    <span className="font-medium text-white">{file.type || 'Không xác định'}</span>
                  </div>
                  <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                    <span className="text-white/40 text-[10px] uppercase tracking-widest block mb-2">Kích thước</span>
                    <span className="font-medium text-white">{formatBytes(file.size)}</span>
                  </div>
                  <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                    <span className="text-white/40 text-[10px] uppercase tracking-widest block mb-2">Sửa đổi lần cuối</span>
                    <span className="font-medium text-white">{new Date(file.lastModified).toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>
              </div>

              {/* Performance & Big File Support Information Card */}
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-xl rounded-3xl border border-blue-500/20 p-6 shadow-2xl">
                <h3 className="font-semibold text-white mb-3 flex items-center text-lg">
                  <Zap className="w-5 h-5 text-yellow-400 mr-3 animate-pulse" />
                  Xử lý dữ liệu Direct-to-Disk an toàn và cực nhẹ
                </h3>
                <p className="text-sm text-white/75 leading-relaxed">
                  Ứng dụng đã chuyển toàn bộ quy trình xử lý sang máy chủ. Trình duyệt chỉ yêu cầu tải đúng các phân đoạn (ví dụ: <strong className="text-purple-400">4000 Bytes</strong>) cần hiển thị, sau đó tự giải phóng hoàn toàn khỏi bộ nhớ RAM.
                </p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="flex items-start space-x-2 text-white/60">
                    <ShieldCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    <span><strong>Tải mượt và an toàn:</strong> Toàn bộ dữ liệu hiển thị được đọc theo thời gian thực từ ổ đĩa máy chủ qua luồng streaming. Không bao giờ lưu trữ bộ nhớ đệm dư thừa tại Client.</span>
                  </div>
                  <div className="flex items-start space-x-2 text-white/60">
                    <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span><strong>Hiệu năng tuyệt đối:</strong> Chỉnh sửa, ghi bit và tải xuống (download) file được thao tác trực tiếp trên đĩa cứng máy chủ bằng con trỏ luồng, đảm bảo an toàn tối đa cho tệp dung lượng lớn.</span>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl p-6">
                <MediaPreview file={file} editedData={editedData} />
              </div>
            </motion.div>
          )}

          {activeTab === 'hex' && (
            <motion.div 
              key="hex"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex-1 h-full bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col"
            >
              <HexEditor file={file} fileId={fileId} onDataChange={handleDataChange} jumpToOffset={jumpToOffset} />
            </motion.div>
          )}

          {activeTab === 'analyze' && (
            <motion.div 
              key="analyze"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-y-auto space-y-6 max-w-5xl mx-auto w-full custom-scrollbar"
            >
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                <FileAnalyzer data={editedData} onGoToOffset={handleGoToOffset} />
              </div>
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                <ByteChart file={file} editedData={editedData} />
              </div>
            </motion.div>
          )}

          {activeTab === 'bulk' && (
            <motion.div 
              key="bulk"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-y-auto max-w-5xl mx-auto w-full custom-scrollbar"
            >
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                <BulkEditor data={editedData} onDataChange={handleDataChange} />
              </div>
            </motion.div>
          )}

          {activeTab === 'sign' && (
            <motion.div 
              key="sign"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-y-auto max-w-5xl mx-auto w-full custom-scrollbar"
            >
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                <SignatureEditor data={editedData} onDataChange={handleDataChange} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
