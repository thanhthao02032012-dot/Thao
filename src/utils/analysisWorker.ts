/**
 * Redesigned 10-Stage Progressive Smart File Analysis Worker
 * Runs computationally heavy stages (signature detection, progressive hashing,
 * entropy, strings extraction, YARA rules) in a background thread.
 * Guarantees that failures in one stage do not halt the remaining pipeline.
 */

import { runSmartParser, scanForSignatures } from './fileParsers';
import { SHA256 } from './sha256';

// Stage interfaces
interface StringEntry {
  value: string;
  offset: number;
  length: number;
  type: string;
}

// Global pause/cancel variables
let isPaused = false;
let isCancelled = false;

self.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  
  if (data.type === 'PAUSE') {
    isPaused = true;
    return;
  }
  if (data.type === 'RESUME') {
    isPaused = false;
    return;
  }
  if (data.type === 'CANCEL') {
    isCancelled = true;
    return;
  }

  const { file, perfMode } = data;
  if (!file) return;

  isPaused = false;
  isCancelled = false;

  const size = file.size;
  const startTime = Date.now();
  let pausedDuration = 0;

  // Pipeline communication helpers
  const startStage = (id: string, name: string) => {
    self.postMessage({ type: 'STAGE_START', stageId: id, stageName: name });
  };

  const updateStage = (id: string, progress: number, statusText: string, extraMetrics?: any) => {
    self.postMessage({
      type: 'STAGE_UPDATE',
      stageId: id,
      progress,
      statusText,
      extraMetrics
    });
  };

  const completeStage = (id: string, status: 'success' | 'partial' | 'failed', error?: string, result?: any) => {
    self.postMessage({
      type: 'STAGE_COMPLETE',
      stageId: id,
      status,
      error,
      result
    });
  };

  // Safe Pause & Cancel check
  const checkState = async (stageId?: string, progress?: number, statusText?: string) => {
    if (isCancelled) {
      throw new Error("Cancelled");
    }
    while (isPaused) {
      if (stageId) {
        updateStage(stageId, progress || 0, "Đang tạm dừng (Analysis paused)...");
      }
      const pauseStart = Date.now();
      await new Promise(resolve => setTimeout(resolve, 100));
      pausedDuration += Date.now() - pauseStart;
      if (isCancelled) {
        throw new Error("Cancelled");
      }
    }
  };

  // Master Stage Results
  const stageResults: Record<string, any> = {};

  try {
    // ==========================================
    // STAGE 1: File Detection
    // ==========================================
    try {
      startStage('file_detect', 'Nhận diện tệp tin (File Detection)');
      await checkState('file_detect', 10, 'Đang phân tích thông số tệp...');

      const name = file.name || 'unnamed_file';
      const ext = name.split('.').pop()?.toLowerCase() || 'raw';
      
      // Automatic Depth Optimization for extremely large files
      let isDepthReduced = false;
      let maxScanLimit = size;
      let depthLimitInMB = 100;

      if (perfMode === 'lite') {
        depthLimitInMB = 5;
      } else if (perfMode === 'balanced') {
        depthLimitInMB = 30;
      } else if (perfMode === 'professional') {
        depthLimitInMB = 150;
      }

      const currentLimit = depthLimitInMB * 1024 * 1024;
      if (size > currentLimit) {
        isDepthReduced = true;
        maxScanLimit = currentLimit;
      }

      const fileDetails = {
        name,
        size,
        extension: ext,
        isDepthReduced,
        depthLimitInMB,
        maxScanLimit
      };
      
      stageResults['file_detect'] = fileDetails;
      completeStage('file_detect', isDepthReduced ? 'partial' : 'success', undefined, fileDetails);
    } catch (err: any) {
      completeStage('file_detect', 'failed', err.message);
      throw err; // Critical failure if we cannot even detect the file
    }

    const { maxScanLimit } = stageResults['file_detect'];

    // ==========================================
    // STAGE 2: Header Analysis
    // ==========================================
    let parsedResult: any = null;
    let headerBytes = new Uint8Array(0);
    try {
      startStage('header_analyze', 'Phân tích Header (Header Analysis)');
      await checkState('header_analyze', 10, 'Đang đọc khối nhị phân đầu...');

      const headerBlob = file.slice(0, Math.min(size, 65536));
      const headerBuffer = await headerBlob.arrayBuffer();
      headerBytes = new Uint8Array(headerBuffer);

      parsedResult = await runSmartParser(file, headerBytes);
      await checkState('header_analyze', 100, `Nhận dạng định dạng: ${parsedResult.formatName}`);

      stageResults['header_analyze'] = {
        formatName: parsedResult.formatName,
        mimeType: parsedResult.mimeType,
        isText: parsedResult.isText,
        detectedFeatures: parsedResult.detectedFeatures
      };
      completeStage('header_analyze', 'success', undefined, stageResults['header_analyze']);
    } catch (err: any) {
      stageResults['header_analyze'] = {
        formatName: 'Generic Binary File / RAW',
        mimeType: 'application/octet-stream',
        isText: false,
        detectedFeatures: { images: false, audio: false, video: false, text: false, tables: false, resources: false }
      };
      completeStage('header_analyze', 'failed', `Header parse error: ${err.message}. Chuyển sang quét thô.`);
    }

    // ==========================================
    // STAGE 3: Signature Detection
    // ==========================================
    try {
      startStage('sig_detect', 'Dấu hiệu nhị phân (Signature Detection)');
      await checkState('sig_detect', 30, 'Quét bảng chữ ký thông dụng...');

      const sigs = scanForSignatures(headerBytes);
      stageResults['sig_detect'] = { signatures: sigs };
      
      completeStage('sig_detect', sigs.length > 0 ? 'success' : 'partial', sigs.length === 0 ? 'Không tìm thấy chữ ký bổ sung' : undefined, sigs);
    } catch (err: any) {
      completeStage('sig_detect', 'failed', `Quét chữ ký gặp lỗi: ${err.message}`);
    }

    // ==========================================
    // STAGE 4: Structure Analysis
    // ==========================================
    const stringsList: StringEntry[] = [];
    try {
      startStage('struct_analyze', 'Cấu trúc & Chuỗi (Structure Analysis)');
      await checkState('struct_analyze', 10, 'Đang trích xuất phân vùng cấu trúc...');

      // Calculate dynamic minimum string length based on file size to filter out noise on heavy files
      let minLen = 4;
      if (size > 20 * 1024 * 1024) {
        minLen = 8; // High threshold for >20MB
      } else if (size > 5 * 1024 * 1024) {
        minLen = 6; // Moderate threshold for >5MB
      }

      // Strings extraction on file slices to keep memory extremely low
      const chunkSize = 1024 * 1024; // 1MB chunks
      let currentOffset = 0;
      const totalChunks = Math.ceil(maxScanLimit / chunkSize);
      let chunkCount = 0;
      let totalStringsFound = 0;

      while (currentOffset < maxScanLimit) {
        await checkState('struct_analyze', (chunkCount / totalChunks) * 100, `Trích xuất chuỗi (${totalStringsFound.toLocaleString()} chuỗi)...`);

        const end = Math.min(currentOffset + chunkSize, maxScanLimit);
        const chunkBlob = file.slice(currentOffset, end);
        const arrayBuffer = await chunkBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        chunkCount++;
        const foundInChunk: StringEntry[] = [];
        extractStringsFromBytes(bytes, currentOffset, foundInChunk, minLen);

        totalStringsFound += foundInChunk.length;

        // Keep memory low: limit active strings kept in worker memory
        const capLimit = perfMode === 'lite' ? 10000 : perfMode === 'balanced' ? 50000 : 150000;
        let batchToPost: StringEntry[] = [];
        if (stringsList.length < capLimit) {
          const sliceToPush = foundInChunk.slice(0, capLimit - stringsList.length);
          stringsList.push(...sliceToPush);
          batchToPost = sliceToPush;
        }

        currentOffset = end;

        // Release references to save memory immediately
        (bytes as any) = null;
        (arrayBuffer as any) = null;

        const now = Date.now();
        const elapsed = (now - startTime - pausedDuration) / 1000;
        const speed = elapsed > 0 ? (currentOffset / (1024 * 1024)) / elapsed : 0;

        // Post updates with strings batch to render progressively on-screen!
        updateStage('struct_analyze', (chunkCount / totalChunks) * 100, `Đang quét chuỗi (${totalStringsFound.toLocaleString()} chuỗi)`, {
          processedBytes: currentOffset,
          speed,
          percentage: (chunkCount / totalChunks) * 100,
          stringsBatch: batchToPost.map(s => ({
            offset: s.offset,
            value: s.value,
            length: s.length,
            type: s.type
          }))
        });

        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const parsedStructures = parsedResult?.structures || [];
      stageResults['struct_analyze'] = {
        structures: parsedStructures,
        strings: stringsList,
        totalStringsFound
      };
      
      completeStage('struct_analyze', 'success', undefined, {
        structuresCount: parsedStructures.length,
        stringsCount: totalStringsFound
      });
    } catch (err: any) {
      stageResults['struct_analyze'] = { structures: [], strings: [], totalStringsFound: 0 };
      completeStage('struct_analyze', 'failed', `Trích xuất cấu trúc gặp lỗi: ${err.message}`);
    }

    // ==========================================
    // STAGE 5: Hash Generation
    // ==========================================
    try {
      startStage('hash_gen', 'Mã băm an toàn (Hash Generation)');
      await checkState('hash_gen', 0, 'Đang băm SHA-256...');

      const sha = new SHA256();
      let hashOffset = 0;
      const hashChunkSize = 2 * 1024 * 1024; // 2MB chunking for super fast hash speed
      
      // Limit hash depth on massive files to avoid UI blocking if needed
      const hashLimit = perfMode === 'lite' ? Math.min(size, 15 * 1024 * 1024) :
                        perfMode === 'balanced' ? Math.min(size, 80 * 1024 * 1024) : size;
                        
      const totalHashChunks = Math.ceil(hashLimit / hashChunkSize);
      let hashChunkCount = 0;

      while (hashOffset < hashLimit) {
        await checkState('hash_gen', (hashChunkCount / totalHashChunks) * 100, 'Đang tính toán băm SHA-256...');

        const end = Math.min(hashOffset + hashChunkSize, hashLimit);
        const chunkBlob = file.slice(hashOffset, end);
        const arrayBuffer = await chunkBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        sha.update(bytes);

        hashChunkCount++;
        hashOffset = end;

        // Cleanup immediately
        (bytes as any) = null;
        (arrayBuffer as any) = null;

        const now = Date.now();
        const elapsed = (now - startTime - pausedDuration) / 1000;
        const speed = elapsed > 0 ? (hashOffset / (1024 * 1024)) / elapsed : 0;

        updateStage('hash_gen', (hashChunkCount / totalHashChunks) * 100, `Đang băm SHA-256...`, {
          processedBytes: hashOffset,
          speed,
          percentage: (hashChunkCount / totalHashChunks) * 100
        });

        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const sha256Hex = sha.digest();
      stageResults['hash_gen'] = { sha256: sha256Hex, isCapped: hashLimit < size };
      completeStage('hash_gen', hashLimit < size ? 'partial' : 'success', hashLimit < size ? 'Băm một phần tệp tin lớn' : undefined, { sha256: sha256Hex });
    } catch (err: any) {
      stageResults['hash_gen'] = { sha256: 'Unknown/Error', isCapped: false };
      completeStage('hash_gen', 'failed', `Lỗi tạo mã băm: ${err.message}`);
    }

    // ==========================================
    // STAGE 6: YARA Scan
    // ==========================================
    try {
      startStage('yara_scan', 'Rà soát chữ ký YARA (YARA Scan)');
      await checkState('yara_scan', 10, 'Đang phân tích bộ quy tắc bảo mật...');

      // Run extremely fast, non-blocking YARA evaluation against strings and headerBytes
      // Matches basic default signatures without re-scanning raw byte streams, highly responsive!
      const detectedYaraMatches: any[] = [];
      const keywords = stringsList.map(s => s.value.toLowerCase());

      // Helper function to evaluate rule matches
      const checkYaraMatch = (ruleName: string, author: string, desc: string, patterns: string[]) => {
        const matches = patterns.filter(p => keywords.some(k => k.includes(p.toLowerCase())));
        if (matches.length > 0) {
          detectedYaraMatches.push({
            ruleName,
            description: desc,
            author,
            confidence: matches.length === patterns.length ? 100 : Math.round((matches.length / patterns.length) * 100),
            matches: matches.map(m => ({
              ruleName,
              patternId: '$p',
              type: 'text',
              offset: 0,
              length: m.length,
              preview: m
            }))
          });
        }
      };

      checkYaraMatch('MaliciousWebshell', 'WebHexed Security', 'Độc hại: Phát hiện Webshell/Mã độc thực thi từ xa', ['eval($_POST', 'system($_GET', 'shell_exec', 'passthru']);
      checkYaraMatch('AndroidAPK', 'WebHexed Mobile', 'Cấu trúc tệp tin ứng dụng Android APK', ['AndroidManifest.xml', 'classes.dex']);
      checkYaraMatch('UnityAssetBundle', 'WebHexed Games', 'Gói dữ liệu đồ họa Unity Engine AssetBundle', ['UnityFS', 'assets/bin/Data']);

      stageResults['yara_scan'] = { yaraMatches: detectedYaraMatches };
      completeStage('yara_scan', detectedYaraMatches.length > 0 ? 'success' : 'success', undefined, detectedYaraMatches);
    } catch (err: any) {
      stageResults['yara_scan'] = { yaraMatches: [] };
      completeStage('yara_scan', 'failed', `Lỗi quét YARA: ${err.message}`);
    }

    // ==========================================
    // STAGE 7: Entropy Analysis
    // ==========================================
    try {
      startStage('entropy_analyze', 'Độ hỗn loạn Entropy (Entropy Analysis)');
      await checkState('entropy_analyze', 10, 'Tính toán mật độ dữ liệu...');

      // Optimized Entropy: use statistical sampling on files > 10MB to run in 5ms and avoid OOM
      const counts = new Uint32Array(256);
      let totalCounted = 0;

      if (size <= 10 * 1024 * 1024) {
        // Compute full entropy for smaller files
        const CHUNK_SIZE = 1024 * 1024;
        let offset = 0;
        while (offset < size) {
          await checkState('entropy_analyze', (offset / size) * 100, 'Đang tính toán mật độ byte...');
          const chunk = file.slice(offset, offset + CHUNK_SIZE);
          const buf = await chunk.arrayBuffer();
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i++) {
            counts[bytes[i]]++;
          }
          totalCounted += bytes.length;
          offset += CHUNK_SIZE;
        }
      } else {
        // Uniform sampling for large files: sample 150 blocks of 64KB across the file
        const numSamples = 150;
        const sampleSize = 65536;
        const step = Math.floor((size - sampleSize) / numSamples);

        for (let i = 0; i < numSamples; i++) {
          await checkState('entropy_analyze', (i / numSamples) * 100, 'Đang lấy mẫu mật độ byte...');
          const offset = i * step;
          const chunk = file.slice(offset, offset + sampleSize);
          const buf = await chunk.arrayBuffer();
          const bytes = new Uint8Array(buf);
          for (let j = 0; j < bytes.length; j++) {
            counts[bytes[j]]++;
          }
          totalCounted += bytes.length;
        }
      }

      // Compute Shannon Entropy
      let entropyValue = 0;
      if (totalCounted > 0) {
        for (let i = 0; i < 256; i++) {
          if (counts[i] > 0) {
            const p = counts[i] / totalCounted;
            entropyValue -= p * Math.log2(p);
          }
        }
      }

      stageResults['entropy_analyze'] = { entropy: entropyValue };
      completeStage('entropy_analyze', 'success', undefined, { entropy: entropyValue });
    } catch (err: any) {
      stageResults['entropy_analyze'] = { entropy: 4.0 };
      completeStage('entropy_analyze', 'failed', `Tính toán Entropy thất bại: ${err.message}`);
    }

    // ==========================================
    // STAGE 8: Metadata Extraction
    // ==========================================
    try {
      startStage('metadata_extract', 'Trích xuất Siêu dữ liệu (Metadata Extraction)');
      await checkState('metadata_extract', 10, 'Đọc siêu dữ liệu cấu trúc...');

      const baseMetadata = parsedResult?.metadata || [];
      const compiledMetadata = [
        { key: 'name', label: 'Tên tệp tin (File Name)', value: file.name, editable: false, offset: 0 },
        { key: 'size', label: 'Dung lượng (File Size)', value: `${(size / (1024 * 1024)).toFixed(3)} MB (${size.toLocaleString()} bytes)`, editable: false, offset: 0 },
        { key: 'modified', label: 'Ngày sửa đổi (Modified Date)', value: new Date(file.lastModified).toLocaleString('vi-VN'), editable: false, offset: 0 },
        { key: 'entropy', label: 'Độ hỗn loạn Entropy (Shannon)', value: (stageResults['entropy_analyze']?.entropy || 0).toFixed(4), editable: false, offset: 0 },
        { key: 'sha256', label: 'Mã băm SHA-256', value: stageResults['hash_gen']?.sha256 || 'N/A', editable: false, offset: 0 },
        ...baseMetadata.map((m: any) => ({ ...m, offset: 0 }))
      ];

      stageResults['metadata_extract'] = { metadata: compiledMetadata };
      completeStage('metadata_extract', 'success', undefined, compiledMetadata);
    } catch (err: any) {
      stageResults['metadata_extract'] = { metadata: [] };
      completeStage('metadata_extract', 'failed', `Lỗi trích xuất metadata: ${err.message}`);
    }

    // ==========================================
    // STAGE 9: Smart Edit Analysis
    // ==========================================
    try {
      startStage('smart_edit_analyze', 'Đánh giá Khả năng Sửa (Smart Edit Analysis)');
      await checkState('smart_edit_analyze', 20, 'Đánh giá khả năng sửa đổi...');

      const isEditableFormat = parsedResult && !parsedResult.isRawScanMode;
      const editableFields = isEditableFormat ? parsedResult.metadata.filter((m: any) => m.editable).length : 0;
      
      const smartEditInfo = {
        isEditableFormat,
        editableFields,
        mode: isEditableFormat ? 'Smart Structure Mode' : 'Raw Hex Patch Mode',
        warning: isEditableFormat ? undefined : 'Sử dụng Raw Hex Editor để thay đổi trực tiếp vùng byte nhị phân.'
      };

      stageResults['smart_edit_analyze'] = smartEditInfo;
      completeStage('smart_edit_analyze', 'success', undefined, smartEditInfo);
    } catch (err: any) {
      stageResults['smart_edit_analyze'] = { isEditableFormat: false, editableFields: 0, mode: 'Raw Hex Patch Mode' };
      completeStage('smart_edit_analyze', 'failed', `Lỗi kiểm tra Smart Edit: ${err.message}`);
    }

    // ==========================================
    // STAGE 10: Final Report
    // ==========================================
    startStage('final_report', 'Tổng hợp kết xuất (Final Report)');
    await checkState('final_report', 50, 'Đang biên dịch cấu trúc phân tích cuối...');

    const stringsMapped = stringsList.map(s => ({
      offset: s.offset,
      value: s.value,
      length: s.length,
      type: s.type as any
    }));

    // Construct perfect compatible AnalysisResult
    const finalResult = {
      fileType: parsedResult?.formatName || 'Generic Binary File / RAW',
      isText: parsedResult?.isText || false,
      textContent: parsedResult?.isText ? stringsList.slice(0, 100).map(s => s.value).join('\n') : '',
      detectedItems: {
        images: parsedResult?.detectedFeatures?.images || false,
        audio: parsedResult?.detectedFeatures?.audio || false,
        video: parsedResult?.detectedFeatures?.video || false,
        text: parsedResult?.isText || false,
        strings: stringsList.length > 0,
        metadata: true,
        dates: stringsList.some(s => s.value.includes('/')),
        urls: stringsList.some(s => s.type === 'url'),
        versions: true,
        header: true,
        footer: size > 512,
        dataBlocks: true,
        databases: parsedResult?.detectedFeatures?.tables || false,
        certificates: file.name.includes('cert') || stringsList.some(s => s.type === 'token'),
        unknownSections: false
      },
      strings: stringsMapped,
      metadata: stageResults['metadata_extract']?.metadata || [],
      structure: stageResults['struct_analyze']?.structures || [],
      embeddedItems: parsedResult?.embeddedItems || [],
      isRawScanMode: parsedResult?.isRawScanMode || false,
      rawScanWarning: parsedResult?.rawScanWarning || undefined,
      sha256: stageResults['hash_gen']?.sha256 || undefined,
      entropy: stageResults['entropy_analyze']?.entropy || undefined,
      yaraScan: stageResults['yara_scan']?.yaraMatches || []
    };

    completeStage('final_report', 'success', undefined, { success: true });

    // Send the final finished message with standard keys to prevent breaking existing components
    self.postMessage({
      type: 'DONE',
      result: finalResult,
      headerBytes
    });

  } catch (criticalErr: any) {
    self.postMessage({ type: 'ERROR', error: criticalErr.message });
  }
};

/**
 * Fast String Scan helper
 */
function extractStringsFromBytes(bytes: Uint8Array, baseOffset: number, results: StringEntry[], minLen: number = 4) {
  const decoder = new TextDecoder('ascii', { fatal: false });
  let start = -1;

  for (let i = 0; i < bytes.length; i++) {
    const charCode = bytes[i];
    const isPrintable = (charCode >= 0x20 && charCode <= 0x7E) || charCode === 0x09 || charCode === 0x0A || charCode === 0x0D;

    if (isPrintable) {
      if (start === -1) start = i;
    } else {
      if (start !== -1) {
        const length = i - start;
        if (length >= minLen) {
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
  }

  if (start !== -1) {
    const length = bytes.length - start;
    if (length >= minLen) {
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

function classifyString(str: string): string {
  const clean = str.trim();
  const lower = clean.toLowerCase();
  
  if (/@\w+\.\w+/.test(lower)) return 'email';
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.includes('://')) return 'url';
  if (lower.startsWith('{') && lower.endsWith('}')) return 'json';
  if (lower.startsWith('<') && lower.endsWith('>')) return 'xml';
  if (lower.includes('select ') && lower.includes(' from ')) return 'sql';
  if (lower.includes('insert into ') || lower.includes('create table ')) return 'sql';
  
  // IP address detection
  if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(clean)) return 'ip';
  
  // Shell / command line tools
  if (/\b(sudo|chmod|chown|curl|wget|rm -rf|mkdir|grep|cat|bash|sh|powershell|cmd\.exe)\b/.test(lower)) return 'shell';
  
  // API key / secret token / JWT
  if (lower.includes('api_key') || lower.includes('apikey') || lower.includes('secret_key') || lower.includes('jwt_token')) return 'api_key';
  if (/AIzaSy[A-Za-z0-9_-]{33}/.test(clean)) return 'api_key';
  if (/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/.test(clean)) return 'api_key'; // JWT
  
  // Path detection
  if ((lower.includes('/') || lower.includes('\\')) && lower.includes('.') && lower.length > 5) return 'path';
  
  return 'general';
}
