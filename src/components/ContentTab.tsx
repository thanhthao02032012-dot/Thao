import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Save, RefreshCw, AlertCircle, FileCode, CheckCircle, Lock
} from 'lucide-react';
import { useUI } from './UIProvider';

interface ContentTabProps {
  file: File;
  virtualFileSize: number;
  isText: boolean;
  initialTextContent: string;
  onSaveContent: (newBytes: Uint8Array) => void;
}

export default function ContentTab({
  file,
  virtualFileSize,
  isText,
  initialTextContent,
  onSaveContent
}: ContentTabProps) {
  const { toast } = useUI();
  const [textContent, setTextContent] = useState('');
  const [isModified, setIsModified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isText) {
      setTextContent(initialTextContent);
      setIsModified(false);
    } else {
      // If not plain text, read a small sample (first 4KB) as text to show safety warning
      const loadSample = async () => {
        try {
          const sampleSlice = file.slice(0, Math.min(file.size, 8192));
          const sampleBuf = await sampleSlice.arrayBuffer();
          const sampleArr = new Uint8Array(sampleBuf);
          const decoded = new TextDecoder('utf-8', { fatal: false }).decode(sampleArr);
          setTextContent(decoded);
        } catch (err) {
          setTextContent('[Không thể giải mã nhị phân dưới dạng văn bản thuần túy]');
        }
      };
      loadSample();
    }
  }, [file, isText, initialTextContent]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Encode string back to UTF-8 bytes
      const encoder = new TextEncoder();
      const encodedBytes = encoder.encode(textContent);
      
      onSaveContent(encodedBytes);
      setIsModified(false);
      toast('Đã lưu nội dung văn bản thành công!', 'success');
      if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
    } catch (err) {
      toast('Lỗi khi mã hóa nội dung văn bản', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5 text-left pb-10">
      <div className="bg-[#121829]/65  rounded-3xl border border-white/10 p-5  flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center">
            <FileText className="w-4 h-4 text-purple-400 mr-2" />
            Trình soạn thảo văn bản (Text Editor)
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Chỉnh sửa trực tiếp nội dung văn bản thuần túy. Dữ liệu sẽ được tự động đồng bộ hóa ngược về các ô nhớ nhị phân.
          </p>
        </div>

        {isModified && (
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/10 flex items-center space-x-2 shrink-0 cursor-pointer"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Lưu thay đổi</span>
          </button>
        )}
      </div>

      {!isText && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-start space-x-3 text-xs text-yellow-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Cảnh báo bảo toàn cấu trúc:</strong> Tệp tin này được phát hiện là định dạng nhị phân (hình ảnh, nén, thực thi). Việc chỉnh sửa trực tiếp dưới dạng văn bản thuần có thể làm hỏng định dạng file. Hãy cân nhắc kỹ trước khi chỉnh sửa.
          </div>
        </div>
      )}

      {/* Editor area */}
      <div className="bg-[#0b0f19]/60 rounded-3xl border border-white/15 overflow-hidden flex flex-col relative h-[500px]">
        {/* Editor line columns count simulated for visual elegance */}
        <div className="flex-1 flex font-mono text-xs leading-relaxed relative">
          {/* Editor background design */}
          <textarea
            value={textContent}
            onChange={(e) => {
              setTextContent(e.target.value);
              setIsModified(true);
            }}
            placeholder="Nhập nội dung văn bản tại đây..."
            className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-white placeholder-white/20 p-5 h-full resize-none font-mono custom-scrollbar"
            style={{ tabSize: 4 }}
          />
        </div>

        {/* Editor bottom bar */}
        <div className="bg-[#070b13]/80 border-t border-white/5 px-5 py-3 flex items-center justify-between text-[10px] text-white/40 font-mono">
          <span>Kích thước bộ đệm: <strong className="text-white/70">{textContent.length.toLocaleString()} ký tự</strong></span>
          <span>Định dạng: <strong className="text-purple-400">UTF-8 Plain Text</strong></span>
        </div>
      </div>
    </div>
  );
}
