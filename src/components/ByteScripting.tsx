import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Code, Play, Trash2, HelpCircle, RefreshCw, FileCode, Check, 
  AlertCircle, Terminal, ChevronRight, Copy, Save, Sparkles, BookOpen
} from 'lucide-react';
import { useUI } from './UIProvider';

interface ByteScriptingProps {
  file: File;
  patches: Map<number, number>;
  setPatches: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  virtualFileSize: number;
  onApplied?: () => void;
}

interface ConsoleLine {
  type: 'info' | 'success' | 'error' | 'log';
  text: string;
  timestamp: string;
}

export default function ByteScripting({ file, patches, setPatches, virtualFileSize, onApplied }: ByteScriptingProps) {
  const { toast, confirm } = useUI();
  const [scriptCode, setScriptCode] = useState<string>(`// Advanced Byte Scripting Console
// Use modern ES6 async/await to dynamically compile & patch bytes in real-time.
// Supported Sandbox API:
//   - await readByte(offset) : Returns byte value (0-255) at the offset (checked in active patches first, then reads File).
//   - patchByte(offset, value) : Patches a single byte at the specified offset.
//   - patchBytes(offset, arrayOfBytes) : Patches a list of bytes starting from the offset.
//   - fileSize : The absolute virtual size of the file (in bytes).
//   - log(message) : Output to the console log below.

async function main() {
  log("Starting byte script compiler...");
  log(\`Target File Size: \${fileSize} bytes\`);

  // Example 1: Read the magic number of the file
  const magic0 = await readByte(0);
  const magic1 = await readByte(1);
  log(\`First 2 Bytes (Hex): 0x\${magic0.toString(16).toUpperCase()} 0x\${magic1.toString(16).toUpperCase()}\`);

  // Example 2: Patch 4 NOPs (0x90) starting from offset 0x10 (uncomment to apply)
  // patchBytes(0x10, [0x90, 0x90, 0x90, 0x90]);
  // log("Patched 4 NOPs at 0x10!");

  log("Script execution finished successfully!", "success");
}
`);

  const [consoleLogs, setConsoleLogs] = useState<ConsoleLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('custom');
  const [patchCountPreview, setPatchCountPreview] = useState<number>(0);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Scroll logs to bottom
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  const addLog = (text: string, type: 'info' | 'success' | 'error' | 'log' = 'log') => {
    const time = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [...prev, { type, text, timestamp: time }]);
  };

  const clearConsole = () => {
    setConsoleLogs([]);
    toast('Đã dọn dẹp console', 'info');
  };

  const templates = {
    custom: {
      name: 'Mẫu trống (Custom Script)',
      code: `// Custom Byte Script
async function main() {
  log("Bắt đầu thực thi script...");
  
  // Viết mã xử lý của bạn ở đây.
  
  log("Đã hoàn thành!", "success");
}`
    },
    xorRange: {
      name: 'XOR Crypt (Mã hóa XOR vùng nhớ)',
      code: `// XOR Encrypt / Decrypt range
// Helpful to decrypt obfuscated string tables or custom shellcode
async function main() {
  const startOffset = 0x00; // Thay đổi offset bắt đầu
  const endOffset = 0x100;  // Thay đổi offset kết thúc (không bao gồm)
  const xorKey = 0xAA;      // Key XOR (ví dụ: 0xAA)

  log(\`Bắt đầu XOR vùng nhớ từ 0x\${startOffset.toString(16)} đến 0x\${endOffset.toString(16)} với Key: 0x\${xorKey.toString(16).toUpperCase()}\`);
  
  let count = 0;
  for (let offset = startOffset; offset < endOffset && offset < fileSize; offset++) {
    const originalByte = await readByte(offset);
    const patchedByte = originalByte ^ xorKey;
    patchByte(offset, patchedByte);
    count++;
  }

  log(\`Đã XOR thành công \${count} byte!\`, "success");
}`
    },
    fillBlock: {
      name: 'Fill block (Ghi đè mảng byte tuần tự)',
      code: `// Lấp đầy vùng nhớ bằng pattern byte tuần tự (ví dụ: NOP sled hoặc Null-byte padding)
async function main() {
  const startOffset = 0x100; 
  const length = 64; // Ghi đè 64 byte
  const fillValue = 0x90; // Byte đè (ví dụ NOP 0x90, hoặc 0x00)

  log(\`Bắt đầu lấp đầy \${length} byte từ 0x\${startOffset.toString(16)} bằng byte 0x\${fillValue.toString(16).toUpperCase()}\`);
  
  const pattern = Array(length).fill(fillValue);
  patchBytes(startOffset, pattern);
  
  log("Đã lấp đầy dữ liệu thành công!", "success");
}`
    },
    stringObfuscator: {
      name: 'Tìm và Ghi đè Chuỗi văn bản',
      code: `// Trình tìm kiếm & mã hóa/ẩn chuỗi ASCII nhạy cảm trong file nhị phân
async function main() {
  // Chuỗi ASCII cần tìm
  const searchStr = "ADMIN_PASSWORD";
  const replaceStr = "CONFIDENTIAL_P"; // Có độ dài tương đương
  
  log(\`Tìm kiếm chuỗi: "\${searchStr}" để thay thế bằng: "\${replaceStr}"\`);
  
  // Chuyển chuỗi sang mảng byte
  const searchBytes = Array.from(searchStr).map(c => c.charCodeAt(0));
  const replaceBytes = Array.from(replaceStr).map(c => c.charCodeAt(0));
  
  // Thuật toán duyệt đơn giản trên 100KB đầu (bạn có thể mở rộng)
  const maxSearchSize = Math.min(fileSize, 256 * 1024);
  let matches = 0;
  
  for (let i = 0; i <= maxSearchSize - searchBytes.length; i++) {
    let matched = true;
    for (let j = 0; j < searchBytes.length; j++) {
      const b = await readByte(i + j);
      if (b !== searchBytes[j]) {
        matched = false;
        break;
      }
    }
    
    if (matched) {
      log(\`Tìm thấy chuỗi tại Offset: 0x\${i.toString(16).toUpperCase()}\`, "info");
      patchBytes(i, replaceBytes);
      matches++;
      i += searchBytes.length - 1; // Nhảy qua chuỗi đã thay thế
    }
  }
  
  log(\`Đã tìm thấy và patch thành công \${matches} vị trí chuỗi!\`, "success");
}`
    },
    bulkAsmCompiler: {
      name: 'Assembler Compiler (Biên dịch danh sách byte)',
      code: `// Trình dịch Hex Bit / Biên dịch chỉ thị lắp ráp thủ công
// Hỗ trợ dịch cú pháp kiểu danh sách dòng dạng: "[Offset]: [Hex Bytes]"
async function main() {
  log("Bắt đầu dịch danh sách Hex Bit...");

  const instructionList = \`
    0x00: 90 90 90 90
    0x10: FF FF FF FF
    0x24: EB 1E
  \`;

  const lines = instructionList.split("\\n");
  let patchCount = 0;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;

    const parts = line.split(":");
    if (parts.length < 2) continue;

    const offsetStr = parts[0].trim();
    const hexBytesStr = parts[1].trim();

    // Parse offset
    const offset = parseInt(offsetStr, 16);
    if (isNaN(offset) || offset < 0 || offset >= fileSize) {
      log(\`Lỗi: Offset không hợp lệ "\${offsetStr}"\`, "error");
      continue;
    }

    // Parse hex bytes
    const bytes = hexBytesStr.split(/\\s+/).map(hex => parseInt(hex, 16));
    if (bytes.some(b => isNaN(b) || b < 0 || b > 255)) {
      log(\`Lỗi: Chuỗi Hex bytes không hợp lệ trong dòng: "\${line}"\`, "error");
      continue;
    }

    patchBytes(offset, bytes);
    log(\`Đã dịch thành công \${bytes.length} byte tại Offset 0x\${offset.toString(16).toUpperCase()}\`, "info");
    patchCount += bytes.length;
  }

  log(\`Hoàn tất! Tổng cộng đã biên dịch và áp dụng \${patchCount} byte vào file.\`, "success");
}`
    }
  };

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as keyof typeof templates;
    setSelectedTemplate(val);
    if (templates[val]) {
      setScriptCode(templates[val].code);
      toast('Đã tải mẫu code mới', 'info');
    }
  };

  // Safe file slice reading function that checks patches first, then reads the File
  const readByteAtOffset = async (offset: number): Promise<number> => {
    if (offset < 0 || offset >= file.size) {
      throw new Error(`Offset out of bounds: 0x${offset.toString(16).toUpperCase()}`);
    }
    // Check if patched
    if (patches.has(offset)) {
      return patches.get(offset)!;
    }
    // Read from File slice
    return new Promise((resolve, reject) => {
      const slice = file.slice(offset, offset + 1);
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          const arr = new Uint8Array(reader.result);
          resolve(arr[0]);
        } else {
          reject(new Error('Failed to read file slice buffer'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(slice);
    });
  };

  const handleRunScript = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setConsoleLogs([]);
    addLog('Khởi tạo Sandbox Script Engine...', 'info');

    // Create a temporary patch list so we can apply them on approval or success
    const localPatches = new Map<number, number>(patches);
    let runError: any = null;

    // Custom APIs for the sandbox
    const readByte = async (offset: number): Promise<number> => {
      // Direct reading checks localPatches first
      if (localPatches.has(offset)) {
        return localPatches.get(offset)!;
      }
      return await readByteAtOffset(offset);
    };

    const patchByte = (offset: number, value: number) => {
      if (offset < 0 || offset >= virtualFileSize) {
        throw new Error(`Virtual offset out of bounds in patchByte: 0x${offset.toString(16).toUpperCase()}`);
      }
      const val = Math.floor(value) & 0xFF; // Safe clamp
      localPatches.set(offset, val);
    };

    const patchBytes = (offset: number, values: number[]) => {
      if (!Array.isArray(values)) {
        throw new Error('patchBytes expects an array of byte values as the second parameter.');
      }
      for (let i = 0; i < values.length; i++) {
        patchByte(offset + i, values[i]);
      }
    };

    const log = (message: any, type: 'info' | 'success' | 'error' | 'log' = 'log') => {
      const text = typeof message === 'object' ? JSON.stringify(message) : String(message);
      addLog(text, type);
    };

    const startTime = performance.now();

    try {
      // Evaluate JS code securely
      // We will construct an async function utilizing evaluated user script
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      
      // Inject variables into function args, binding our sandbox APIs
      const compiledFunction = new AsyncFunction(
        'readByte',
        'patchByte',
        'patchBytes',
        'fileSize',
        'log',
        // User's script can declare functions, we wrap it
        `
        ${scriptCode}
        try {
          if (typeof main === 'function') {
            await main();
          } else {
            log("Lỗi: Không tìm thấy hàm main() trong mã nguồn của bạn. Vui lòng định nghĩa async function main() { ... }", "error");
          }
        } catch (err) {
          throw err;
        }
        `
      );

      // Execute with compiled bindings
      await compiledFunction(
        readByte,
        patchByte,
        patchBytes,
        virtualFileSize,
        log
      );

      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(1);
      addLog(`Thực thi hoàn tất trong ${duration}ms!`, 'success');

      // Calculate how many patches were added/changed
      let diffCount = 0;
      localPatches.forEach((val, key) => {
        if (!patches.has(key) || patches.get(key) !== val) {
          diffCount++;
        }
      });

      if (diffCount > 0) {
        setPatches(localPatches);
        toast(`Đã áp dụng thành công ${diffCount} patch mới từ Script!`, 'success');
        if (onApplied) onApplied();
      } else {
        toast('Không có patch mới nào được ghi nhận.', 'info');
      }

    } catch (err: any) {
      console.error(err);
      addLog(`Lỗi Runtime: ${err.message || err}`, 'error');
      toast('Thực thi script thất bại do có lỗi', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-left p-4 md:p-6 space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <h3 className="text-base font-bold text-white flex items-center">
            <Code className="w-5 h-5 text-purple-400 mr-2.5" />
            Byte Scripting & Compiler (Dịch Hex Bit)
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Viết code tự động hóa các thao tác xử lý nhị phân, giải mã XOR, vá lỗi hàng loạt, hoặc biên dịch các chỉ thị hex bit sang vùng nhớ.
          </p>
        </div>

        <div className="flex items-center space-x-3.5 shrink-0 self-start md:self-auto">
          {/* Preset Select */}
          <div className="flex items-center bg-white/[0.03] border border-white/10 rounded-xl px-2.5 py-1.5">
            <BookOpen className="w-4 h-4 text-white/40 mr-1.5" />
            <select
              value={selectedTemplate}
              onChange={handleTemplateChange}
              className="bg-transparent border-none outline-none text-xs text-white/80 font-medium cursor-pointer focus:ring-0 p-0"
            >
              <option value="custom" className="bg-[#0f0f13] text-white">--- Chọn mẫu script ---</option>
              {Object.entries(templates).map(([key, t]) => (
                <option key={key} value={key} className="bg-[#0f0f13] text-white">
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Action Trigger */}
          <button
            onClick={handleRunScript}
            disabled={isRunning}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-600/15"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang thực thi...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Chạy Script</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor & Console layout split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[500px]">
        {/* Code Editor Column (Left) */}
        <div className="lg:col-span-7 flex flex-col bg-[#121216]/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/5 shrink-0">
            <span className="text-[10px] uppercase font-mono tracking-wider text-purple-400 font-bold flex items-center">
              <FileCode className="w-3.5 h-3.5 mr-1.5" />
              main.js (Sandbox Sandbox Engine)
            </span>
            <div className="text-[10px] text-white/40 font-mono">
              Active Patches: <span className="text-emerald-400 font-bold">{patches.size} bytes</span>
            </div>
          </div>

          <div className="flex-1 relative font-mono text-xs p-1">
            <textarea
              value={scriptCode}
              onChange={(e) => setScriptCode(e.target.value)}
              disabled={isRunning}
              className="w-full h-full min-h-[400px] bg-transparent text-white/90 p-4 border-none outline-none focus:ring-0 font-mono leading-relaxed resize-none overflow-y-auto"
              style={{ tabSize: 2 }}
              spellCheck={false}
            />
          </div>
        </div>

        {/* Console logs (Right) */}
        <div className="lg:col-span-5 flex flex-col bg-[#0b0b0e]/70 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/5 shrink-0">
            <span className="text-[10px] uppercase font-mono tracking-wider text-white/50 font-bold flex items-center">
              <Terminal className="w-3.5 h-3.5 text-blue-400 mr-1.5" />
              Console Terminal
            </span>
            <button
              onClick={clearConsole}
              className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white transition-colors"
              title="Clear Console"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Console logs stream */}
          <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] space-y-2.5 min-h-[250px] max-h-[450px] hide-scrollbar bg-black/30">
            {consoleLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-white/20 text-center py-10">
                <Terminal className="w-10 h-10 mb-2 stroke-[1.5]" />
                <span>Console rỗng. Nhấn "Chạy Script" để bắt đầu.</span>
              </div>
            ) : (
              consoleLogs.map((log, index) => {
                let colorClass = 'text-white/60';
                let bgClass = 'bg-transparent';
                if (log.type === 'success') {
                  colorClass = 'text-emerald-400';
                  bgClass = 'bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-500/10';
                } else if (log.type === 'error') {
                  colorClass = 'text-red-400 font-semibold';
                  bgClass = 'bg-red-950/20 px-2 py-0.5 rounded border border-red-500/10';
                } else if (log.type === 'info') {
                  colorClass = 'text-blue-400';
                  bgClass = 'bg-blue-950/10 px-2 py-0.5 rounded border border-blue-500/5';
                }

                return (
                  <div key={index} className={`flex items-start space-x-2 leading-relaxed ${bgClass}`}>
                    <span className="text-white/20 select-none">[{log.timestamp}]</span>
                    <span className={`${colorClass} flex-1 break-all whitespace-pre-wrap`}>
                      {log.text}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>

          {/* Help Quick Card */}
          <div className="p-4 bg-white/[0.02] border-t border-white/5 text-[11px] text-white/50 space-y-2">
            <span className="font-semibold text-white/80 block">💡 Phím tắt & Hướng dẫn nhanh:</span>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>Mã nguồn thực thi tự động trong một sandbox bất đồng bộ (Async context).</li>
              <li>Sử dụng <code className="text-purple-300 font-mono">await readByte(offset)</code> để đọc giá trị byte cực nhanh từ luồng File mà không tốn RAM.</li>
              <li>Bạn có thể sao chép code mẫu từ dropdown presets để tùy chỉnh nhanh.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
