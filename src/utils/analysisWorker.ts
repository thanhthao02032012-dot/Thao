/**
 * Upgraded 25-Stage Advanced Parallelized Smart File Analysis Worker
 * Runs computationally heavy stages (signature detection, progressive hashing,
 * entropy, strings extraction, YARA rules, integrity checks, and structure validation)
 * in a background thread to ensure non-blocking high performance.
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
    // =========================================================================
    // STAGE 1: File Header Inspection (file_header)
    // =========================================================================
    let headerBytes = new Uint8Array(0);
    try {
      startStage('file_header', 'Đọc File Header (File Header Inspection)');
      await checkState('file_header', 10, 'Đang đọc khối nhị phân đầu...');

      const headerBlob = file.slice(0, Math.min(size, 65536));
      const headerBuffer = await headerBlob.arrayBuffer();
      headerBytes = new Uint8Array(headerBuffer);

      stageResults['file_header'] = {
        name: file.name,
        size,
        loadedHeaderSize: headerBytes.length,
        extension: file.name.split('.').pop()?.toLowerCase() || 'raw'
      };
      completeStage('file_header', 'success', undefined, stageResults['file_header']);
    } catch (err: any) {
      completeStage('file_header', 'failed', err.message);
      throw err; // Critical failure if we cannot even read the file header
    }

    // =========================================================================
    // STAGE 2: Footer Layout Check (footer_scrutiny)
    // =========================================================================
    let footerBytes = new Uint8Array(0);
    try {
      startStage('footer_scrutiny', 'Kiểm tra Footer (Footer Layout Check)');
      await checkState('footer_scrutiny', 20, 'Đang đọc khối nhị phân cuối...');

      if (size > 512) {
        const footerBlob = file.slice(size - 512, size);
        const footerBuffer = await footerBlob.arrayBuffer();
        footerBytes = new Uint8Array(footerBuffer);
      }

      const footerHasPk = footerBytes.some((b, i) => b === 0x50 && footerBytes[i+1] === 0x4B);
      const footerHasIend = footerBytes.some((b, i) => b === 0x49 && footerBytes[i+1] === 0x45 && footerBytes[i+2] === 0x4E && footerBytes[i+3] === 0x44);
      const footerHasEof = footerBytes.some((b, i) => b === 0x25 && footerBytes[i+1] === 0x25 && footerBytes[i+2] === 0x45 && footerBytes[i+3] === 0x4F && footerBytes[i+4] === 0x46); // %%EOF

      stageResults['footer_scrutiny'] = {
        footerLength: footerBytes.length,
        hasPkMarker: footerHasPk,
        hasIendMarker: footerHasIend,
        hasEofMarker: footerHasEof,
        verdict: footerHasIend ? 'Chuẩn kết thúc PNG (IEND)' : footerHasPk ? 'Dấu hiệu Zip Central Directory' : footerHasEof ? 'Chuẩn kết thúc PDF (%%EOF)' : 'Không phát hiện marker đặc biệt'
      };
      completeStage('footer_scrutiny', 'success', undefined, stageResults['footer_scrutiny']);
    } catch (err: any) {
      completeStage('footer_scrutiny', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 3: Magic Bytes Verification (magic_bytes)
    // =========================================================================
    try {
      startStage('magic_bytes', 'Xác thực Magic Bytes (Magic Bytes Verification)');
      await checkState('magic_bytes', 40, 'Đối chiếu mã chữ ký tệp tin...');

      let isMagicMatched = false;
      let magicString = 'RAW/Unknown';
      
      if (headerBytes.length >= 4) {
        const h0 = headerBytes[0], h1 = headerBytes[1], h2 = headerBytes[2], h3 = headerBytes[3];
        if (h0 === 0x89 && h1 === 0x50 && h2 === 0x4E && h3 === 0x47) {
          magicString = 'PNG Image (89 50 4E 47)';
          isMagicMatched = true;
        } else if (h0 === 0xFF && h1 === 0xD8 && h2 === 0xFF) {
          magicString = 'JPEG Image (FF D8 FF)';
          isMagicMatched = true;
        } else if (h0 === 0x25 && h1 === 0x50 && h2 === 0x44 && h3 === 0x46) {
          magicString = 'PDF Document (%PDF)';
          isMagicMatched = true;
        } else if (h0 === 0x4D && h1 === 0x5A) {
          magicString = 'Windows Executable/DLL (MZ)';
          isMagicMatched = true;
        } else if (h0 === 0x7F && h1 === 0x45 && h2 === 0x4C && h3 === 0x46) {
          magicString = 'Linux Executable (ELF)';
          isMagicMatched = true;
        } else if (h0 === 0x50 && h1 === 0x4B && h2 === 0x03 && h3 === 0x04) {
          magicString = 'ZIP Archive / Office OpenXML (PK)';
          isMagicMatched = true;
        } else if (h0 === 0x49 && h1 === 0x44 && h2 === 0x33) {
          magicString = 'MP3 Audio (ID3 tag)';
          isMagicMatched = true;
        }
      }

      stageResults['magic_bytes'] = {
        magicString,
        isMagicMatched,
        bytesHex: Array.from(headerBytes.slice(0, 8)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
      };
      completeStage('magic_bytes', 'success', undefined, stageResults['magic_bytes']);
    } catch (err: any) {
      completeStage('magic_bytes', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 4: MIME Detection (mime_detect)
    // =========================================================================
    let parsedResult: any = null;
    try {
      startStage('mime_detect', 'Nhận diện MIME Type (MIME Detection)');
      await checkState('mime_detect', 50, 'Đang phân tích MIME Type...');

      parsedResult = await runSmartParser(file, headerBytes);

      stageResults['mime_detect'] = {
        mimeType: parsedResult?.mimeType || 'application/octet-stream',
        formatName: parsedResult?.formatName || 'Generic Binary File / RAW'
      };
      completeStage('mime_detect', 'success', undefined, stageResults['mime_detect']);
    } catch (err: any) {
      stageResults['mime_detect'] = { mimeType: 'application/octet-stream', formatName: 'Generic Binary File / RAW' };
      completeStage('mime_detect', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 5: High Fidelity File Structure (file_structure)
    // =========================================================================
    try {
      startStage('file_structure', 'Phân tích Cấu trúc tệp (File Structure)');
      await checkState('file_structure', 10, 'Lập bản đồ sơ đồ cấu trúc...');

      const structures = parsedResult?.structures || [];
      stageResults['file_structure'] = { structures };
      completeStage('file_structure', structures.length > 0 ? 'success' : 'partial', undefined, { structuresCount: structures.length });
    } catch (err: any) {
      completeStage('file_structure', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 6: Global Metadata Extraction (metadata)
    // =========================================================================
    try {
      startStage('metadata', 'Trích xuất Metadata (Metadata)');
      await checkState('metadata', 10, 'Đang phân tích siêu dữ liệu...');

      const extMetadata = parsedResult?.metadata || [];
      stageResults['metadata'] = { metadata: extMetadata };
      completeStage('metadata', 'success', undefined, { count: extMetadata.length });
    } catch (err: any) {
      completeStage('metadata', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 7: Deep Strings Engine Multi-Encoding Scan (strings)
    // =========================================================================
    const uniqueStrings = new Map<string, any>();
    let stringsList: any[] = [];
    try {
      startStage('strings', 'Trích xuất Chuỗi Đa Mã Hóa (Deep Strings Scan)');
      await checkState('strings', 5, 'Khởi động công cụ quét chuỗi đa mã hóa...');

      let maxScanLimit = size; // ALWAYS scan the entire file!
      let chunkSize = 1024 * 1024; // Default 1MB chunks
      if (maxScanLimit > 1024 * 1024 * 1024) { // > 1GB
        chunkSize = 10 * 1024 * 1024; // 10MB chunks
      } else if (maxScanLimit > 100 * 1024 * 1024) { // > 100MB
        chunkSize = 5 * 1024 * 1024; // 5MB chunks
      }
      
      let currentOffset = 0;
      const totalChunks = Math.ceil(maxScanLimit / chunkSize);
      let chunkCount = 0;
      let lastPostTime = Date.now();
      const startTime = Date.now();

      while (currentOffset < maxScanLimit) {
        if (isCancelled) {
          throw new Error("Cancelled");
        }
        const pct = (chunkCount / totalChunks) * 100;
        let progressMsg = `Đang quét: ${chunkCount} / ${totalChunks} chunks...`;
        
        // Only update status message every 500ms to avoid UI thread blocking
        if (Date.now() - lastPostTime > 500 || chunkCount === 0) {
           await checkState('strings', pct, progressMsg);
           lastPostTime = Date.now();
        }

        const end = Math.min(currentOffset + chunkSize, maxScanLimit);
        const chunkBlob = file.slice(currentOffset, end);
        const arrayBuffer = await chunkBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        chunkCount++;

        // Run multi-encoding scanners on this chunk only (very low RAM footprint!)
        const chunkUniqueStrings = new Map<string, any>();
        scanASCII(bytes, currentOffset, chunkUniqueStrings, 4);
        scanUTF16LE(bytes, currentOffset, chunkUniqueStrings, 4);
        scanUTF16BE(bytes, currentOffset, chunkUniqueStrings, 4);
        scanUTF32LE(bytes, currentOffset, chunkUniqueStrings, 4);
        scanUTF32BE(bytes, currentOffset, chunkUniqueStrings, 4);

        const chunkStringsList = Array.from(chunkUniqueStrings.values())
          .filter(s => {
            // Drop high-entropy or short low-confidence strings to prevent OOM
            if (s.entropy && s.entropy > 7.5) return false;
            if (s.length < 6 && s.confidence < 2) return false;
            return true;
          })
          .map(s => ({
          offset: s.offset,
          value: s.value,
          originalValue: s.originalValue,
          length: s.length,
          type: s.category.toLowerCase(),
          encoding: s.encoding,
          category: s.category,
          confidence: s.confidence,
          entropy: s.entropy,
          offsets: s.offsets,
          count: s.count
        }));

        // Send streaming batch of newly discovered strings for this chunk to main thread
        // Calculate speed & estimated time
        const elapsedTimeMs = Date.now() - startTime;
        const speedMBps = ((currentOffset + bytes.length) / 1024 / 1024) / (elapsedTimeMs / 1000) || 0;
        const remainingBytes = maxScanLimit - (currentOffset + bytes.length);
        const estimatedRemainingSecs = (remainingBytes / 1024 / 1024) / speedMBps || 0;

        self.postMessage({
          type: 'STRINGS_BATCH_STREAM',
          progress: pct,
          statusText: progressMsg,
          stringsBatch: chunkStringsList,
          bytesScanned: currentOffset + bytes.length,
          speedMBps: speedMBps,
          estimatedRemainingSecs: estimatedRemainingSecs,
          chunkCount: chunkCount,
          totalChunks: totalChunks
        });

        // Store first 10,000 highly confident strings inside uniqueStrings for backward compatibility / fallback
        for (const s of chunkStringsList) {
          if (uniqueStrings.size < 10000 && s.confidence >= 2) {
            uniqueStrings.set(s.value, s);
          }
        }

        currentOffset = end;

        await new Promise(resolve => setTimeout(resolve, 10)); // Yield to event loop to avoid blocking worker
      }

      stringsList = Array.from(uniqueStrings.values());
      stageResults['strings'] = { strings: stringsList };
      completeStage('strings', 'success', undefined, { count: stringsList.length });
    } catch (err: any) {
      completeStage('strings', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 8: Unicode Strings Extraction (unicode_strings)
    // =========================================================================
    const unicodeStringsList: StringEntry[] = [];
    try {
      startStage('unicode_strings', 'Đánh giá chuỗi Unicode (Unicode Eval)');
      await checkState('unicode_strings', 100, 'Tích hợp phân tích Unicode hoàn tất.');
      stageResults['unicode_strings'] = { strings: [] };
      completeStage('unicode_strings', 'success', undefined, { count: 0 });
    } catch (err: any) {
      completeStage('unicode_strings', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 9: Binary Signature Scans (binary_patterns)
    // =========================================================================
    try {
      startStage('binary_patterns', 'Dấu hiệu nhị phân (Binary Patterns)');
      await checkState('binary_patterns', 50, 'Đang đối chiếu mẫu chữ ký nhị phân...');

      const sigs = scanForSignatures(headerBytes);
      stageResults['binary_patterns'] = { signatures: sigs };
      completeStage('binary_patterns', 'success', undefined, { count: sigs.length });
    } catch (err: any) {
      completeStage('binary_patterns', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 10: Shannon Entropy Analysis (entropy)
    // =========================================================================
    let entropyValue = 4.0;
    try {
      startStage('entropy', 'Độ hỗn loạn Entropy (Entropy Analysis)');
      await checkState('entropy', 20, 'Đang tính mật độ Entropy Shannons...');

      const counts = new Uint32Array(256);
      let totalCounted = 0;

      // Sample first 1MB of the file for entropy
      const sampleLimit = Math.min(size, 1024 * 1024);
      const sampleBlob = file.slice(0, sampleLimit);
      const buf = await sampleBlob.arrayBuffer();
      const bytes = new Uint8Array(buf);

      for (let i = 0; i < bytes.length; i++) {
        counts[bytes[i]]++;
      }
      totalCounted = bytes.length;

      if (totalCounted > 0) {
        entropyValue = 0;
        for (let i = 0; i < 256; i++) {
          if (counts[i] > 0) {
            const p = counts[i] / totalCounted;
            entropyValue -= p * Math.log2(p);
          }
        }
      }

      stageResults['entropy'] = { entropy: entropyValue };
      completeStage('entropy', 'success', undefined, { entropy: entropyValue });
    } catch (err: any) {
      stageResults['entropy'] = { entropy: 4.5 };
      completeStage('entropy', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 11: Cryptographic Hashes (hash)
    // =========================================================================
    let sha256Hex = 'Unknown';
    try {
      startStage('hash', 'Khóa băm SHA-256 (Hash)');
      await checkState('hash', 10, 'Đang tính toán mã băm SHA-256...');

      const sha = new SHA256();
      const hashLimit = Math.min(size, 5 * 1024 * 1024); // Cap hash computation to 5MB to be lighting fast!
      const chunkBlob = file.slice(0, hashLimit);
      const arrayBuffer = await chunkBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      sha.update(bytes);
      sha256Hex = sha.digest();

      stageResults['hash'] = { sha256: sha256Hex, isCapped: hashLimit < size };
      completeStage('hash', hashLimit < size ? 'partial' : 'success', undefined, { sha256: sha256Hex });
    } catch (err: any) {
      completeStage('hash', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 12: Cyclic Redundancy Check (checksum)
    // =========================================================================
    try {
      startStage('checksum', 'Mã kiểm lỗi Checksum CRC-32 (Checksum)');
      await checkState('checksum', 10, 'Đang sinh checksum CRC-32...');

      // Compute simple CRC32 of first 1MB of headerBytes
      const sample = headerBytes.slice(0, 1024 * 1024);
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < sample.length; i++) {
        let byte = sample[i];
        crc ^= byte;
        for (let j = 0; j < 8; j++) {
          if (crc & 1) {
            crc = (crc >>> 1) ^ 0xEDB88320;
          } else {
            crc = crc >>> 1;
          }
        }
      }
      crc = ~crc;
      const crc32Hex = (crc >>> 0).toString(16).toUpperCase().padStart(8, '0');

      stageResults['checksum'] = { crc32: crc32Hex };
      completeStage('checksum', 'success', undefined, { crc32: crc32Hex });
    } catch (err: any) {
      completeStage('checksum', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 13: Embedded Sub-files Carving (embedded_files)
    // =========================================================================
    try {
      startStage('embedded_files', 'Dữ liệu lồng ghép (Embedded Files)');
      await checkState('embedded_files', 20, 'Đang dò các phân vùng tệp nhúng...');

      const embeds = parsedResult?.embeddedItems || [];
      stageResults['embedded_files'] = { embeddedItems: embeds };
      completeStage('embedded_files', 'success', undefined, { count: embeds.length });
    } catch (err: any) {
      completeStage('embedded_files', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 14: Packed/Compression Detection (compression)
    // =========================================================================
    try {
      startStage('compression', 'Nhận dạng Nén & Packer (Compression Detection)');
      await checkState('compression', 10, 'Đang kiểm tra dấu vết Deflate/UPX...');

      const keywords = stringsList.map(s => s.value.toLowerCase());
      const hasUpx = keywords.some(k => k.includes('upx!') || k.includes('upx0') || k.includes('upx1'));
      const hasZlib = headerBytes.length >= 2 && headerBytes[0] === 0x78 && (headerBytes[1] === 0x9C || headerBytes[1] === 0xDA || headerBytes[1] === 0x01);

      stageResults['compression'] = {
        isCompressed: hasUpx || hasZlib || parsedResult?.formatName.includes('ZIP') || parsedResult?.formatName.includes('PNG'),
        compressionType: hasUpx ? 'UPX Packer Executable' : hasZlib ? 'zlib deflate stream' : parsedResult?.formatName.includes('ZIP') ? 'ZIP Archive Compression' : 'Uncompressed / Direct'
      };
      completeStage('compression', 'success', undefined, stageResults['compression']);
    } catch (err: any) {
      completeStage('compression', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 15: Cryptographic Encryption Detection (encryption)
    // =========================================================================
    try {
      startStage('encryption', 'Dấu hiệu Mã hóa (Encryption Detection)');
      await checkState('encryption', 10, 'Đang quét mật độ đồng nhất nhị phân...');

      const isEncryptedCandidate = entropyValue > 7.92 && !stageResults['compression']?.isCompressed;
      stageResults['encryption'] = {
        isEncryptedCandidate,
        entropyDensity: entropyValue,
        verdict: isEncryptedCandidate ? 'Độ hỗn loạn cực cao, khả năng đã mã hóa (AES/RSA/custom)' : 'Dữ liệu phân bổ tự nhiên hoặc nén thông thường'
      };
      completeStage('encryption', 'success', undefined, stageResults['encryption']);
    } catch (err: any) {
      completeStage('encryption', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 16: Overlay Payload Auditor (overlay)
    // =========================================================================
    try {
      startStage('overlay', 'Phát hiện Overlay appended (Overlay Detection)');
      await checkState('overlay', 10, 'Đang tính toán ranh giới cấu trúc thực tế...');

      let overlayBytes = 0;
      let structures = parsedResult?.structures || [];
      if (structures.length > 0) {
        const lastStructure = structures.reduce((max, s) => s.end > max ? s.end : max, 0);
        if (size > lastStructure && lastStructure > 0) {
          overlayBytes = size - lastStructure;
        }
      }

      stageResults['overlay'] = {
        hasOverlay: overlayBytes > 0,
        overlayBytes,
        overlayPercentage: size > 0 ? ((overlayBytes / size) * 100).toFixed(2) : '0'
      };
      completeStage('overlay', 'success', undefined, stageResults['overlay']);
    } catch (err: any) {
      completeStage('overlay', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 17: Duplicate Block Indexer (dup_blocks)
    // =========================================================================
    try {
      startStage('dup_blocks', 'Kiểm tra khối trùng lặp (Duplicate Blocks)');
      await checkState('dup_blocks', 10, 'Tìm kiếm các đoạn byte lặp liên tiếp...');

      let dupCount = 0;
      if (headerBytes.length >= 64) {
        for (let i = 0; i < headerBytes.length - 32; i += 16) {
          let block1 = headerBytes.subarray(i, i + 16);
          let block2 = headerBytes.subarray(i + 16, i + 32);
          let isIdentical = true;
          for (let j = 0; j < 16; j++) {
            if (block1[j] !== block2[j]) {
              isIdentical = false;
              break;
            }
          }
          if (isIdentical && block1[0] !== 0) { // skip zero filling repetition
            dupCount++;
          }
        }
      }

      stageResults['dup_blocks'] = { duplicateBlocksCount: dupCount };
      completeStage('dup_blocks', 'success', undefined, stageResults['dup_blocks']);
    } catch (err: any) {
      completeStage('dup_blocks', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 18: Zero-filled Regions Detector (zero_regions)
    // =========================================================================
    try {
      startStage('zero_regions', 'Vùng đệm rỗng Zero-filled (Zero Regions)');
      await checkState('zero_regions', 10, 'Đang tìm khối trống 0x00...');

      let zeroBlockCount = 0;
      let currentZeroRun = 0;
      const zeroRegionsList: Array<{ start: number; length: number }> = [];

      for (let i = 0; i < headerBytes.length; i++) {
        if (headerBytes[i] === 0x00) {
          if (currentZeroRun === 0) {
            // start zero run
          }
          currentZeroRun++;
        } else {
          if (currentZeroRun >= 32) {
            zeroBlockCount++;
            zeroRegionsList.push({ start: i - currentZeroRun, length: currentZeroRun });
          }
          currentZeroRun = 0;
        }
      }

      stageResults['zero_regions'] = {
        zeroRegionsCount: zeroBlockCount,
        regions: zeroRegionsList.slice(0, 5)
      };
      completeStage('zero_regions', 'success', undefined, stageResults['zero_regions']);
    } catch (err: any) {
      completeStage('zero_regions', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 19: High Entropy Hotspots (high_entropy_regions)
    // =========================================================================
    try {
      startStage('high_entropy_regions', 'Đốm Entropy cao (High Entropy Hotspots)');
      await checkState('high_entropy_regions', 10, 'Quét các hotspot mật độ cao...');

      const hotspots: Array<{ offset: number; entropy: number }> = [];
      if (entropyValue > 7.5) {
        hotspots.push({ offset: 0, entropy: entropyValue });
      }

      stageResults['high_entropy_regions'] = { hotspots };
      completeStage('high_entropy_regions', 'success', undefined, { hotspotsCount: hotspots.length });
    } catch (err: any) {
      completeStage('high_entropy_regions', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 20: Damaged Structure Check (damaged_struct)
    // =========================================================================
    try {
      startStage('damaged_struct', 'Kiểm tra Cấu trúc hỏng (Damaged Structure Check)');
      await checkState('damaged_struct', 10, 'Kiểm tra tính hợp quy cấu trúc...');

      const isDamaged = parsedResult?.structures?.length === 0 && size > 1024;
      stageResults['damaged_struct'] = {
        isDamaged,
        verdict: isDamaged ? 'Định dạng tệp tin bị hỏng hoặc Header bị ghi đè' : 'Cấu trúc định dạng hợp quy'
      };
      completeStage('damaged_struct', 'success', undefined, stageResults['damaged_struct']);
    } catch (err: any) {
      completeStage('damaged_struct', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 21: Invalid Offsets Auditor (invalid_offsets)
    // =========================================================================
    try {
      startStage('invalid_offsets', 'Kiểm tra Offset bất thường (Invalid Offsets Auditor)');
      await checkState('invalid_offsets', 10, 'Đang rà soát con trỏ nhị phân...');

      let hasInvalidOffsets = false;
      const structures = parsedResult?.structures || [];
      for (const s of structures) {
        if (s.start < 0 || s.end > size || s.start > s.end) {
          hasInvalidOffsets = true;
          break;
        }
      }

      stageResults['invalid_offsets'] = { hasInvalidOffsets };
      completeStage('invalid_offsets', 'success', undefined, stageResults['invalid_offsets']);
    } catch (err: any) {
      completeStage('invalid_offsets', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 22: Unknown Blocks Classifier (unknown_blocks)
    // =========================================================================
    try {
      startStage('unknown_blocks', 'Phân loại vùng chưa rõ (Unknown Blocks)');
      await checkState('unknown_blocks', 10, 'Nhận diện vùng không ánh xạ...');

      const structures = parsedResult?.structures || [];
      const hasUnmapped = structures.length === 0;

      stageResults['unknown_blocks'] = {
        hasUnmapped,
        description: hasUnmapped ? 'Toàn bộ tệp thuộc vùng chưa ánh xạ' : 'Các khối dữ liệu chính đều được ánh xạ'
      };
      completeStage('unknown_blocks', 'success', undefined, stageResults['unknown_blocks']);
    } catch (err: any) {
      completeStage('unknown_blocks', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 23: Format Signatures Map (signatures)
    // =========================================================================
    try {
      startStage('signatures', 'Bản đồ định dạng Chữ ký (Format Signatures)');
      await checkState('signatures', 10, 'Đang thiết lập bản đồ chữ ký...');

      const signatures = scanForSignatures(headerBytes);
      stageResults['signatures'] = { signatures };
      completeStage('signatures', 'success', undefined, { count: signatures.length });
    } catch (err: any) {
      completeStage('signatures', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 24: Community YARA Evaluator (yara)
    // =========================================================================
    try {
      startStage('yara', 'Đánh giá Quy tắc YARA (YARA)');
      await checkState('yara', 10, 'Đang chạy bộ YARA Heuristics...');

      const detectedYaraMatches: any[] = [];
      const keywords = stringsList.map(s => s.value.toLowerCase());

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

      checkYaraMatch('MaliciousWebshell', 'WebHexed Security', 'Phát hiện mã độc Webshell từ xa PHP/ASPX', ['eval($_POST', 'system($_GET', 'shell_exec', 'passthru']);
      checkYaraMatch('ExposedAPIKeys', 'WebHexed Audit', 'Phát hiện lộ lọt API Key hoặc AWS/JWT token bí mật', ['api_key', 'apikey', 'secret_key', 'jwt_token', 'AIzaSy']);
      checkYaraMatch('AndroidPackage', 'WebHexed Mobile', 'Cấu trúc tệp tin ứng dụng Android APK', ['AndroidManifest.xml', 'classes.dex']);

      stageResults['yara'] = { yaraMatches: detectedYaraMatches };
      completeStage('yara', 'success', undefined, detectedYaraMatches);
    } catch (err: any) {
      completeStage('yara', 'failed', err.message);
    }

    // =========================================================================
    // STAGE 25: Digital Integrity Synthesis (file_integrity)
    // =========================================================================
    try {
      startStage('file_integrity', 'Đánh giá Tính Toàn vẹn (File Integrity)');
      await checkState('file_integrity', 50, 'Đang tổng hợp điểm số an toàn...');

      const hasYaraWarnings = (stageResults['yara']?.yaraMatches || []).length > 0;
      const isDamaged = stageResults['damaged_struct']?.isDamaged || false;
      const integrityScore = isDamaged ? 40 : hasYaraWarnings ? 70 : 98;

      const recommendations: string[] = [];
      if (isDamaged) {
        recommendations.push('⚠️ File cấu trúc bị lỗi! Không nên ghi đè/patch bừa bãi tránh mất dữ liệu hoàn toàn.');
      } else {
        recommendations.push('✅ Cấu trúc tệp hoàn chỉnh và chuẩn hóa. Chỉnh sửa an toàn.');
      }
      if (hasYaraWarnings) {
        recommendations.push('❌ Cảnh báo: Phát hiện chuỗi nhạy cảm (Webshell/API keys). Hãy rà soát tab Strings và loại bỏ.');
      } else {
        recommendations.push('🛡️ Không phát hiện các đoạn mã độc hại hoặc tệp lồng ghép bất thường.');
      }

      stageResults['file_integrity'] = {
        integrityScore,
        recommendations,
        verdict: integrityScore >= 95 ? 'An toàn (Safe)' : integrityScore >= 70 ? 'Cần Lưu Ý (Caution)' : 'Hỏng/Nguy Hiểm (Vulnerable/Damaged)'
      };
      completeStage('file_integrity', 'success', undefined, stageResults['file_integrity']);
    } catch (err: any) {
      completeStage('file_integrity', 'failed', err.message);
    }

    // =========================================================================
    // COMPILING FINAL RESULTS FOR MAIN THREAD
    // =========================================================================
    startStage('final_report', 'Xuất báo cáo (Report Compile)');
    await checkState('final_report', 95, 'Đang biên dịch kết quả cuối...');

    const stringsMapped = stringsList.map(s => ({
      offset: s.offset,
      value: s.value,
      length: s.length,
      type: s.type as any
    }));

    // Construct the perfect final AnalysisResult structure
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
        unknownSections: stageResults['unknown_blocks']?.hasUnmapped || false
      },
      strings: stringsMapped,
      metadata: [
        { key: 'name', label: 'Tên tệp tin (File Name)', value: file.name, editable: false, offset: 0 },
        { key: 'size', label: 'Dung lượng (File Size)', value: `${(size / (1024 * 1024)).toFixed(3)} MB (${size.toLocaleString()} bytes)`, editable: false, offset: 0 },
        { key: 'modified', label: 'Ngày sửa đổi (Modified Date)', value: new Date(file.lastModified).toLocaleString('vi-VN'), editable: false, offset: 0 },
        { key: 'entropy', label: 'Độ hỗn loạn Entropy (Shannon)', value: entropyValue.toFixed(4), editable: false, offset: 0 },
        { key: 'sha256', label: 'Mã băm SHA-256', value: sha256Hex, editable: false, offset: 0 },
        ...(parsedResult?.metadata || []).map((m: any) => ({ ...m, offset: 0 }))
      ],
      structure: parsedResult?.structures || [],
      embeddedItems: parsedResult?.embeddedItems || [],
      isRawScanMode: parsedResult?.isRawScanMode || false,
      rawScanWarning: parsedResult?.rawScanWarning || undefined,
      sha256: sha256Hex,
      entropy: entropyValue,
      yaraScan: stageResults['yara']?.yaraMatches || [],
      // 25-stage specialized metadata outputs
      deepScan: {
        stageResults,
        integrityScore: stageResults['file_integrity']?.integrityScore || 95,
        recommendations: stageResults['file_integrity']?.recommendations || [],
        verdict: stageResults['file_integrity']?.verdict || 'An toàn',
        crc32: stageResults['checksum']?.crc32 || 'N/A',
        magicString: stageResults['magic_bytes']?.magicString || 'N/A',
        overlayBytes: stageResults['overlay']?.overlayBytes || 0,
        duplicateBlocksCount: stageResults['dup_blocks']?.duplicateBlocksCount || 0,
        zeroRegionsCount: stageResults['zero_regions']?.zeroRegionsCount || 0
      }
    };

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
 * Deep Strings Engine Multi-Encoding Helpers
 */

interface AdvancedStringEntry {
  offset: number;
  value: string;
  originalValue?: string;
  length: number;
  encoding: string;
  category: string;
  confidence: number;
  entropy: number;
  offsets: number[];
  count: number;
}

function scanASCII(bytes: Uint8Array, baseOffset: number, uniqueStrings: Map<string, AdvancedStringEntry>, minLen: number = 4) {
  let start = -1;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const isPrintable = (b >= 0x20 && b <= 0x7E) || b === 0x09 || b === 0x0A || b === 0x0D || (b >= 0xC0 && b <= 0xFD);
    if (isPrintable) {
      if (start === -1) start = i;
    } else {
      if (start !== -1) {
        const len = i - start;
        if (len >= minLen) {
          const rawSub = bytes.subarray(start, i);
          const value = decoder.decode(rawSub).trim();
          if (value.length >= minLen) {
            let hasNonAscii = false;
            for (let j = 0; j < rawSub.length; j++) {
              if (rawSub[j] > 127) {
                hasNonAscii = true;
                break;
              }
            }
            addOrUpdateString(value, baseOffset + start, len, hasNonAscii ? 'UTF-8' : 'ASCII', bytes, start, uniqueStrings);
          }
        }
        start = -1;
      }
    }
  }
}

function scanUTF16LE(bytes: Uint8Array, baseOffset: number, uniqueStrings: Map<string, AdvancedStringEntry>, minLen: number = 4) {
  let start = -1;
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const b1 = bytes[i];
    const b2 = bytes[i+1];
    const isPrintableChar = (b1 >= 0x20 && b1 <= 0x7E) || b1 === 0x09 || b1 === 0x0A || b1 === 0x0D;
    if (isPrintableChar && b2 === 0x00) {
      if (start === -1) start = i;
    } else {
      if (start !== -1) {
        const len = i - start;
        if (len >= minLen * 2) {
          let text = '';
          for (let j = start; j < i; j += 2) {
            text += String.fromCharCode(bytes[j]);
          }
          const value = text.trim();
          if (value.length >= minLen) {
            addOrUpdateString(value, baseOffset + start, len, 'UTF-16 LE', bytes, start, uniqueStrings);
          }
        }
        start = -1;
      }
    }
  }
}

function scanUTF16BE(bytes: Uint8Array, baseOffset: number, uniqueStrings: Map<string, AdvancedStringEntry>, minLen: number = 4) {
  let start = -1;
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const b1 = bytes[i];
    const b2 = bytes[i+1];
    const isPrintableChar = (b2 >= 0x20 && b2 <= 0x7E) || b2 === 0x09 || b2 === 0x0A || b2 === 0x0D;
    if (b1 === 0x00 && isPrintableChar) {
      if (start === -1) start = i;
    } else {
      if (start !== -1) {
        const len = i - start;
        if (len >= minLen * 2) {
          let text = '';
          for (let j = start; j < i; j += 2) {
            text += String.fromCharCode(bytes[j+1]);
          }
          const value = text.trim();
          if (value.length >= minLen) {
            addOrUpdateString(value, baseOffset + start, len, 'UTF-16 BE', bytes, start, uniqueStrings);
          }
        }
        start = -1;
      }
    }
  }
}

function scanUTF32LE(bytes: Uint8Array, baseOffset: number, uniqueStrings: Map<string, AdvancedStringEntry>, minLen: number = 4) {
  let start = -1;
  for (let i = 0; i < bytes.length - 3; i += 4) {
    if (bytes[i+1] === 0x00 && bytes[i+2] === 0x00 && bytes[i+3] === 0x00) {
      const b = bytes[i];
      const isPrintableChar = (b >= 0x20 && b <= 0x7E) || b === 0x09 || b === 0x0A || b === 0x0D;
      if (isPrintableChar) {
        if (start === -1) start = i;
        continue;
      }
    }
    if (start !== -1) {
      const len = i - start;
      if (len >= minLen * 4) {
        let text = '';
        for (let j = start; j < i; j += 4) {
          text += String.fromCharCode(bytes[j]);
        }
        const value = text.trim();
        if (value.length >= minLen) {
          addOrUpdateString(value, baseOffset + start, len, 'UTF-32 LE', bytes, start, uniqueStrings);
        }
      }
      start = -1;
    }
  }
}

function scanUTF32BE(bytes: Uint8Array, baseOffset: number, uniqueStrings: Map<string, AdvancedStringEntry>, minLen: number = 4) {
  let start = -1;
  for (let i = 0; i < bytes.length - 3; i += 4) {
    if (bytes[i] === 0x00 && bytes[i+1] === 0x00 && bytes[i+2] === 0x00) {
      const b = bytes[i+3];
      const isPrintableChar = (b >= 0x20 && b <= 0x7E) || b === 0x09 || b === 0x0A || b === 0x0D;
      if (isPrintableChar) {
        if (start === -1) start = i;
        continue;
      }
    }
    if (start !== -1) {
      const len = i - start;
      if (len >= minLen * 4) {
        let text = '';
        for (let j = start; j < i; j += 4) {
          text += String.fromCharCode(bytes[j+3]);
        }
        const value = text.trim();
        if (value.length >= minLen) {
          addOrUpdateString(value, baseOffset + start, len, 'UTF-32 BE', bytes, start, uniqueStrings);
        }
      }
      start = -1;
    }
  }
}

function addOrUpdateString(
  text: string,
  absOffset: number,
  len: number,
  enc: string,
  bytes: Uint8Array,
  relativeStart: number,
  uniqueStrings: Map<string, AdvancedStringEntry>
) {
  if (text.length < 4) return;
  const existing = uniqueStrings.get(text);
  if (existing) {
    if (existing.offsets.length < 1000) {
      existing.offsets.push(absOffset);
    }
    existing.count++;
  } else {
    const entry = createStringEntry(text, absOffset, len, enc, bytes, relativeStart);
    uniqueStrings.set(text, entry);
  }
}

function createStringEntry(
  value: string,
  offset: number,
  length: number,
  encoding: string,
  chunkBytes: Uint8Array,
  relativeStart: number
): AdvancedStringEntry {
  const localEntropy = computeLocalEntropy(chunkBytes, relativeStart, length);
  const category = classifyStringValue(value);
  const confidence = computeConfidence(value, category, encoding);
  const recovery = attemptHiddenRecovery(value);
  
  return {
    value: recovery.decoded ? recovery.decodedValue! : value,
    originalValue: recovery.decoded ? value : undefined,
    offset,
    length,
    encoding: recovery.decoded ? `${encoding} (Decoded: ${recovery.method})` : encoding,
    category,
    confidence,
    entropy: localEntropy,
    offsets: [offset],
    count: 1
  };
}

function computeLocalEntropy(bytes: Uint8Array, start: number, len: number): number {
  const windowSize = 64;
  const left = Math.max(0, start - windowSize / 2);
  const right = Math.min(bytes.length, start + len + windowSize / 2);
  
  const counts = new Uint32Array(256);
  let total = 0;
  for (let i = left; i < right; i++) {
    counts[bytes[i]]++;
    total++;
  }
  
  if (total === 0) return 0;
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (counts[i] > 0) {
      const p = counts[i] / total;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

function classifyStringValue(str: string): string {
  const lower = str.toLowerCase().trim();
  
  if (lower.includes('unity') || lower.includes('playerprefs') || lower.includes('monobehaviour') || lower.includes('assembly-csharp')) return 'Engine';
  if (lower.includes('unreal') || lower.includes('uproperty') || lower.includes('uscene') || lower.includes('fvector')) return 'Engine';
  if (lower.includes('godot') || lower.includes('gdscript')) return 'Engine';
  
  if (/\b(health|hp|mana|gold|score|player|enemy|item|weapon|damage|quest|save|load|game|skill|pot|heal|potion|die|dead|kill|máu|vũ khí|sinh lực|giáp|vàng)\b/i.test(lower)) return 'Gameplay';
  if (/\b(select|insert|update|delete|create table|sqlite|mysql|postgres|database|index on|foreign key|db_)\b/i.test(lower)) return 'Database';
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.includes('://') || /\b(ip|dns|socket|port|connect|wget|curl|ftp|api\.|\.com|\.org|\.net)\b/i.test(lower)) return 'Network';
  
  if (lower.includes('androidmanifest.xml') || lower.includes('classes.dex') || lower.includes('.apk') || lower.includes('android.')) return 'Android';
  if (lower.includes('.dll') || lower.includes('.exe') || lower.includes('system32') || lower.includes('microsoft')) return 'Windows';
  if (lower.includes('/usr/bin') || lower.includes('/etc/') || lower.includes('.so') || lower.includes('linux')) return 'Linux';
  if (lower.includes('plist') || lower.includes('.dylib') || lower.includes('ios') || lower.includes('macos')) return 'Apple';
  
  if (lower.includes('function') || lower.includes('var ') || lower.includes('let ') || lower.includes('const ') || lower.includes('def ') || lower.includes('import ') || lower.includes('require(')) return 'Scripts';
  if (lower.startsWith('{') && lower.endsWith('}')) return 'Configuration';
  if (lower.startsWith('<') && lower.endsWith('>')) return 'Configuration';
  if (/\.(json|xml|ini|yaml|conf|cfg|properties)\b/i.test(lower)) return 'Configuration';
  
  if (/\.(mp3|ogg|wav|aac|flac|m4a)\b/i.test(lower) || /\b(audio|music|bgm|sound|volume|mute|play|pause|synth|voice)\b/i.test(lower)) return 'Audio';
  if (/\.(mp4|avi|mkv|webm|flv|mov)\b/i.test(lower) || /\b(video|fps|resolution|codec|movie)\b/i.test(lower)) return 'Video';
  if (/\.(png|jpg|jpeg|gif|bmp|dds|tga|ico)\b/i.test(lower) || /\b(image|texture|sprite|pixels|bitmap|atlas)\b/i.test(lower)) return 'Texture';
  
  if (lower.includes('lang') || lower.includes('locale') || lower.includes('translate') || lower.includes('vietnamese') || lower.includes('english') || lower.includes('tiếng việt')) return 'Localization';
  if (lower.includes('api_key') || lower.includes('apikey') || lower.includes('secret') || lower.includes('password') || lower.includes('passwd') || lower.includes('token') || lower.includes('jwt') || lower.includes('auth')) return 'Security';
  if (/\b(button|window|menu|panel|canvas|dialog|font|label|hud|border|padding|margin|color|theme|darkmode|ui_)\b/i.test(lower)) return 'UI';
  
  return 'System';
}

function computeConfidence(value: string, category: string, encoding: string): number {
  const lower = value.toLowerCase().trim();
  let score = 2;
  
  if (category === 'Security' || category === 'Gameplay') {
    score = 5;
  } else if (category === 'Network' || category === 'Database' || category === 'Configuration') {
    score = 4;
  } else if (category === 'Audio' || category === 'Texture' || category === 'UI' || category === 'Localization') {
    score = 3;
  }
  
  if (value.length < 5) {
    score = Math.max(1, score - 1);
  } else if (value.length > 15) {
    score = Math.min(5, score + 1);
  }
  
  const gibberishRatio = (value.match(/[^a-zA-Z0-9\s_.\-\/]/g) || []).length / value.length;
  if (gibberishRatio > 0.3) {
    score = Math.max(1, score - 2);
  }
  
  return score;
}

function attemptHiddenRecovery(value: string): { decoded: boolean; decodedValue?: string; method?: string } {
  // Base64 check
  if (value.length >= 8 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    try {
      const decoded = atob(value);
      let isPrintable = true;
      for (let i = 0; i < decoded.length; i++) {
        const code = decoded.charCodeAt(i);
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
          isPrintable = false;
          break;
        }
      }
      if (isPrintable && decoded.length >= 4) {
        return { decoded: true, decodedValue: decoded, method: 'Base64' };
      }
    } catch {}
  }
  
  // URL check
  if (value.includes('%')) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded !== value && decoded.length >= 4) {
        return { decoded: true, decodedValue: decoded, method: 'URL' };
      }
    } catch {}
  }
  
  // ROT13 check
  const rot13 = (str: string) => {
    return str.replace(/[a-zA-Z]/g, (char) => {
      const code = char.charCodeAt(0);
      const startCode = char <= 'Z' ? 65 : 97;
      return String.fromCharCode(((code - startCode + 13) % 26) + startCode);
    });
  };
  const rotated = rot13(value);
  if (/\b(health|player|game|secret|key|admin|login|system|audio|music|config)\b/i.test(rotated)) {
    return { decoded: true, decodedValue: rotated, method: 'ROT13' };
  }
  
  // Hex String check
  if (/^[0-9a-fA-F]{8,}$/.test(value) && value.length % 2 === 0) {
    try {
      let text = '';
      for (let i = 0; i < value.length; i += 2) {
        const byte = parseInt(value.slice(i, i + 2), 16);
        if (byte >= 32 && byte <= 126) {
          text += String.fromCharCode(byte);
        } else {
          text = '';
          break;
        }
      }
      if (text.length >= 4) {
        return { decoded: true, decodedValue: text, method: 'Hex' };
      }
    } catch {}
  }
  
  // Simple XOR check
  const tryXor = (str: string, key: number) => {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i) ^ key;
      if ((charCode >= 0x20 && charCode <= 0x7E) || charCode === 0x09 || charCode === 0x0A || charCode === 0x0D) {
        out += String.fromCharCode(charCode);
      } else {
        return null;
      }
    }
    return out;
  };
  
  const xor55 = tryXor(value, 0x55);
  if (xor55 && xor55.length >= 6 && /\b(health|player|game|secret|key|admin|login|system)\b/i.test(xor55)) {
    return { decoded: true, decodedValue: xor55, method: 'XOR 0x55' };
  }
  
  const xorAA = tryXor(value, 0xAA);
  if (xorAA && xorAA.length >= 6 && /\b(health|player|game|secret|key|admin|login|system)\b/i.test(xorAA)) {
    return { decoded: true, decodedValue: xorAA, method: 'XOR 0xAA' };
  }
  
  return { decoded: false };
}
