import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface MediaPreviewProps {
  file: File;
  editedData: Uint8Array | null;
}

export default function MediaPreview({ file, editedData }: MediaPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Determine source data: edited data if available, else original file
    let source: Blob | File = file;
    if (editedData) {
      source = new Blob([editedData], { type: file.type || 'application/octet-stream' });
    }

    const objectUrl = URL.createObjectURL(source);
    setUrl(objectUrl);
    setError(false); // Reset error state on new data

    return () => URL.revokeObjectURL(objectUrl);
  }, [file, editedData]);

  if (!url) return null;

  const isAudio = file.type.startsWith('audio/');
  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');

  return (
    <div className="bg-transparent border-0">
      <div className="p-3 bg-white/5 border-b border-white/5 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Xem trước Media</h3>
        {editedData && <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">Đã chỉnh sửa</span>}
      </div>
      <div className="p-4 flex flex-col items-center justify-center bg-black/40 min-h-[200px] relative">
        {error && (
          <div className="w-full bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg mb-4 flex items-start text-left">
            <AlertCircle className="w-5 h-5 shrink-0 mr-2 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Lỗi hiển thị xem trước</p>
              <p className="text-xs mt-1 text-red-300">Trình duyệt có thể không hiển thị được nội dung do cấu trúc file bị hỏng. Những phần bạn thấy bên dưới (nếu có) là kết quả của việc render file lỗi (glitch). Bạn vẫn có thể tải xuống để kiểm tra trên phần mềm khác.</p>
            </div>
          </div>
        )}

        {isAudio && <audio controls src={url} className="w-full max-w-md rounded-lg" onError={() => setError(true)} />}
        {isVideo && <video controls src={url} className="w-full max-w-md max-h-64 rounded-lg bg-black/50" onError={() => setError(true)} />}
        {isImage && <img src={url} alt="Preview" className="max-w-full max-h-64 object-contain rounded-lg" onError={() => setError(true)} />}
        
        {!isAudio && !isVideo && !isImage && (
          <p className="text-white/50 text-sm">Không có xem trước cho loại file này.</p>
        )}
      </div>
    </div>
  );
}
