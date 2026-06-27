import React, { useState } from 'react';
import { Edit3, AlertTriangle } from 'lucide-react';

interface BulkEditorProps {
  data: Uint8Array | null;
  onDataChange: (newData: Uint8Array) => void;
}

export default function BulkEditor({ data, onDataChange }: BulkEditorProps) {
  const [startOffset, setStartOffset] = useState('');
  const [length, setLength] = useState('');
  const [hexValue, setHexValue] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleApply = () => {
    setError('');
    setSuccess('');
    
    if (!data) return;

    const start = parseInt(startOffset, 16);
    const len = parseInt(length, 10);
    
    if (isNaN(start) || start < 0 || start >= data.length) {
      setError('Offset bắt đầu không hợp lệ (phải là Hex).');
      return;
    }
    
    if (isNaN(len) || len <= 0 || start + len > data.length) {
      setError('Độ dài không hợp lệ hoặc vượt quá kích thước file.');
      return;
    }

    // Parse hex values (e.g. "FF", "FF 00", "FF00")
    const cleanHex = hexValue.replace(/\s+/g, '');
    if (!cleanHex || cleanHex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(cleanHex)) {
      setError('Giá trị Hex không hợp lệ. Vui lòng nhập độ dài chẵn (VD: FF hoặc FF00).');
      return;
    }

    const valueBytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      valueBytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
    }

    const newData = new Uint8Array(data);
    let valIdx = 0;
    
    for (let i = start; i < start + len; i++) {
      newData[i] = valueBytes[valIdx];
      valIdx = (valIdx + 1) % valueBytes.length;
    }

    onDataChange(newData);
    setSuccess(`Đã thay đổi thành công ${len} byte từ offset 0x${start.toString(16).toUpperCase()}.`);
    
    // Auto clear success after 3s
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <div className="bg-transparent border-0 h-full flex flex-col">
      <div className="p-3 bg-white/5 border-b border-white/5 flex items-center rounded-t-2xl">
        <Edit3 className="w-4 h-4 mr-2 text-purple-400" />
        <h3 className="text-sm font-semibold text-white">Sửa hàng loạt (Bulk Edit)</h3>
      </div>
      
      <div className="p-4 space-y-4 flex-1">
        <p className="text-xs text-white/50 bg-white/5 p-3 rounded-lg border border-white/5">
          Chức năng này cho phép bạn ghi đè một đoạn dữ liệu bằng một hoặc nhiều giá trị Hex lặp lại.
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
              className="w-full px-4 py-2.5 text-sm bg-black/20 border border-white/10 rounded-xl focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none font-mono uppercase text-white transition-colors"
            />
          </div>

          <button
            onClick={handleApply}
            className="w-full py-2.5 mt-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-purple-500/20"
          >
            Áp dụng thay đổi
          </button>
        </div>
      </div>
    </div>
  );
}
