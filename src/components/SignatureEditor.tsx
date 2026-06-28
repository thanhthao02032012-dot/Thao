import React, { useState } from 'react';
import { PenTool, CheckCircle, AlertTriangle } from 'lucide-react';
import { auth } from '../firebase';
import { incrementStat } from '../utils/stats';

interface SignatureEditorProps {
  data: Uint8Array | null;
  onDataChange: (newData: Uint8Array) => void;
}

export default function SignatureEditor({ data, onDataChange }: SignatureEditorProps) {
  const [signature, setSignature] = useState('');
  const [mode, setMode] = useState<'text' | 'hex'>('text');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSign = () => {
    setError('');
    setSuccess('');

    if (!data) return;
    if (!signature.trim()) {
      setError('Vui lòng nhập nội dung chữ ký.');
      return;
    }

    let sigBytes: number[] = [];

    if (mode === 'text') {
      for (let i = 0; i < signature.length; i++) {
        sigBytes.push(signature.charCodeAt(i));
      }
    } else {
      const cleanHex = signature.replace(/\s+/g, '');
      if (cleanHex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(cleanHex)) {
        setError('Dữ liệu Hex không hợp lệ. Vui lòng nhập độ dài chẵn (VD: FF 00).');
        return;
      }
      for (let i = 0; i < cleanHex.length; i += 2) {
        sigBytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
      }
    }

    // Append signature to end of file
    const newData = new Uint8Array(data.length + sigBytes.length);
    newData.set(data);
    newData.set(sigBytes, data.length);

    onDataChange(newData);
    setSuccess(`Đã thêm chữ ký thành công (${sigBytes.length} bytes) vào cuối file.`);
    setSignature('');
    
    if (auth.currentUser) {
      incrementStat(auth.currentUser.uid, 'digitalSignatures');
    }
    
    setTimeout(() => setSuccess(''), 4000);
  };

  return (
    <div className="bg-transparent border-0 h-full flex flex-col">
      <div className="p-3 bg-white/5 border-b border-white/5 flex items-center rounded-t-2xl">
        <PenTool className="w-4 h-4 mr-2 text-purple-400" />
        <h3 className="text-sm font-semibold text-white">Ký tệp (Tự ký File)</h3>
      </div>
      
      <div className="p-4 space-y-4 flex-1">
        <p className="text-xs text-white/50 bg-white/5 p-3 rounded-lg border border-white/5">
          Chức năng này sẽ thêm dữ liệu (chữ ký cá nhân, watermark) vào cuối file hiện tại.
        </p>

        {error && (
          <div className="p-3 bg-red-500/10 text-red-400 text-xs rounded-lg border border-red-500/30 flex items-start">
            <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="p-3 bg-green-500/10 text-green-400 text-xs rounded-lg border border-green-500/30 flex items-start">
            <CheckCircle className="w-4 h-4 mr-2 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setMode('text')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${mode === 'text' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
            >
              Văn bản (ASCII)
            </button>
            <button
              onClick={() => setMode('hex')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${mode === 'hex' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
            >
              Hex (Nhị phân)
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">Nội dung chữ ký</label>
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={mode === 'text' ? "Nhập tên hoặc đoạn text..." : "FF 00 A1 B2..."}
              className={`w-full px-4 py-3 text-sm bg-black/20 border border-white/10 rounded-xl focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none h-24 resize-none text-white transition-colors custom-scrollbar ${mode === 'hex' ? 'font-mono uppercase' : ''}`}
            />
          </div>

          <button
            onClick={handleSign}
            className="w-full py-2.5 mt-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center"
          >
            <PenTool className="w-4 h-4 mr-2" />
            Chèn chữ ký
          </button>
        </div>
      </div>
    </div>
  );
}
