
/**
 * Smart File Analysis Worker
 * Handles heavy processing (strings extraction, magic bytes, metadata)
 * in a background thread to keep the UI responsive.
 */

// Simple types copied for worker context (avoids complex imports)
interface StringEntry {
  value: string;
  offset: number;
  length: number;
  type: 'general' | 'url' | 'email' | 'path' | 'json' | 'xml' | 'sql' | 'password';
}

interface AnalysisProgress {
  type: 'PROGRESS';
  progress: number;
  status: string;
  chunk: number;
  totalChunks: number;
  speed: number; // MB/s
}

interface AnalysisResultMsg {
  type: 'RESULT';
  result: any;
  metrics: any;
}

interface AnalysisPartialMsg {
  type: 'PARTIAL';
  result: any;
  metrics: any;
}

self.onmessage = async (e: MessageEvent) => {
  const { file, perfMode } = e.data;
  if (!file) return;

  const size = file.size;
  const chunkSize = perfMode === 'lite' ? size : (1024 * 1024); // 1MB chunks
  const totalChunks = Math.ceil(size / chunkSize);
  
  let stringsList: StringEntry[] = [];
  let startTime = Date.now();
  let lastProgressUpdate = Date.now();
  
  try {
    // 1. Initial Header Read (Magic Bytes)
    const headerBlob = file.slice(0, Math.min(size, 65536));
    const headerBuffer = await headerBlob.arrayBuffer();
    const headerBytes = new Uint8Array(headerBuffer);
    
    self.postMessage({ 
      type: 'PROGRESS', 
      progress: 5, 
      status: 'Đang nhận diện định dạng (Detecting format)...', 
      chunk: 0, 
      totalChunks 
    });

    // 2. Full Strings Scan (Safe Streaming)
    let currentOffset = 0;
    let chunkCount = 0;
    let totalStringsFound = 0;
    
    while (currentOffset < size) {
      const end = Math.min(currentOffset + chunkSize, size);
      const chunkBlob = file.slice(currentOffset, end);
      const arrayBuffer = await chunkBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      chunkCount++;
      const foundInChunk: StringEntry[] = [];
      extractStringsFromBytes(bytes, currentOffset, foundInChunk);
      
      totalStringsFound += foundInChunk.length;
      
      // Memory Optimization: Only keep a limited set in worker memory for final result
      // but stream everything to main thread if needed.
      if (stringsList.length < 100000) {
        stringsList.push(...foundInChunk);
      }
      
      currentOffset = end;
      
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      const speed = (currentOffset / (1024 * 1024)) / elapsed;
      
      // Update progress every 150ms or every 10 chunks
      if (now - lastProgressUpdate > 150 || chunkCount % 10 === 0) {
        self.postMessage({
          type: 'PROGRESS',
          progress: Math.min(99, (currentOffset / size) * 100),
          status: `Đang quét chuỗi (Scanning)... ${totalStringsFound.toLocaleString()} strings found`,
          chunk: chunkCount,
          totalChunks,
          speed
        });
        
        lastProgressUpdate = now;
      }

      // Safety break for massive files in non-pro mode
      if (perfMode === 'balanced' && totalStringsFound > 200000) break;
    }

    self.postMessage({
      type: 'DONE',
      strings: stringsList,
      headerBytes,
      totalFound: totalStringsFound
    });

  } catch (err: any) {
    self.postMessage({ type: 'ERROR', error: err.message });
  }
};

/**
 * Optimized String Extraction
 */
function extractStringsFromBytes(bytes: Uint8Array, baseOffset: number, results: StringEntry[]) {
  const decoder = new TextDecoder('ascii', { fatal: false });
  let start = -1;

  for (let i = 0; i < bytes.length; i++) {
    const charCode = bytes[i];
    
    // ASCII Printable range (0x20 to 0x7E) + TAB/CR/LF
    const isPrintable = (charCode >= 0x20 && charCode <= 0x7E) || charCode === 0x09 || charCode === 0x0A || charCode === 0x0D;
    
    if (isPrintable) {
      if (start === -1) start = i;
    } else {
      if (start !== -1) {
        const length = i - start;
        if (length >= 4) {
          const text = decoder.decode(bytes.subarray(start, i));
          results.push({
            value: text,
            offset: baseOffset + start,
            length,
            type: classifyString(text)
          });
        }
        start = -1;
      }
    }
    
    // Safety break for single chunk processing to avoid excessive list growth
    if (results.length > 500000) break;
  }
  
  // Handle string at the end of buffer
  if (start !== -1) {
    const length = bytes.length - start;
    if (length >= 4) {
      const text = decoder.decode(bytes.subarray(start));
      results.push({
        value: text,
        offset: baseOffset + start,
        length,
        type: classifyString(text)
      });
    }
  }
}

function classifyString(str: string): any {
  const clean = str.trim().toLowerCase();
  if (/@\w+\.\w+/.test(clean)) return 'email';
  if (clean.includes('http://') || clean.includes('https://')) return 'url';
  if (clean.startsWith('{') && clean.endsWith('}')) return 'json';
  if (clean.startsWith('<') && clean.endsWith('>')) return 'xml';
  if (clean.includes('select ') && clean.includes(' from ')) return 'sql';
  if (clean.includes('/') && clean.includes('.') && clean.length > 5) return 'path';
  return 'general';
}
