/**
 * Progressive Smart Analyze Engine & Deep Scan Parser
 * Handles non-blocking background chunk scanning, deep asset detection,
 * universal metadata mining, and structural alignment checking.
 */

import { runSmartParser, ParserResult, ParsedStructure, ParsedItem } from './fileParsers';

export interface AnalysisResult {
  fileType: string;
  isText: boolean;
  textContent: string;
  detectedItems: {
    images: boolean;
    audio: boolean;
    video: boolean;
    text: boolean;
    strings: boolean;
    metadata: boolean;
    dates: boolean;
    urls: boolean;
    versions: boolean;
    header: boolean;
    footer: boolean;
    dataBlocks: boolean;
    databases: boolean;
    certificates: boolean;
    unknownSections: boolean;
  };
  strings: Array<{
    offset: number;
    value: string;
    length: number;
    type: 'url' | 'email' | 'json' | 'xml' | 'lua' | 'java' | 'kotlin' | 'swift' | 'unity' | 'unreal' | 'flutter' | 'react' | 'sql' | 'password' | 'token' | 'api_key' | 'package' | 'domain' | 'general';
  }>;
  metadata: Array<{
    key: string;
    label: string;
    value: string;
    editable: boolean;
    offset: number;
  }>;
  structure: Array<{
    name: string;
    start: number;
    end: number;
    type: 'header' | 'metadata' | 'data' | 'footer' | 'index' | 'marker';
    description: string;
  }>;
  embeddedItems: Array<{
    id: string;
    name: string;
    type: 'image' | 'audio' | 'video' | 'text' | 'document' | 'structure' | 'database' | 'compressed';
    offset: number;
    size: number;
    details?: string;
  }>;
  isRawScanMode?: boolean;
  rawScanWarning?: string;
}

/**
 * Safely decodes text from a byte array
 */
function decodeString(bytes: Uint8Array, start: number, length: number): string {
  try {
    const sub = bytes.subarray(start, start + length);
    return new TextDecoder('utf-8').decode(sub);
  } catch {
    let s = '';
    for (let i = 0; i < length; i++) {
      const b = bytes[start + i];
      if (b >= 32 && b <= 126) s += String.fromCharCode(b);
    }
    return s;
  }
}

/**
 * Classifies extracted strings into rich categories for development tools
 */
export function classifyString(str: string): AnalysisResult['strings'][0]['type'] {
  const clean = str.trim().toLowerCase();
  
  if (/@\w+\.\w+/.test(clean)) return 'email';
  if (clean.includes('http://') || clean.includes('https://')) return 'url';
  if (clean.startsWith('{') && clean.endsWith('}')) return 'json';
  if (clean.startsWith('<') && clean.endsWith('>')) return 'xml';
  if (clean.includes('local ') && clean.includes('function')) return 'lua';
  if (clean.includes('public class ') || clean.includes('import java.')) return 'java';
  if (clean.includes('fun ') || clean.includes('val ') || clean.includes('var ')) return 'kotlin';
  if (clean.includes('func ') || clean.includes('let ') || clean.includes('@state')) return 'swift';
  if (clean.includes('unity') || clean.includes('playerprefs') || clean.includes('mono.')) return 'unity';
  if (clean.includes('unreal') || clean.includes('uproperty') || clean.includes('uscene')) return 'unreal';
  if (clean.includes('widget') || clean.includes('statefulwidget') || clean.includes('dart:')) return 'flutter';
  if (clean.includes('react') || clean.includes('useeffect') || clean.includes('usestate')) return 'react';
  if (clean.includes('select ') || clean.includes('insert into') || clean.includes('create table')) return 'sql';
  if (clean.includes('password') || clean.includes('passwd') || clean.includes('secret')) return 'password';
  if (clean.includes('bearer ') || clean.includes('token=') || /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(str)) return 'token';
  if (clean.includes('api_key') || clean.includes('apikey') || /AIzaSy[A-Za-z0-9_-]{33}/.test(str)) return 'api_key';
  if (/^com\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+/.test(clean)) return 'package';
  if (/\b[a-zA-Z0-9-]+\.[a-z]{2,6}\b/.test(clean)) return 'domain';
  
  return 'general';
}

/**
 * Analysis Worker Manager
 */
export function startAnalysisWorker(
  file: File,
  onProgress: (progress: number, status: string, metrics?: any) => void,
  onResult: (result: AnalysisResult) => void,
  onError: (error: string) => void,
  perfMode: 'lite' | 'balanced' | 'professional' = 'balanced'
) {
  const worker = new Worker(new URL('./analysisWorker.ts', import.meta.url), { type: 'module' });
  
  worker.onmessage = async (e) => {
    const data = e.data;
    
    if (data.type === 'STAGE_START') {
      onProgress(0, data.stageName, {
        stageId: data.stageId,
        stageName: data.stageName,
        stageEvent: 'start'
      });
    } else if (data.type === 'STAGE_UPDATE') {
      onProgress(data.progress, data.statusText, {
        stageId: data.stageId,
        stageEvent: 'update',
        statusText: data.statusText,
        extraMetrics: data.extraMetrics
      });
    } else if (data.type === 'STAGE_COMPLETE') {
      onProgress(100, `Hoàn thành ${data.stageId}`, {
        stageId: data.stageId,
        stageEvent: 'complete',
        stageStatus: data.status,
        stageError: data.error,
        stageResult: data.result
      });
    } else if (data.type === 'PROGRESS') {
      onProgress(data.progress, data.status, {
        chunk: data.chunk,
        totalChunks: data.totalChunks,
        speed: data.speed
      });
    } else if (data.type === 'DONE') {
      onResult(data.result);
      worker.terminate();
    } else if (data.type === 'ERROR') {
      onError(data.error);
      worker.terminate();
    }
  };

  worker.postMessage({ file, perfMode });
  return worker;
}

/**
 * Progressive background analyzer that reads files slice-by-slice
 * without blocking the main UI thread. (Main Thread Fallback)
 */
export async function performDeepAnalysis(
  file: File,
  onProgress: (progress: number, status?: string) => void,
  perfMode: 'lite' | 'balanced' | 'professional' = 'balanced',
  onPartialResult?: (
    partial: AnalysisResult,
    scanProgress?: {
      header: string;
      metadata: number;
      strings: number;
      assets: number;
      structure: number;
    }
  ) => void,
  abortSignal?: AbortSignal
): Promise<AnalysisResult> {
  const size = file.size;
  
  // 1. Read immediate Header (first 64KB) for instant UI feedback
  onProgress(5, 'Reading Header...');
  const reader = new FileReader();
  const headerPromise = new Promise<Uint8Array>((resolve, reject) => {
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('Failed to read header'));
    reader.readAsArrayBuffer(file.slice(0, Math.min(size, 65536)));
  });
  
  const headerBytes = await headerPromise;
  if (abortSignal?.aborted) throw new Error('Aborted');
  onProgress(15, 'Detecting Format...');

  // Parse immediate format using basic plugin system
  const parsedResult = await runSmartParser(file, headerBytes);
  if (abortSignal?.aborted) throw new Error('Aborted');
  onProgress(30, `Format detected: ${parsedResult.formatName}`);

  // 3. universal metadata preparation
  const isText = parsedResult.isText;
  let textContent = '';
  if (isText) {
    textContent = decodeString(headerBytes, 0, Math.min(headerBytes.length, 10240));
  }

  // Generate an exhaustive universal metadata list
  const metadataList: AnalysisResult['metadata'] = [
    { key: 'name', label: 'Tên tệp tin (File Name)', value: file.name, editable: false, offset: 0 },
    { key: 'size', label: 'Dung lượng (File Size)', value: `${(size / (1024 * 1024)).toFixed(3)} MB (${size.toLocaleString()} bytes)`, editable: false, offset: 0 },
    { key: 'modified', label: 'Ngày sửa đổi (Modified Date)', value: new Date(file.lastModified).toLocaleString('vi-VN'), editable: false, offset: 0 },
    { key: 'format', label: 'Định dạng đã nhận diện', value: parsedResult.formatName, editable: false, offset: 0 },
    ...parsedResult.metadata.map(m => ({ ...m, offset: 0 }))
  ];

  // Try parsing file structure offsets
  const structureList: AnalysisResult['structure'] = parsedResult.structures.length > 0
    ? parsedResult.structures
    : [
        { name: 'Header / Magic Bytes', start: 0, end: Math.min(size, 64), type: 'header', description: 'Chứa dấu hiệu nhận dạng của tệp tin' },
        { name: 'Metadata Vùng chứa', start: Math.min(size, 64), end: Math.min(size, 512), type: 'metadata', description: 'Thông tin bổ sung về tác giả, thuộc tính' },
        { name: 'Khối dữ liệu chính (Payload)', start: Math.min(size, 512), end: Math.max(512, size - 128), type: 'data', description: 'Phân vùng chứa dữ liệu thực thi chính' },
        { name: 'Footer / End of File', start: Math.max(512, size - 128), end: size, type: 'footer', description: 'Khối kiểm tra tính toàn vẹn và đánh dấu kết thúc tệp' }
      ];

  // 4. Create File Map representation (Bản đồ tệp tin trực quan)
  // const fileMap = generateFileMap(size, structureList, parsedResult);

  const stringsList: AnalysisResult['strings'] = [];
  
  // Scans the header bytes for strings
  extractStringsFromBytes(headerBytes, 0, stringsList);

  const buildResult = (list: AnalysisResult['strings']): AnalysisResult => ({
    fileType: parsedResult.formatName,
    isText,
    textContent,
    detectedItems: {
      images: parsedResult.detectedFeatures.images,
      audio: parsedResult.detectedFeatures.audio,
      video: parsedResult.detectedFeatures.video,
      text: isText,
      strings: list.length > 0,
      metadata: true,
      dates: list.some(s => s.value.includes('/')),
      urls: list.some(s => s.type === 'url'),
      versions: true,
      header: true,
      footer: size > 512,
      dataBlocks: true,
      databases: parsedResult.detectedFeatures.tables,
      certificates: file.name.includes('cert') || file.name.includes('signature') || list.some(s => s.type === 'token'),
      unknownSections: false,
    },
    strings: list,
    metadata: metadataList,
    structure: structureList,
    embeddedItems: parsedResult.embeddedItems || [],
    isRawScanMode: parsedResult.isRawScanMode,
    rawScanWarning: parsedResult.rawScanWarning
  });

  // If Lite Mode, we return IMMEDIATELY with the Header result!
  if (perfMode === 'lite') {
    onProgress(100, 'Complete (Lite)');
    const initial = buildResult(stringsList);
    if (onPartialResult) {
      onPartialResult(initial, {
        header: 'done',
        metadata: 100,
        strings: 100,
        assets: 100,
        structure: 100
      });
    }
    return initial;
  }

  // Let's send initial fast results immediately so the UI is interactive
  const initialResult = buildResult(stringsList);
  if (onPartialResult) {
    onPartialResult(initialResult, {
      header: 'done',
      metadata: 100,
      strings: 10,
      assets: 20,
      structure: 100
    });
  }

  // Deep Scan for Strings (Chunked processing to avoid blocking)
  const chunkSize = 1024 * 1024; // 1MB chunks
  let currentOffset = headerBytes.length;
  const totalChunks = Math.ceil(size / chunkSize);

  while (currentOffset < size) {
    if (abortSignal?.aborted) throw new Error('Aborted');
    
    const chunkIndex = Math.floor(currentOffset / chunkSize) + 1;
    onProgress(
      Math.min(99, 40 + (currentOffset / size) * 50), 
      `Scanning strings... Chunk ${chunkIndex}/${totalChunks}`
    );

    const end = Math.min(currentOffset + chunkSize, size);
    const chunkBlob = file.slice(currentOffset, end);
    const chunkArrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(new Error('Failed to read chunk'));
      r.readAsArrayBuffer(chunkBlob);
    });
    const chunkBytes = new Uint8Array(chunkArrayBuffer);
    
    extractStringsFromBytes(chunkBytes, currentOffset, stringsList);
    
    currentOffset = end;
    
    // Limits: stop scanning strings if we have too many to prevent RAM issues
    if (perfMode === 'balanced' && stringsList.length > 50000) break;
    if (perfMode === 'professional' && stringsList.length > 200000) break;

    // Periodically update partial results
    if (onPartialResult && chunkIndex % 10 === 0) {
      onPartialResult(buildResult(stringsList), {
        header: 'done',
        metadata: 100,
        strings: Math.floor((currentOffset / size) * 100),
        assets: 100,
        structure: 100
      });
    }
    
    // Yield to main thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  onProgress(100, 'Analysis Complete');
  const finalResult = buildResult(stringsList);
  if (onPartialResult) {
    onPartialResult(finalResult, {
      header: 'done',
      metadata: 100,
      strings: 100,
      assets: 100,
      structure: 100
    });
  }
  return finalResult;
}

/**
 * Fast string scanning helper
 */
function extractStringsFromBytes(bytes: Uint8Array, baseOffset: number, stringsList: AnalysisResult['strings']) {
  let tempChars: number[] = [];
  let startOffset = 0;

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 32 && b <= 126) {
      if (tempChars.length === 0) {
        startOffset = baseOffset + i;
      }
      tempChars.push(b);
    } else {
      if (tempChars.length >= 4) {
        const text = String.fromCharCode(...tempChars);
        const cleanText = text.trim();
        if (cleanText.length >= 4) {
          stringsList.push({
            value: cleanText,
            length: cleanText.length,
            offset: startOffset,
            type: classifyString(cleanText)
          });
        }
      }
      tempChars = [];
    }
  }
}


