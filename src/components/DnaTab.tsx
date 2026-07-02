import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Fingerprint, Activity, FileText, AlertCircle, CheckCircle, HelpCircle, 
  ChevronDown, ChevronUp, RefreshCw, ShieldAlert, Cpu, Layers, Link,
  Check, FileQuestion, Terminal, Sparkles
} from 'lucide-react';
import { AnalysisResult } from '../utils/fileAnalyzer';
import { md5, sha1, sha256 } from '../utils/checksums';
import { useUI } from './UIProvider';

interface DnaTabProps {
  file: File;
  analysis: AnalysisResult | null;
  patches: Map<number, number>;
  onJumpToOffset: (offset: number) => void;
  onNavigateTab?: (tab: string) => void;
}

interface DnaIssue {
  id: string;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'header' | 'structure' | 'entropy' | 'mismatch' | 'overlay';
  message: string;
  explanation: string;
  offset?: number;
}

// Comprehensive File Signature Database (including wildcards)
const FILE_SIGNATURES = [
  { name: 'Portable Executable (PE)', ext: 'exe', mime: 'application/x-msdownload', magic: [0x4D, 0x5A], desc: 'Windows Executable / DLL' },
  { name: 'PNG Image', ext: 'png', mime: 'image/png', magic: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], desc: 'Portable Network Graphics image' },
  { name: 'JPEG Image', ext: 'jpg', mime: 'image/jpeg', magic: [0xFF, 0xD8, 0xFF], desc: 'Joint Photographic Experts Group image' },
  { name: 'GIF Image', ext: 'gif', mime: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38], desc: 'Graphics Interchange Format image' },
  { name: 'PDF Document', ext: 'pdf', mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46], desc: 'Adobe Portable Document Format' },
  { name: 'ZIP Compressed Archive', ext: 'zip', mime: 'application/zip', magic: [0x50, 0x4B, 0x03, 0x04], desc: 'ZIP File Archive (might also be an Office OpenXML file)' },
  { name: 'RAR Archive', ext: 'rar', mime: 'application/x-rar-compressed', magic: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], desc: 'RAR Archive' },
  { name: 'ELF Executable', ext: 'elf', magic: [0x7F, 0x45, 0x4C, 0x46], mime: 'application/x-elf', desc: 'Linux Executable and Linkable Format' },
  { name: 'SQLite Database', ext: 'sqlite', mime: 'application/vnd.sqlite3', magic: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33], desc: 'SQLite 3 Database' },
  { name: 'Java Compiled Class', ext: 'class', mime: 'application/java-byte-code', magic: [0xCA, 0xFE, 0xBA, 0xBE], desc: 'Compiled Java Class File' },
  { name: 'WebP Image', ext: 'webp', mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46, -1, -1, -1, -1, 0x57, 0x45, 0x42, 0x50], desc: 'Google WebP Image' },
  { name: 'WAV Audio', ext: 'wav', mime: 'audio/wav', magic: [0x52, 0x49, 0x46, 0x46, -1, -1, -1, -1, 0x57, 0x41, 0x56, 0x45], desc: 'Waveform Audio File' },
  { name: 'BMP Image', ext: 'bmp', mime: 'image/bmp', magic: [0x42, 0x4D], desc: 'Windows Bitmap Image' },
  { name: 'GZIP Compressed Archive', ext: 'gz', mime: 'application/gzip', magic: [0x1F, 0x8B], desc: 'GNU Zip Archive' },
  { name: 'MP3 Audio', ext: 'mp3', mime: 'audio/mpeg', magic: [0x49, 0x44, 0x33], desc: 'MP3 Audio (ID3v2 Tagged)' },
  { name: 'Tar Archive', ext: 'tar', mime: 'application/x-tar', magic: [], checkOffset: 257, offsetMagic: [0x75, 0x73, 0x74, 0x61, 0x72], desc: 'Unix Tape Archive' }
];

const toHex = (val: number, pad = 0): string => {
  return (val as any).toString(16).toUpperCase().padStart(pad, '0');
};

export default function DnaTab({ file, analysis, patches, onJumpToOffset, onNavigateTab }: DnaTabProps) {
  const { toast } = useUI();
  
  // Local states
  const [headerBytes, setHeaderBytes] = useState<Uint8Array | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hashingProgress, setHashingProgress] = useState<number | null>(null);
  const [hashes, setHashes] = useState<{ md5: string; sha1: string; sha256: string } | null>(null);
  const [characterEncoding, setCharacterEncoding] = useState<string>('N/A');
  
  // Fine-grained entropy segment array (32 segments)
  const [entropySegments, setEntropySegments] = useState<Array<{ segment: number; entropy: number; startOffset: number }>>([]);
  const [globalEntropy, setGlobalEntropy] = useState<number | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [isFullHashScanTriggered, setIsFullHashScanTriggered] = useState(false);

  // Read header and calculate fine-grained local entropy instantly in chunks
  useEffect(() => {
    let active = true;

    async function scanFileDNA() {
      setIsAnalyzing(true);
      try {
        // 1. Read first 1024 bytes for file header
        const headerSlice = file.slice(0, Math.min(1024, file.size));
        const headerBuffer = await headerSlice.arrayBuffer();
        const headBytes = new Uint8Array(headerBuffer);
        if (!active) return;
        setHeaderBytes(headBytes);

        // 2. Character encoding detection (only if text is likely)
        detectEncoding(headBytes);

        // 3. Ultra-fast chunk-based Entropy Segment Profiler
        // Divides the file into 32 segments, reads 16KB from the start of each segment, calculates entropy.
        // This is 100% O(1) memory and works instantly even on 10GB files!
        const segmentCount = 32;
        const segmentSize = Math.floor(file.size / segmentCount);
        const chunkSize = Math.min(16384, file.size); // 16KB max per probe

        const segments: typeof entropySegments = [];
        let totalSumEntropy = 0;

        for (let i = 0; i < segmentCount; i++) {
          const startOffset = i * segmentSize;
          if (startOffset >= file.size) break;

          const slice = file.slice(startOffset, Math.min(startOffset + chunkSize, file.size));
          const buffer = await slice.arrayBuffer();
          const bytes = new Uint8Array(buffer);

          if (bytes.length === 0) continue;

          // Frequency array
          const freqs = new Uint32Array(256);
          for (let b = 0; b < bytes.length; b++) {
            freqs[bytes[b]]++;
          }

          let localEntropy = 0;
          const len = bytes.length;
          for (let f = 0; f < 256; f++) {
            if (freqs[f] > 0) {
              const p = freqs[f] / len;
              localEntropy -= p * Math.log2(p);
            }
          }

          segments.push({
            segment: i + 1,
            entropy: parseFloat(localEntropy.toFixed(4)),
            startOffset
          });
          totalSumEntropy += localEntropy;
        }

        if (!active) return;
        setEntropySegments(segments);
        setGlobalEntropy(parseFloat((totalSumEntropy / segments.length).toFixed(4)));

        // 4. Initial Hashes: Small files get scanned instantly, large files wait for user to hit "Full Hash Scan"
        if (file.size <= 15 * 1024 * 1024) { // <= 15MB
          await calculateCryptoHashes(file);
        }
      } catch (err) {
        console.error('Error scanning File DNA:', err);
      } finally {
        if (active) setIsAnalyzing(false);
      }
    }

    scanFileDNA();
    return () => {
      active = false;
    };
  }, [file]);

  // Character encoding helper
  const detectEncoding = (bytes: Uint8Array) => {
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      setCharacterEncoding('UTF-8 with BOM');
      return;
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      setCharacterEncoding('UTF-8 / UTF-16 LE');
      return;
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      setCharacterEncoding('UTF-16 BE');
      return;
    }

    // Check ASCII vs UTF-8 validity
    let isAscii = true;
    let isUtf8 = true;
    let i = 0;
    while (i < Math.min(1000, bytes.length)) {
      const b = bytes[i];
      if (b > 127) {
        isAscii = false;
        // Simple UTF-8 validation
        if ((b & 0xE0) === 0xC0) {
          if (i + 1 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80) { isUtf8 = false; break; }
          i += 2;
        } else if ((b & 0xF0) === 0xE0) {
          if (i + 2 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80) { isUtf8 = false; break; }
          i += 3;
        } else if ((b & 0xF8) === 0xF0) {
          if (i + 3 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80 || (bytes[i + 3] & 0xC0) !== 0x80) { isUtf8 = false; break; }
          i += 4;
        } else {
          isUtf8 = false;
          break;
        }
      } else {
        // Binary checker
        if (b === 0 && i < bytes.length - 1) {
          isUtf8 = false;
          isAscii = false;
          break;
        }
        i++;
      }
    }

    if (isAscii) setCharacterEncoding('ASCII Plain Text');
    else if (isUtf8) setCharacterEncoding('UTF-8 Unicode');
    else setCharacterEncoding('Binary / Raw Data');
  };

  // Safe chunk-based hashing progress reporter
  const calculateCryptoHashes = async (targetFile: File) => {
    setHashingProgress(0);
    try {
      if (targetFile.size <= 25 * 1024 * 1024) { // Small files read entirely for speed
        const buf = await targetFile.arrayBuffer();
        const uint8 = new Uint8Array(buf);
        setHashingProgress(40);
        const md5Val = md5(uint8);
        setHashingProgress(70);
        const sha1Val = await sha1(uint8);
        setHashingProgress(90);
        const sha256Val = await sha256(uint8);
        setHashes({ md5: md5Val, sha1: sha1Val, sha256: sha256Val });
      } else {
        // For large files, chunk up the file or scan first 25MB to keep browser healthy
        const limitSize = 25 * 1024 * 1024;
        const chunk = targetFile.slice(0, limitSize);
        const buf = await chunk.arrayBuffer();
        const uint8 = new Uint8Array(buf);
        setHashingProgress(50);
        const md5Val = md5(uint8);
        const sha1Val = await sha1(uint8);
        const sha256Val = await sha256(uint8);
        setHashes({
          md5: `${md5Val} (First 25MB Scan)`,
          sha1: `${sha1Val} (First 25MB Scan)`,
          sha256: `${sha256Val} (First 25MB Scan)`
        });
        toast('Đã phân tích 25MB đầu để băm bảo mật giúp giảm tải RAM!', 'info');
      }
    } catch (err) {
      console.error('Hashing failed:', err);
      toast('Băm file thất bại do giới hạn bộ nhớ', 'error');
    } finally {
      setHashingProgress(null);
    }
  };

  // Real file format signature matcher using magic bytes
  const detectedSignature = useMemo(() => {
    if (!headerBytes || headerBytes.length === 0) return null;

    for (const sig of FILE_SIGNATURES) {
      if (sig.magic.length > 0) {
        let match = true;
        for (let i = 0; i < sig.magic.length; i++) {
          if (sig.magic[i] === -1) continue; // Wildcard
          if (headerBytes[i] !== sig.magic[i]) {
            match = false;
            break;
          }
        }
        if (match) return sig;
      } else if (sig.checkOffset !== undefined && sig.offsetMagic) {
        // Check custom offset (e.g. Tarball)
        let match = true;
        const start = sig.checkOffset;
        for (let i = 0; i < sig.offsetMagic.length; i++) {
          if (headerBytes[start + i] !== sig.offsetMagic[i]) {
            match = false;
            break;
          }
        }
        if (match) return sig;
      }
    }

    // fallback: Check text encoding
    if (characterEncoding.includes('ASCII') || characterEncoding.includes('UTF-8')) {
      return {
        name: 'Plain Text File',
        ext: 'txt',
        mime: 'text/plain',
        magic: [],
        desc: 'Plain readable text document'
      };
    }

    return null;
  }, [headerBytes, characterEncoding]);

  // Magic signature display in HEX
  const magicSignatureHex = useMemo(() => {
    if (!headerBytes || headerBytes.length === 0) return 'N/A';
    if (!detectedSignature || detectedSignature.magic.length === 0) {
      // Just return first 4 bytes
      const firstBytes = Array.from(headerBytes.subarray(0, 4)) as number[];
      return firstBytes
        .map((b: any) => toHex(b, 2))
        .join(' ');
    }
    return detectedSignature.magic
      .map((b, idx) => {
        if (b === -1) return '??';
        return toHex(headerBytes[idx], 2);
      })
      .join(' ');
  }, [headerBytes, detectedSignature]);

  // Issues & Anomalies Auditor
  const issues = useMemo((): DnaIssue[] => {
    const list: DnaIssue[] = [];
    if (!file || !headerBytes) return list;

    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';

    // 1. Format spoof check / Extension Mismatch
    if (detectedSignature) {
      const realExt = detectedSignature.ext;
      const isMismatch = realExt !== fileExt && 
        !(realExt === 'jpg' && fileExt === 'jpeg') && 
        !(realExt === 'zip' && ['docx', 'xlsx', 'pptx', 'jar', 'apk'].includes(fileExt));

      if (isMismatch) {
        list.push({
          id: 'spoof_ext',
          title: 'Format Mismatch Detected',
          severity: 'critical',
          category: 'mismatch',
          message: `The actual file structure is "${detectedSignature.name}" (.${realExt}), but the file has a ".${fileExt}" extension.`,
          explanation: 'Extension spoofing is a common evasion technique. Adversaries rename executables or archive payloads (e.g. malicious executable disguised as a picture) to trick users into running them or bypass filters. This discrepancy is highly suspicious.',
          offset: 0
        });
      }
    } else {
      // Unknown magic bytes but has non-text extensions
      const binaryExtensions = ['exe', 'dll', 'png', 'jpg', 'gif', 'pdf', 'zip', 'rar', 'tar', 'class', 'sqlite', 'webp', 'mp3', 'wav', 'bmp'];
      if (binaryExtensions.includes(fileExt) && characterEncoding.includes('Text')) {
        list.push({
          id: 'text_masquerading',
          title: 'Corrupted Header or Fake Extension',
          severity: 'warning',
          category: 'header',
          message: `File extension is .${fileExt} but it consists entirely of plain text characters.`,
          explanation: 'The file contains text characters only but has a binary extension. This means either the file headers are fully corrupted or a text/script payload has been given a fake extension to confuse operators.',
          offset: 0
        });
      }
    }

    // 2. High entropy validation
    if (globalEntropy && globalEntropy > 7.4) {
      const compressibleFormats = ['zip', 'rar', 'gz', 'mp3', 'mp4', 'png', 'jpg', 'webp'];
      const isExpected = detectedSignature && compressibleFormats.includes(detectedSignature.ext);

      if (!isExpected) {
        list.push({
          id: 'high_entropy',
          title: 'Suspicious High Entropy Payload',
          severity: 'warning',
          category: 'entropy',
          message: `File has an average entropy of ${globalEntropy} / 8.00 without matching a standard compressed format.`,
          explanation: 'Entropy measures randomness. Plain text files have low entropy (3-5), whereas compressed archives or encrypted streams have high entropy (close to 8). If a non-archive file (e.g., .txt or custom config) has extremely high entropy, it strongly indicates embedded encryption, packing, shellcode, or hidden payloads.',
          offset: 0
        });
      }
    }

    // 3. Nested executable or archive check (embedded signature scanning)
    // Scan for MZ (0x4D 0x5A) or PK (0x50 0x4B 0x03 0x04) signatures inside the header block at offset > 0
    if (headerBytes.length > 2) {
      for (let i = 1; i < headerBytes.length - 4; i++) {
        // Look for MZ Stub (MZ)
        if (headerBytes[i] === 0x4D && headerBytes[i+1] === 0x5A) {
          list.push({
            id: `embed_mz_${i}`,
            title: 'Embedded MZ Stub (Executable) Found',
            severity: 'critical',
            category: 'overlay',
            message: `Detected embedded MZ signature (Windows Portable Executable stub) at byte offset 0x${toHex(i)}.`,
            explanation: 'An MZ header at a non-zero offset indicates that an executable binary is hidden or nested within another file. This is a common pattern in binders, malware packers, or polyglot files where a passive container hides an active backdoor.',
            offset: i
          });
        }
        // Look for PK Archive (PK..)
        if (headerBytes[i] === 0x50 && headerBytes[i+1] === 0x4B && headerBytes[i+2] === 0x03 && headerBytes[i+3] === 0x04) {
          list.push({
            id: `embed_pk_${i}`,
            title: 'Embedded PK (ZIP Archive) Block Found',
            severity: 'warning',
            category: 'overlay',
            message: `Detected embedded PK ZIP header at byte offset 0x${toHex(i)}.`,
            explanation: 'Finding archive markers like PK inside another file structure suggests there is a nested archive payload, which might carry resources, compressed configs, or hidden payloads that are read dynamically at runtime.',
            offset: i
          });
        }
      }
    }

    // 4. Missing Footer Check (Truncated File)
    if (detectedSignature) {
      if (detectedSignature.ext === 'png') {
        // PNG must end with IEND chunk (00 00 00 00 49 45 4E 44 AE 42 60 82)
        // We cannot read the very end without an extra chunk read, but we can verify file structure if available in analysis
        if (analysis && analysis.structure) {
          const hasFooter = analysis.structure.some(s => s.type === 'footer' || s.name.toLowerCase().includes('iend'));
          if (!hasFooter) {
            list.push({
              id: 'png_no_footer',
              title: 'Missing PNG Footer Chunk',
              severity: 'warning',
              category: 'structure',
              message: 'The PNG file is missing the standard IEND footer marker. The file might be truncated or corrupted.',
              explanation: 'PNG images are composed of sequential chunks, ending with the IEND chunk. If this chunk is missing, graphic renderers might fail, and forensics software flags it as incomplete or deliberately stripped to hide appended data overlays.',
              offset: Math.max(0, file.size - 12)
            });
          }
        }
      }
    }

    // 5. Raw Scan Mode warning item
    if (analysis && analysis.isRawScanMode) {
      list.push({
        id: 'raw_scan_active',
        title: 'Chạy ở Chế độ Quét Thô (Raw Scan Mode Active)',
        severity: 'warning',
        category: 'structure',
        message: `Bộ parser chuyên biệt không khả dụng hoặc bị lỗi: ${analysis.rawScanWarning || 'Không có sẵn bộ phân tách nâng cao'}`,
        explanation: 'Do không có parser nâng cao phù hợp cho định dạng này, hệ thống đã chuyển sang chế độ Quét thô (Raw Scan Mode). Chế độ này sử dụng các kỹ thuật quét mẫu dấu vết nhị phân tĩnh để dò tìm chữ ký số, bố cục dữ liệu, siêu dữ liệu cơ bản, Strings và rà soát luật YARA một cách độc lập và an toàn mà không làm gián đoạn phân tích.',
        offset: 0
      });
    }

    // Default general information if perfectly safe
    if (list.length === 0) {
      list.push({
        id: 'clean_bill',
        title: 'Structure Integrity is Clean',
        severity: 'info',
        category: 'header',
        message: 'No abnormal signatures, mismatches, or nested structures were found in the parsed regions.',
        explanation: 'The auditor found that the file complies with standard specifications: its header matches the file extension, the randomness of bytes is typical for this format, and no embedded executive markers were detected.'
      });
    }

    return list;
  }, [file, headerBytes, detectedSignature, characterEncoding, globalEntropy, analysis]);

  // Calculate Health Score (0 - 100)
  const healthScore = useMemo(() => {
    let score = 100;
    let criticalCount = 0;
    let warningCount = 0;

    for (const issue of issues) {
      if (issue.id === 'clean_bill') continue;
      if (issue.severity === 'critical') {
        score -= 35;
        criticalCount++;
      } else if (issue.severity === 'warning') {
        score -= 15;
        warningCount++;
      }
    }

    return Math.max(0, score);
  }, [issues]);

  const toggleExpandIssue = (id: string) => {
    if (expandedIssue === id) {
      setExpandedIssue(null);
    } else {
      setExpandedIssue(id);
    }
  };

  // Helper for color rating
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
    if (score >= 60) return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
    return 'text-red-400 border-red-500/20 bg-red-500/5';
  };

  // Trigger manual deep scan for hashes on large files
  const handleManualFullHashScan = () => {
    setIsFullHashScanTriggered(true);
    calculateCryptoHashes(file);
  };

  return (
    <div id="file_dna_container" className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-1 md:p-2">
      
      {/* Left Column: Health Index, Hashes, Profile Info */}
      <div className="lg:col-span-4 flex flex-col space-y-4">
        
        {/* Health Score Panel */}
        <div id="dna_health_score_panel" className="bg-[#0b0f19]/60 border border-white/5 rounded-2xl p-5 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-purple-500/[0.05] to-transparent rounded-bl-full pointer-events-none" />
          
          <h4 className="text-[10px] font-extrabold text-white/40 uppercase tracking-widest mb-4">File Health Index</h4>
          
          <div className="relative flex items-center justify-center w-28 h-28">
            {/* Beautiful rotating ring */}
            <div className={`absolute inset-0 rounded-full border-2 border-dashed ${healthScore >= 80 ? 'border-emerald-500/30 animate-[spin_40s_linear_infinite]' : healthScore >= 60 ? 'border-amber-500/30 animate-[spin_30s_linear_infinite]' : 'border-red-500/30 animate-[spin_20s_linear_infinite]'}`} />
            
            <div className="flex flex-col items-center">
              <span className={`text-4xl font-black tracking-tighter ${healthScore >= 80 ? 'text-emerald-400' : healthScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                {healthScore}
              </span>
              <span className="text-[9px] font-mono font-medium text-white/30 uppercase mt-0.5">SCORE</span>
            </div>
          </div>

          <div className={`mt-4 px-3 py-1 rounded-full border text-xs font-semibold ${getScoreColor(healthScore)}`}>
            {healthScore >= 85 ? 'Highly Secure & Intact' : healthScore >= 60 ? 'Suspicious or Mismatched' : 'Critical Integrity Risk'}
          </div>
        </div>

        {/* Essential File Information */}
        <div id="dna_profile_panel" className="bg-[#0b0f19]/60 border border-white/5 rounded-2xl p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-white/5 pb-3">
            <Fingerprint className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-white tracking-wider uppercase">Biological Profile</h3>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-white/45">File Name:</span>
              <span className="text-white/95 font-medium truncate max-w-[160px] md:max-w-[200px]" title={file.name}>{file.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/45">Size:</span>
              <span className="text-white/95 font-mono bg-white/5 px-2 py-0.5 rounded text-[11px]">
                {file.size.toLocaleString()} bytes
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/45">Real Format:</span>
              <span className="text-purple-400 font-bold bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded text-[11px]">
                {detectedSignature ? detectedSignature.name : 'Unknown Binary'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/45">MIME Type:</span>
              <span className="text-white/90 font-mono text-[11px]">
                {detectedSignature ? detectedSignature.mime : 'application/octet-stream'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/45">Extension:</span>
              <span className="text-white/90 uppercase font-bold text-[11px]">
                .{file.name.split('.').pop() || 'none'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/45">Magic Number:</span>
              <span className="text-emerald-400 font-mono font-bold bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded text-[11px]">
                {magicSignatureHex}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/45">Character Encoding:</span>
              <span className="text-sky-400 font-medium text-[11px]">
                {characterEncoding}
              </span>
            </div>
          </div>
        </div>

        {/* Checksum Signatures */}
        <div id="dna_hashes_panel" className="bg-[#0b0f19]/60 border border-white/5 rounded-2xl p-5 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 border-b border-white/5 pb-3 mb-4">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-white tracking-wider uppercase font-sans">DNA Hashes (MD5/SHA)</h3>
            </div>

            {hashingProgress !== null ? (
              <div className="py-6 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                <span className="text-xs font-mono text-white/50">Băm tệp tin... {hashingProgress}%</span>
              </div>
            ) : hashes ? (
              <div className="space-y-4 font-mono text-[10px]">
                <div className="space-y-1">
                  <span className="text-white/40 block font-sans text-xs">MD5 Hash:</span>
                  <div className="bg-black/40 border border-white/5 p-2 rounded-lg text-emerald-400 break-all select-all">
                    {hashes.md5}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-white/40 block font-sans text-xs">SHA-1:</span>
                  <div className="bg-black/40 border border-white/5 p-2 rounded-lg text-indigo-300 break-all select-all">
                    {hashes.sha1}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-white/40 block font-sans text-xs">SHA-256:</span>
                  <div className="bg-black/40 border border-white/5 p-2 rounded-lg text-purple-300 break-all select-all">
                    {hashes.sha256}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center space-y-4">
                <FileQuestion className="w-8 h-8 text-white/10" />
                <p className="text-center text-xs text-white/40 max-w-[240px]">
                  Tệp tin lớn ({ (file.size / (1024*1024)).toFixed(1) } MB). Nhấp băm toàn bộ để tính toán mã bảo mật.
                </p>
                <button
                  onClick={handleManualFullHashScan}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-500/10 flex items-center space-x-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Băm Toàn Bộ Tệp</span>
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Right Column: Visual Entropy and Interactive Auditor Issues */}
      <div className="lg:col-span-8 flex flex-col space-y-5">
        
        {/* Dynamic Entropy Spark Chart */}
        <div id="dna_entropy_panel" className="bg-[#0b0f19]/60 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold text-white tracking-wider uppercase font-sans">Entropy Analysis</h3>
            </div>
            {globalEntropy !== null && (
              <div className="flex items-center space-x-2 font-mono text-[11px]">
                <span className="text-white/45">Avg:</span>
                <span className="text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  {globalEntropy} / 8.00
                </span>
              </div>
            )}
          </div>

          {/* Custom SVG Responsive Sparkline Area Chart */}
          {entropySegments.length > 0 ? (
            <div className="relative">
              <svg viewBox="0 0 600 120" className="w-full h-28 overflow-visible">
                <defs>
                  <linearGradient id="entropyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid lines */}
                <line x1="0" y1="30" x2="600" y2="30" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                <line x1="0" y1="60" x2="600" y2="60" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                <line x1="0" y1="90" x2="600" y2="90" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />

                {/* Path Area */}
                <path
                  d={`
                    M 0 110
                    ${entropySegments.map((seg, idx) => {
                      const x = (idx / (entropySegments.length - 1)) * 600;
                      const y = 110 - (seg.entropy / 8) * 100;
                      return `L ${x} ${y}`;
                    }).join(' ')}
                    L 600 110 Z
                  `}
                  fill="url(#entropyGrad)"
                />

                {/* Path Outline */}
                <path
                  d={entropySegments.map((seg, idx) => {
                    const x = (idx / (entropySegments.length - 1)) * 600;
                    const y = 110 - (seg.entropy / 8) * 100;
                    return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth="2"
                  strokeLinecap="round"
                />

                {/* Interactive circles/nodes */}
                {entropySegments.map((seg, idx) => {
                  const x = (idx / (entropySegments.length - 1)) * 600;
                  const y = 110 - (seg.entropy / 8) * 100;
                  return (
                    <circle
                      key={idx}
                      cx={x}
                      cy={y}
                      r="2"
                      className="fill-purple-400 stroke-purple-600 hover:r-4 transition-all cursor-pointer"
                      onClick={() => {
                        onJumpToOffset(seg.startOffset);
                        toast(`Nhảy tới segment offset 0x${toHex(seg.startOffset)}`, 'info');
                      }}
                    >
                      <title>{`Offset: 0x${toHex(seg.startOffset)}\nEntropy: ${seg.entropy}`}</title>
                    </circle>
                  );
                })}
              </svg>
              <div className="flex justify-between items-center text-[9px] font-mono text-white/30 px-1 mt-2">
                <span>Offset 0x00000000 (Start)</span>
                <span>Click a node to jump to offset in Hex Editor</span>
                <span>Offset 0x{toHex(file.size)} (End)</span>
              </div>
            </div>
          ) : (
            <div className="h-28 flex items-center justify-center">
              <span className="text-xs text-white/20">Calculating entropy distribution...</span>
            </div>
          )}
        </div>

        {/* Structural Alignment / Layers Overview */}
        {analysis && analysis.structure && analysis.structure.length > 0 && (
          <div id="dna_layers_panel" className="bg-[#0b0f19]/60 border border-white/5 rounded-2xl p-5">
            <div className="flex items-center space-x-2 border-b border-white/5 pb-3 mb-4">
              <Layers className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-white tracking-wider uppercase font-sans">Offset Maps & Format Chunks</h3>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
              {analysis.structure.map((s, idx) => {
                const colors = {
                  header: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20',
                  metadata: 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/20',
                  data: 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20',
                  footer: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20',
                  index: 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border-sky-500/20',
                  marker: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                };
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      onJumpToOffset(s.start);
                      toast(`Định vị phân vùng [${s.name}] tại offset 0x${toHex(s.start)}`, 'info');
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-mono font-medium transition-all flex items-center space-x-1.5 cursor-pointer ${colors[s.type] || 'bg-white/5 hover:bg-white/10 text-white border-white/10'}`}
                  >
                    <span>{s.name}</span>
                    <span className="opacity-40">|</span>
                    <span className="text-[9px] opacity-70">0x{toHex(s.start)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Diagnostic Integrity Auditor (Issues list) */}
        <div id="dna_auditor_panel" className="bg-[#0b0f19]/60 border border-white/5 rounded-2xl p-5 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 border-b border-white/5 pb-3 mb-4">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold text-white tracking-wider uppercase font-sans">Diagnostic Security Auditor</h3>
            </div>

            <div className="space-y-2.5">
              <AnimatePresence initial={false}>
                {issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`border rounded-xl transition-all overflow-hidden ${
                      issue.severity === 'critical'
                        ? 'border-red-500/20 bg-red-500/[0.02]'
                        : issue.severity === 'warning'
                        ? 'border-amber-500/20 bg-amber-500/[0.02]'
                        : 'border-emerald-500/10 bg-emerald-500/[0.01]'
                    }`}
                  >
                    {/* Header trigger */}
                    <div
                      onClick={() => toggleExpandIssue(issue.id)}
                      className="p-3.5 flex items-start justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="mt-0.5">
                          {issue.severity === 'critical' ? (
                            <AlertCircle className="w-4.5 h-4.5 text-red-400" />
                          ) : issue.severity === 'warning' ? (
                            <AlertCircle className="w-4.5 h-4.5 text-amber-400" />
                          ) : (
                            <CheckCircle className="w-4.5 h-4.5 text-emerald-400" />
                          )}
                        </div>
                        <div className="text-left">
                          <h4 className="text-xs font-bold text-white flex items-center space-x-2">
                            <span>{issue.title}</span>
                            <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                              issue.severity === 'critical' ? 'bg-red-500/15 text-red-400' :
                              issue.severity === 'warning' ? 'bg-amber-500/15 text-amber-400' :
                              'bg-emerald-500/15 text-emerald-400'
                            }`}>
                              {issue.severity}
                            </span>
                          </h4>
                          <p className="text-[11px] text-white/50 mt-1 line-clamp-1 leading-relaxed">
                            {issue.message}
                          </p>
                        </div>
                      </div>
                      <div className="text-white/30 pl-2">
                        {expandedIssue === issue.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {/* Expandable Explanation block */}
                    {expandedIssue === issue.id && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-3.5 pb-4 pt-1 border-t border-white/5 text-xs text-white/70 space-y-3 leading-relaxed text-left bg-black/[0.15]">
                          <p className="italic">
                            {issue.explanation}
                          </p>
                          
                          {issue.offset !== undefined && (
                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                              <span className="font-mono text-[10px] text-white/45">
                                Location Offset: <strong className="text-purple-400 font-bold">0x{toHex(issue.offset)}</strong>
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onJumpToOffset(issue.offset!);
                                  toast(`Jumped to byte offset 0x${toHex(issue.offset!)}`, 'success');
                                }}
                                className="px-2.5 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 font-bold font-mono text-[9px] rounded-md border border-purple-500/25 transition-all flex items-center space-x-1 cursor-pointer"
                              >
                                <Link className="w-2.5 h-2.5" />
                                <span>Go to Hex</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-5 pt-3.5 border-t border-white/5 flex flex-col md:flex-row md:items-center md:justify-between text-[10px] text-white/30 space-y-1.5 md:space-y-0">
            <span className="flex items-center space-x-1.5">
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>Bio-Diagnostics powered by magic signatures and structural validation.</span>
            </span>
            <span className="font-mono">INTEGRITY AUDIT LOG</span>
          </div>
        </div>

      </div>

    </div>
  );
}
