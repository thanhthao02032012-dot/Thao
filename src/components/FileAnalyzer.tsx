import React, { useState, useEffect } from 'react';
import { Search, AlertCircle, Edit, Zap } from 'lucide-react';

interface FileAnalyzerProps {
  data: Uint8Array | null;
  onGoToOffset?: (offset: number) => void;
}

export default function FileAnalyzer({ data, onGoToOffset }: FileAnalyzerProps) {
  const [entropy, setEntropy] = useState<number | null>(null);
  const [signatures, setSignatures] = useState<{name: string, offset: number, type: 'magic' | 'string'}[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanMode, setScanMode] = useState<'quick' | 'deep'>('quick');

  useEffect(() => {
    if (!data) return;

    const analyze = () => {
      setAnalyzing(true);
      
      // Calculate Entropy (Sampled for speed if large)
      let counts = new Array(256).fill(0);
      const step = Math.max(1, Math.floor(data.length / 100000));
      let totalSamples = 0;
      for (let i = 0; i < data.length; i += step) {
        counts[data[i]]++;
        totalSamples++;
      }
      
      let ent = 0;
      for (let i = 0; i < 256; i++) {
        if (counts[i] > 0) {
          const p = counts[i] / totalSamples;
          ent -= p * Math.log2(p);
        }
      }
      setEntropy(ent);

      // Search for common signatures (Magic numbers)
      const foundSigs: {name: string, offset: number, type: 'magic' | 'string'}[] = [];
      const magicNumbers = [
        { name: 'JPEG', bytes: [0xFF, 0xD8, 0xFF] },
        { name: 'PNG', bytes: [0x89, 0x50, 0x4E, 0x47] },
        { name: 'ZIP/APK/JAR', bytes: [0x50, 0x4B, 0x03, 0x04] },
        { name: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46] },
        { name: 'ELF', bytes: [0x7F, 0x45, 0x4C, 0x46] },
        { name: 'MP3', bytes: [0x49, 0x44, 0x33] },
        { name: 'MP4 (ftyp)', bytes: [0x66, 0x74, 0x79, 0x70] },
        { name: 'MP4 (moov)', bytes: [0x6D, 0x6F, 0x6F, 0x76] },
        { name: 'MP4 (mdat)', bytes: [0x6D, 0x64, 0x61, 0x74] },
        { name: 'MP4 (free)', bytes: [0x66, 0x72, 0x65, 0x65] },
        { name: 'MP4 (skip)', bytes: [0x73, 0x6B, 0x69, 0x70] },
        { name: 'MP4 (wide)', bytes: [0x77, 0x69, 0x64, 0x65] }
      ];

      // Scan limit based on mode
      const scanLimit = scanMode === 'deep' ? data.length : Math.min(data.length, 5 * 1024 * 1024);
      const limitFindings = scanMode === 'deep' ? 200 : 50;

      let currentString = '';
      let stringStartOffset = -1;

      for (let i = 0; i < scanLimit; i++) {
        // Check magic numbers
        for (const sig of magicNumbers) {
          let match = true;
          for (let j = 0; j < sig.bytes.length; j++) {
            if (i + j >= data.length || data[i + j] !== sig.bytes[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            foundSigs.push({ name: sig.name + ' Header', offset: i, type: 'magic' });
            i += sig.bytes.length - 1; 
            break;
          }
        }

        // Deep Scan: Also extract printable strings
        if (scanMode === 'deep') {
          const byte = data[i];
          if (byte >= 32 && byte <= 126) {
            if (currentString.length === 0) stringStartOffset = i;
            currentString += String.fromCharCode(byte);
          } else {
            if (currentString.length >= 8) { // Only keep strings >= 8 chars
              foundSigs.push({ 
                name: `String: "${currentString.length > 20 ? currentString.substring(0, 20) + '...' : currentString}"`, 
                offset: stringStartOffset,
                type: 'string'
              });
            }
            currentString = '';
          }
        }

        if (foundSigs.length > limitFindings) break;
      }

      setSignatures(foundSigs);
      setAnalyzing(false);
    };

    setAnalyzing(true);
    // Use setTimeout to not block render, increase delay for deep scan to allow UI update
    const timer = setTimeout(analyze, scanMode === 'deep' ? 300 : 50);
    return () => clearTimeout(timer);
  }, [data, scanMode]);

  if (!data) return null;

  return (
    <div className="bg-transparent border-0 h-full flex flex-col">
      <div className="p-3 bg-white/5 border-b border-white/5 flex items-center justify-between rounded-t-2xl">
        <h3 className="text-sm font-semibold text-white flex items-center">
          <Search className="w-4 h-4 mr-2 text-purple-400" />
          Phân tích vùng (Partitions)
        </h3>
        <button
          onClick={() => setScanMode(m => m === 'quick' ? 'deep' : 'quick')}
          disabled={analyzing}
          className={`flex items-center px-2 py-1 text-xs font-medium rounded-lg transition-colors ${scanMode === 'deep' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 ring-1 ring-purple-500/50 shadow-lg shadow-purple-500/20' : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white'} disabled:opacity-50`}
        >
          <Zap className="w-3 h-3 mr-1" />
          {scanMode === 'deep' ? 'Phân tích cực sâu' : 'Phân tích nhanh'}
        </button>
      </div>
      
      <div className="p-4 space-y-4 flex-1">
        {scanMode === 'deep' && !analyzing && (
          <div className="bg-purple-500/10 text-purple-300 text-xs p-3 rounded-lg border border-purple-500/20 mb-2 font-medium">
            Đã hoàn tất phân tích toàn bộ cấu trúc file và tìm kiếm các chuỗi văn bản ẩn.
          </div>
        )}

        {analyzing ? (
          <div className="text-center flex flex-col items-center justify-center py-6 h-full">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <div className="text-sm text-white/50 font-medium">
              {scanMode === 'deep' ? 'Đang phân tích cực sâu (có thể mất thời gian)...' : 'Đang phân tích...'}
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white/80">Entropy (Độ hỗn loạn):</span>
                <span className="text-sm font-mono text-white/60 bg-black/20 px-2 py-0.5 rounded">{entropy?.toFixed(2)} / 8.0</span>
              </div>
              <div className="w-full bg-black/40 rounded-full h-2 mb-2 overflow-hidden border border-white/5">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${entropy && entropy > 7.5 ? 'bg-gradient-to-r from-orange-500 to-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-gradient-to-r from-blue-500 to-purple-500'}`} 
                  style={{ width: `${((entropy || 0) / 8) * 100}%` }}
                ></div>
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                {entropy && entropy > 7.5 ? 'Entropy cao: File có thể đã bị mã hóa (encrypted) hoặc nén (compressed).' : 'Entropy bình thường.'}
              </p>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <span className="text-sm font-medium text-white/80 mb-3 block flex items-center">
                <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                Vùng dữ liệu / Chữ ký file (Signatures):
              </span>
              {signatures.length > 0 ? (
                <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar max-h-60">
                  {signatures.map((sig, idx) => (
                    <div key={idx} className={`flex items-center justify-between p-3 rounded-xl text-sm border transition-colors hover:bg-white/10 ${sig.type === 'string' ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-white/5 border-white/5'}`}>
                      <div className="flex flex-col truncate mr-2">
                        <span className={`font-semibold text-xs truncate mb-1 ${sig.type === 'string' ? 'text-yellow-300' : 'text-white/90'}`}>{sig.name}</span>
                        <span className="font-mono text-white/40 text-[10px] bg-black/20 self-start px-1.5 rounded">
                          0x{sig.offset.toString(16).toUpperCase()}
                        </span>
                      </div>
                      
                      <button 
                        onClick={() => onGoToOffset?.(sig.offset)}
                        className="flex-shrink-0 flex items-center px-3 py-1.5 text-xs font-medium text-blue-300 hover:text-white hover:bg-blue-600 bg-blue-600/20 rounded-lg transition-colors border border-blue-500/30"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Sửa
                      </button>
                    </div>
                  ))}
                  
                  {signatures.length >= (scanMode === 'deep' ? 200 : 50) && (
                    <div className="text-center text-xs text-white/40 py-2 italic bg-white/5 rounded-lg border border-white/5 mt-2">
                      Chỉ hiển thị {signatures.length} kết quả đầu tiên.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-white/50 flex items-center bg-white/5 p-4 rounded-xl border border-white/5 justify-center">
                  <AlertCircle className="w-5 h-5 mr-2 text-white/30" />
                  Không tìm thấy dữ liệu bất thường hoặc signature nào.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
