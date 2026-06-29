import React, { useState } from 'react';
import { Edit3, AlertTriangle, Loader2 } from 'lucide-react';

interface BulkEditorProps {
  patches: Map<number, number>;
  setPatches: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  fileSize: number;
  onApplied: () => void;
}

export default function BulkEditor({ patches, setPatches, fileSize, onApplied }: BulkEditorProps) {
  const [startOffset, setStartOffset] = useState('');
  const [length, setLength] = useState('');
  const [hexValue, setHexValue] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async () => {
    setError('');
    setSuccess('');
    
    // Convert startOffset (hex) to decimal
    const start = parseInt(startOffset, 16);
    const len = parseInt(length, 10);
    
    if (isNaN(start) || start < 0 || start >= fileSize) {
      setError('Offset bắt đầu không hợp lệ (phải là Hex, VD: 1A0 hoặc F000).');
      return;
    }
    
    if (isNaN(len) || len <= 0 || start + len > fileSize) {
      setError('Độ dài không hợp lệ hoặc vượt quá kích thước file.');
      return;
    }

    // Parse hex values (e.g. "FF", "FF 00", "FF00")
    const cleanHex = hexValue.replace(/\s+/g, '');
    if (!cleanHex || cleanHex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(cleanHex)) {
      setError('Giá trị Hex không hợp lệ. Vui lòng nhập độ dài chẵn (VD: FF hoặc FF00).');
      return;
    }

    const patternBytes: number[] = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      patternBytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
    }

    setIsApplying(true);

    try {
      // Direct offline patching loop
      const newPatches = new Map(patches);
      for (let i = 0; i < len; i++) {
        const offset = start + i;
        const byteValue = patternBytes[i % patternBytes.length];
        newPatches.set(offset, byteValue);
      }
      setPatches(newPatches);

      setSuccess(`Đã áp dụng thay đổi thành công ${len} byte từ offset 0x${start.toString(16).toUpperCase()}.`);
      
      // Notify parent to refresh views
      setTimeout(() => {
        onApplied();
      }, 50);
      
      // Auto clear success after 5s
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      setError(err.message || 'Lỗi xử lý cục bộ.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="bg-transparent border-0 h-full flex flex-col">
      <div className="p-3 bg-white/5 border-b border-white/5 flex items-center rounded-t-2xl">
        <Edit3 className="w-4 h-4 mr-2 text-purple-400" />
        <h3 className="text-sm font-semibold text-white">Chỉnh sửa hàng loạt (Bulk Editor)</h3>
      </div>
      
      <div className="p-4 space-y-4 flex-1">
        <p className="text-xs text-white/50 bg-white/5 p-3 rounded-lg border border-white/5 leading-relaxed">
          Chức năng này ghi đè một đoạn dữ liệu bằng một hoặc nhiều giá trị Hex lặp lại trực tiếp trong bộ nhớ Patch của Client. Hỗ trợ an toàn với file có dung lượng cực lớn.
        </p>

        {error && (
          <div className="p-3 bg-red-500/10 text-red-400 text-xs rounded-lg border border-red-500/30 flex items-start">
            <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="p-3 bg-green-500/10 text-green-400 text-xs rounded-lg border border-green-500/30">
            {success}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Offset bắt đầu (Hex)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-mono text-sm">0x</span>
              <input
                type="text"
                value={startOffset}
                onChange={(e) => setStartOffset(e.target.value)}
                placeholder="00001A"
                disabled={isApplying}
                className="w-full pl-8 pr-3 py-2.5 text-sm bg-black/20 border border-white/10 rounded-xl focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none font-mono uppercase text-white transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Độ dài (Số thập phân - Bytes)</label>
            <input
              type="number"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="1024"
              disabled={isApplying}
              className="w-full px-4 py-2.5 text-sm bg-black/20 border border-white/10 rounded-xl focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none font-mono text-white transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Giá trị Hex (Lặp lại)</label>
            <input
              type="text"
              value={hexValue}
              onChange={(e) => setHexValue(e.target.value)}
              placeholder="FF 00"
              disabled={isApplying}
              className="w-full px-4 py-2.5 text-sm bg-black/20 border border-white/10 rounded-xl focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none font-mono uppercase text-white transition-colors"
            />
          </div>

          <button
            onClick={handleApply}
            disabled={isApplying}
            className="w-full py-2.5 mt-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang ghi đè cục bộ...</span>
              </>
            ) : (
              <span>Áp dụng thay đổi</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
