import React, { useState } from 'react';
import { Search, AlertCircle, Edit, Zap, Hash, Cpu, FileText, Database, Shield, HelpCircle } from 'lucide-react';
import { auth } from '../firebase';
import { incrementStat } from '../utils/stats';

interface FileAnalyzerProps {
  data: Uint8Array | null;
  onGoToOffset?: (offset: number) => void;
}

type AnalysisTab = 'entropy' | 'signature' | 'strings' | 'manifest' | 'zip' | 'partition';

export default function FileAnalyzer({ data, onGoToOffset }: FileAnalyzerProps) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>('entropy');

  // Tab 1: Entropy & SHA-256
  const [entropy, setEntropy] = useState<number | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [calculatingEntropy, setCalculatingEntropy] = useState(false);

  // Tab 2: Common Magic Signatures
  const [magicSignatures, setMagicSignatures] = useState<{ name: string; offset: number }[]>([]);
  const [scanningSignatures, setScanningSignatures] = useState(false);

  // Tab 3: Printable ASCII Strings
  const [extractedStrings, setExtractedStrings] = useState<{ str: string; offset: number }[]>([]);
  const [extractingStrings, setExtractingStrings] = useState(false);

  // Tab 4: AndroidManifest Analyzer
  const [manifestData, setManifestData] = useState<{ found: boolean; paths: string[] } | null>(null);
  const [analyzingManifest, setAnalyzingManifest] = useState(false);

  // Tab 5: ZIP Directory Struktur
  const [zipFiles, setZipFiles] = useState<string[]>([]);
  const [analyzingZip, setAnalyzingZip] = useState(false);

  // Tab 6: Partition & ELF Binary Header
  const [partitionType, setPartitionType] = useState<string | null>(null);
  const [elfInfo, setElfInfo] = useState<{ class: string; dataEncoding: string; machine: string } | null>(null);
  const [analyzingElf, setAnalyzingElf] = useState(false);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center p-8 h-full text-center">
        <AlertCircle className="w-12 h-12 text-white/20 mb-4" />
        <p className="text-white/60">Không có dữ liệu để thực hiện phân tích.</p>
      </div>
    );
  }

  // --- Executions ---

  const handleCalculateEntropy = async () => {
    setCalculatingEntropy(true);
    try {
      // 1. Calculate SHA-256 of the loaded segment
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setHash(hashHex);

      // 2. Calculate Entropy (Using Shannon entropy algorithm)
      const counts = new Array(256).fill(0);
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

      if (auth.currentUser) {
        incrementStat(auth.currentUser.uid, 'hashesGenerated');
      }
    } catch (e) {
      console.error('Entropy/Hash calculation failed', e);
    } finally {
      setCalculatingEntropy(false);
    }
  };

  const handleScanSignatures = () => {
    setScanningSignatures(true);
    setTimeout(() => {
      const foundSigs: { name: string; offset: number }[] = [];
      const magicNumbers = [
        { name: 'JPEG Image (ffd8ff)', bytes: [0xFF, 0xD8, 0xFF] },
        { name: 'PNG Image (89504e47)', bytes: [0x89, 0x50, 0x4E, 0x47] },
        { name: 'ZIP/APK Archive (504b0304)', bytes: [0x50, 0x4B, 0x03, 0x04] },
        { name: 'PDF Document (25504446)', bytes: [0x25, 0x50, 0x44, 0x46] },
        { name: 'ELF Executable (7f454c46)', bytes: [0x7F, 0x45, 0x4C, 0x46] },
        { name: 'MP3 Audio (494433)', bytes: [0x49, 0x44, 0x33] },
        { name: 'MP4 Video (ftyp)', bytes: [0x66, 0x74, 0x79, 0x70] },
        { name: 'Windows EXE/DLL (4d5a)', bytes: [0x4D, 0x5A] },
        { name: 'GIF Image (47494638)', bytes: [0x47, 0x49, 0x46, 0x38] },
        { name: 'GZIP Archive (1f8b)', bytes: [0x1F, 0x8B] },
        { name: 'BZIP2 Archive (425a68)', bytes: [0x42, 0x5A, 0x68] }
      ];

      for (let i = 0; i < data.length - 4; i++) {
        for (const sig of magicNumbers) {
          let match = true;
          for (let j = 0; j < sig.bytes.length; j++) {
            if (data[i + j] !== sig.bytes[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            foundSigs.push({ name: sig.name, offset: i });
            i += sig.bytes.length - 1;
            break;
          }
        }
        if (foundSigs.length >= 100) break;
      }
      setMagicSignatures(foundSigs);
      setScanningSignatures(false);
    }, 120);
  };

  const handleExtractStrings = () => {
    setExtractingStrings(true);
    setTimeout(() => {
      const stringsList: { str: string; offset: number }[] = [];
      let currentString = '';
      let stringStartOffset = -1;

      for (let i = 0; i < data.length; i++) {
        const byte = data[i];
        if (byte >= 32 && byte <= 126) {
          if (currentString.length === 0) stringStartOffset = i;
          currentString += String.fromCharCode(byte);
        } else {
          if (currentString.length >= 6) {
            stringsList.push({ str: currentString, offset: stringStartOffset });
          }
          currentString = '';
        }
        if (stringsList.length >= 100) break;
      }
      setExtractedStrings(stringsList);
      setExtractingStrings(false);
    }, 120);
  };

  const handleAnalyzeManifest = () => {
    setAnalyzingManifest(true);
    setTimeout(() => {
      const paths: string[] = [];
      let currentString = '';
      for (let i = 0; i < data.length; i++) {
        const byte = data[i];
        if (byte >= 32 && byte <= 126) {
          currentString += String.fromCharCode(byte);
        } else {
          if (currentString.length > 3 && (currentString.includes('.xml') || currentString.includes('android') || currentString.includes('com.'))) {
            const clean = currentString.replace(/[^a-zA-Z0-9_.\-/:]/g, '');
            if (clean.length > 5 && clean.length < 120) {
              paths.push(clean);
            }
          }
          currentString = '';
        }
        if (paths.length >= 30) break;
      }

      // Check if signature contains ZIP index of AndroidManifest.xml
      let containsManifest = false;
      const manifestBytes = [0x41, 0x6E, 0x64, 0x72, 0x6F, 0x69, 0x64, 0x4D, 0x61, 0x6E, 0x69, 0x66, 0x65, 0x73, 0x74, 0x2E, 0x78, 0x6D, 0x6C];
      for (let i = 0; i < data.length - manifestBytes.length; i++) {
        let match = true;
        for (let j = 0; j < manifestBytes.length; j++) {
          if (data[i + j] !== manifestBytes[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          containsManifest = true;
          break;
        }
      }

      setManifestData({
        found: containsManifest,
        paths: Array.from(new Set(paths)).slice(0, 15)
      });
      setAnalyzingManifest(false);
    }, 120);
  };

  const handleAnalyzeZip = () => {
    setAnalyzingZip(true);
    setTimeout(() => {
      const files: string[] = [];
      for (let i = 0; i < data.length - 35; i++) {
        // ZIP local file header signature 0x50 0x4b 0x03 0x04
        if (data[i] === 0x50 && data[i + 1] === 0x4B && data[i + 2] === 0x03 && data[i + 3] === 0x04) {
          const fileNameLength = data[i + 26] + (data[i + 27] << 8);
          if (fileNameLength > 0 && fileNameLength < 256 && i + 30 + fileNameLength <= data.length) {
            let fileName = '';
            for (let j = 0; j < fileNameLength; j++) {
              const charByte = data[i + 30 + j];
              if (charByte >= 32 && charByte <= 126) {
                fileName += String.fromCharCode(charByte);
              }
            }
            if (fileName && fileName.includes('.') && !files.includes(fileName)) {
              files.push(fileName);
            }
          }
        }
      }
      setZipFiles(Array.from(new Set(files)).slice(0, 30));
      setAnalyzingZip(false);
    }, 120);
  };

  const handleAnalyzeElf = () => {
    setAnalyzingElf(true);
    setTimeout(() => {
      // ELF Executable: 7f 45 4c 46
      if (data[0] === 0x7F && data[1] === 0x45 && data[2] === 0x4C && data[3] === 0x46) {
        const elfClass = data[4] === 1 ? '32-bit Architecture' : data[4] === 2 ? '64-bit Architecture' : 'Unknown';
        const dataEncoding = data[5] === 1 ? 'Little Endian' : data[5] === 2 ? 'Big Endian' : 'Unknown';
        const machineByte = data[18] + (data[19] << 8);
        const machine = machineByte === 3 ? 'Intel 80386' : machineByte === 62 ? 'AMD x86-64' : machineByte === 40 ? 'ARM' : machineByte === 183 ? 'AArch64 (ARM64)' : 'Generic';
        setElfInfo({ class: elfClass, dataEncoding, machine });
        setPartitionType('Định dạng ELF (Executable & Linkable Format) Detected');
      } else if (data[510] === 0x55 && data[511] === 0xAA) {
        setPartitionType('Định dạng MBR Boot Sector (Master Boot Record Partition Table)');
        setElfInfo(null);
      } else {
        setPartitionType('Không khớp cấu trúc ELF hoặc Boot Sector tại offset đầu.');
        setElfInfo(null);
      }
      setAnalyzingElf(false);
    }, 120);
  };

  return (
    <div className="bg-transparent h-full flex flex-col md:flex-row gap-4 p-4">
      {/* Sidebar Navigation */}
      <div className="flex md:flex-col gap-2 shrink-0 overflow-x-auto pb-2 md:pb-0 md:w-56 border-b md:border-b-0 md:border-r border-white/10 pr-0 md:pr-4">
        <button
          onClick={() => setActiveTab('entropy')}
          className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeTab === 'entropy' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
        >
          <Hash className="w-3.5 h-3.5" />
          <span>Entropy & Hash</span>
        </button>
        <button
          onClick={() => setActiveTab('signature')}
          className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeTab === 'signature' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Magic Signatures</span>
        </button>
        <button
          onClick={() => setActiveTab('strings')}
          className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeTab === 'strings' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Tìm kiếm Strings</span>
        </button>
        <button
          onClick={() => setActiveTab('manifest')}
          className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeTab === 'manifest' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>AndroidManifest</span>
        </button>
        <button
          onClick={() => setActiveTab('zip')}
          className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeTab === 'zip' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Cấu trúc ZIP/APK</span>
        </button>
        <button
          onClick={() => setActiveTab('partition')}
          className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeTab === 'partition' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>ELF & Partitions</span>
        </button>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 bg-[#0f1420]/70 border border-white/5 rounded-2xl p-4 flex flex-col min-h-[400px]">
        {/* Tab 1: Entropy & Hash */}
        {activeTab === 'entropy' && (
          <div className="space-y-4 flex flex-col h-full justify-between">
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Tính toán Entropy & SHA-256</h4>
              <p className="text-xs text-white/50 mb-4">Độ hỗn loạn thông tin giúp phát hiện nhanh xem tệp tin có bị mã hóa, đóng gói hoặc nén hay không.</p>

              {entropy === null ? (
                <div className="bg-white/5 rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center text-center">
                  <Hash className="w-10 h-10 text-purple-400/40 mb-3" />
                  <p className="text-sm text-white/70 mb-4">Chưa thực hiện phân tích</p>
                  <button
                    onClick={handleCalculateEntropy}
                    disabled={calculatingEntropy}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl text-xs transition-colors flex items-center space-x-2"
                  >
                    {calculatingEntropy ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    <span>Phân tích ngay</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <span className="text-xs font-bold text-white/40 block mb-1">SHA-256 CHECKSUM</span>
                    <span className="font-mono text-xs text-purple-300 break-all bg-black/20 px-2 py-1.5 rounded block border border-white/5">{hash}</span>
                  </div>

                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-white/40">ĐỘ HỖN LOẠN (ENTROPY)</span>
                      <span className="font-mono text-xs font-semibold text-white bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">{entropy.toFixed(4)} / 8.0000</span>
                    </div>

                    <div className="w-full bg-black/30 rounded-full h-2.5 overflow-hidden border border-white/5 mb-3">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${entropy > 7.5 ? 'bg-gradient-to-r from-orange-500 to-red-500 shadow-lg' : 'bg-gradient-to-r from-blue-500 to-purple-500'}`}
                        style={{ width: `${(entropy / 8) * 100}%` }}
                      ></div>
                    </div>

                    <p className="text-xs text-white/50 leading-relaxed">
                      {entropy > 7.5
                        ? 'Cảnh báo: Chỉ số Entropy rất cao (>7.5). Điều này cho thấy tệp tin gần như chắc chắn chứa dữ liệu nén, mã hóa hoặc mã độc obfuscated.'
                        : 'Bình thường: Chỉ số Entropy thấp. Cấu trúc byte rõ ràng, dễ phân tích và dịch ngược.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {entropy !== null && (
              <button
                onClick={handleCalculateEntropy}
                disabled={calculatingEntropy}
                className="self-end px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/80 rounded-lg text-xs font-medium transition-colors"
              >
                Tính toán lại
              </button>
            )}
          </div>
        )}

        {/* Tab 2: Common Magic Signatures */}
        {activeTab === 'signature' && (
          <div className="space-y-4 flex flex-col h-full">
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Quét dấu vết Magic Signatures</h4>
              <p className="text-xs text-white/50 mb-4">Nhận diện các phân đoạn định dạng con lồng ghép bên trong bằng cách dò các byte đặc trưng.</p>
            </div>

            {magicSignatures.length === 0 && !scanningSignatures ? (
              <div className="bg-white/5 rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center text-center my-auto">
                <Search className="w-10 h-10 text-purple-400/40 mb-3" />
                <p className="text-sm text-white/70 mb-4">Bắt đầu dò quét tiêu đề tệp con</p>
                <button
                  onClick={handleScanSignatures}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl text-xs transition-colors flex items-center space-x-2"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Quét Signatures</span>
                </button>
              </div>
            ) : scanningSignatures ? (
              <div className="flex flex-col items-center justify-center py-12 my-auto">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs text-white/50 animate-pulse">Đang rà soát chữ ký định dạng...</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-1 custom-scrollbar">
                {magicSignatures.map((sig, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs transition-colors">
                    <div className="flex flex-col">
                      <span className="font-semibold text-white/95">{sig.name}</span>
                      <span className="font-mono text-[10px] text-white/40 mt-1 bg-black/20 px-1.5 py-0.5 rounded self-start">Offset: 0x{sig.offset.toString(16).toUpperCase()}</span>
                    </div>
                    <button
                      onClick={() => onGoToOffset?.(sig.offset)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-purple-300 hover:text-white bg-purple-500/10 border border-purple-500/20 rounded-lg transition-colors"
                    >
                      Nhảy đến
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Printable ASCII Strings */}
        {activeTab === 'strings' && (
          <div className="space-y-4 flex flex-col h-full">
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Trích xuất chuỗi văn bản (Strings)</h4>
              <p className="text-xs text-white/50 mb-4">Lọc ra tất cả các chuỗi ASCII in được (độ dài &ge; 6) để tìm mật khẩu ẩn, IP, tên miền hoặc tin nhắn.</p>
            </div>

            {extractedStrings.length === 0 && !extractingStrings ? (
              <div className="bg-white/5 rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center text-center my-auto">
                <FileText className="w-10 h-10 text-purple-400/40 mb-3" />
                <p className="text-sm text-white/70 mb-4">Chưa trích xuất</p>
                <button
                  onClick={handleExtractStrings}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl text-xs transition-colors flex items-center space-x-2"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Dò tìm Strings</span>
                </button>
              </div>
            ) : extractingStrings ? (
              <div className="flex flex-col items-center justify-center py-12 my-auto">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs text-white/50 animate-pulse">Đang lọc văn bản...</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-1 custom-scrollbar">
                {extractedStrings.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs transition-colors">
                    <div className="flex flex-col truncate mr-2">
                      <span className="font-mono text-white/95 break-all truncate">"{item.str}"</span>
                      <span className="font-mono text-[9px] text-white/30 mt-1">Offset: 0x{item.offset.toString(16).toUpperCase()}</span>
                    </div>
                    <button
                      onClick={() => onGoToOffset?.(item.offset)}
                      className="px-2 py-0.5 text-[10px] font-semibold text-purple-300 hover:text-white bg-purple-500/10 border border-purple-500/20 rounded-lg shrink-0 transition-colors"
                    >
                      Xem vị trí
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: AndroidManifest */}
        {activeTab === 'manifest' && (
          <div className="space-y-4 flex flex-col h-full">
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Phân tích tệp Manifest Android</h4>
              <p className="text-xs text-white/50 mb-4">Công cụ quét nhanh xem tệp APK này có khai báo các service, quyền hoặc AndroidManifest.xml không.</p>
            </div>

            {manifestData === null && !analyzingManifest ? (
              <div className="bg-white/5 rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center text-center my-auto">
                <Shield className="w-10 h-10 text-purple-400/40 mb-3" />
                <p className="text-sm text-white/70 mb-4">Phân tích metadata ứng dụng</p>
                <button
                  onClick={handleAnalyzeManifest}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl text-xs transition-colors flex items-center space-x-2"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Phân tích APK</span>
                </button>
              </div>
            ) : analyzingManifest ? (
              <div className="flex flex-col items-center justify-center py-12 my-auto">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs text-white/50 animate-pulse">Đang định vị Manifest...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`p-3.5 rounded-xl border flex items-center space-x-2 text-xs font-semibold ${manifestData?.found ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
                  {manifestData?.found ? (
                    <>
                      <Zap className="w-4 h-4 shrink-0" />
                      <span>Tìm thấy dấu tích AndroidManifest.xml! Đây chắc chắn là APK Android.</span>
                    </>
                  ) : (
                    <>
                      <HelpCircle className="w-4 h-4 shrink-0" />
                      <span>Không phát hiện trực tiếp AndroidManifest.xml nhị phân, nhưng đây là danh sách đường dẫn tìm thấy.</span>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-white/30 block">CÁC CHUỖI LIÊN QUAN ĐẾN HỆ THỐNG / XML</span>
                  {manifestData?.paths && manifestData.paths.length > 0 ? (
                    <div className="bg-black/20 border border-white/5 rounded-xl p-3 max-h-[180px] overflow-y-auto custom-scrollbar space-y-1.5">
                      {manifestData.paths.map((p, i) => (
                        <div key={i} className="font-mono text-xs text-white/70 bg-white/5 px-2 py-1 rounded truncate">
                          {p}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-white/30 italic">Không tìm thấy chuỗi liên quan.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: ZIP Struct Folder Structure */}
        {activeTab === 'zip' && (
          <div className="space-y-4 flex flex-col h-full">
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Cấu trúc nén ZIP/APK Reader</h4>
              <p className="text-xs text-white/50 mb-4">Dò tìm các header tệp nén cục bộ để liệt kê danh sách tệp lưu trữ bên trong (APK là một dạng ZIP).</p>
            </div>

            {zipFiles.length === 0 && !analyzingZip ? (
              <div className="bg-white/5 rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center text-center my-auto">
                <Database className="w-10 h-10 text-purple-400/40 mb-3" />
                <p className="text-sm text-white/70 mb-4">Liệt kê danh sách file nén</p>
                <button
                  onClick={handleAnalyzeZip}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl text-xs transition-colors flex items-center space-x-2"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Giải nén ảo (Virtual ZIP Scan)</span>
                </button>
              </div>
            ) : analyzingZip ? (
              <div className="flex flex-col items-center justify-center py-12 my-auto">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs text-white/50 animate-pulse">Đang đọc danh bạ ZIP...</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[300px] space-y-1.5 pr-1 custom-scrollbar">
                <span className="text-[10px] font-bold text-white/30 block mb-2">TỆP TIN BÊN TRONG ZIP ({zipFiles.length})</span>
                {zipFiles.map((file, idx) => (
                  <div key={idx} className="font-mono text-xs text-white/80 bg-white/5 px-2.5 py-2 rounded-xl border border-white/5 truncate flex items-center justify-between">
                    <span className="truncate">{file}</span>
                    <span className="text-[9px] text-green-400 font-bold uppercase shrink-0 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">OK</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 6: Partition & ELF */}
        {activeTab === 'partition' && (
          <div className="space-y-4 flex flex-col h-full">
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Phân tích ELF Header & Boot Sectors</h4>
              <p className="text-xs text-white/50 mb-4">Phân tích cấu trúc tiêu đề nhị phân của Linux (ELF) hoặc Sector khởi động của phân vùng ổ đĩa (MBR Boot Signature).</p>
            </div>

            {partitionType === null && !analyzingElf ? (
              <div className="bg-white/5 rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center text-center my-auto">
                <Cpu className="w-10 h-10 text-purple-400/40 mb-3" />
                <p className="text-sm text-white/70 mb-4">Bắt đầu dịch tiêu đề nhị phân</p>
                <button
                  onClick={handleAnalyzeElf}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl text-xs transition-colors flex items-center space-x-2"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Phân tích cấu trúc</span>
                </button>
              </div>
            ) : analyzingElf ? (
              <div className="flex flex-col items-center justify-center py-12 my-auto">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs text-white/50 animate-pulse">Đang kiểm định Boot / ELF signature...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                  <span className="text-xs font-bold text-white/40 block mb-1">LOẠI ĐỊNH DẠNG</span>
                  <span className="text-sm font-semibold text-purple-400">{partitionType}</span>
                </div>

                {elfInfo && (
                  <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                    <span className="text-xs font-bold text-white/40 block">ELF BINARY METADATA</span>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-black/20 p-2 rounded-lg border border-white/5">
                        <span className="text-white/40 block text-[10px]">LỚP KIẾN TRÚC</span>
                        <span className="font-semibold text-white/95">{elfInfo.class}</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-lg border border-white/5">
                        <span className="text-white/40 block text-[10px]">THỨ TỰ BYTE</span>
                        <span className="font-semibold text-white/95">{elfInfo.dataEncoding}</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-lg border border-white/5 col-span-2">
                        <span className="text-white/40 block text-[10px]">THIẾT BỊ MỤC TIÊU (MACHINE)</span>
                        <span className="font-semibold text-purple-300">{elfInfo.machine}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
