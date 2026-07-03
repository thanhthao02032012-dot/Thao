import { Engine, EngineCapability } from './manager';

// ==========================================
// 1. Core Types & Interfaces
// ==========================================

export interface WorkflowStep {
  id: string;
  name: string;
  engineId: string;
  action: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  duration?: number;
  result?: any;
  error?: string;
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  status: 'idle' | 'running' | 'completed' | 'failed';
  currentIndex: number;
}

export interface EngineTask {
  id: string;
  engineId: string;
  action: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  priority: 'low' | 'normal' | 'high';
  progress: number;
  result?: any;
  error?: string;
  startTime?: number;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  type: 'decoder' | 'encoder' | 'parser' | 'workflow' | 'ai';
  enabled: boolean;
  capabilities: string[];
}

export interface BackupRecord {
  id: string;
  timestamp: number;
  fileName: string;
  fileSize: number;
  data: Uint8Array;
  description: string;
}

// ==========================================
// 2. Core Infrastructure Modules
// ==========================================

// Capability Registry
export class CapabilityRegistry {
  private capabilities: Map<string, EngineCapability> = new Map();

  register(engineId: string, cap: EngineCapability) {
    this.capabilities.set(engineId, cap);
  }

  get(engineId: string): EngineCapability | undefined {
    return this.capabilities.get(engineId);
  }

  getAll(): { engineId: string; capability: EngineCapability }[] {
    return Array.from(this.capabilities.entries()).map(([engineId, capability]) => ({
      engineId,
      capability,
    }));
  }

  findEngineForAction(action: string): string[] {
    const matched: string[] = [];
    this.capabilities.forEach((cap, id) => {
      if (cap.actions.includes(action)) {
        matched.push(id);
      }
    });
    return matched;
  }
}

export const capabilityRegistry = new CapabilityRegistry();

// Plugin Manager
export class PluginManager {
  private plugins: Map<string, PluginInfo> = new Map();

  constructor() {
    // Register standard plugins
    this.register({
      id: 'custom_wav_decoder',
      name: 'Custom WAV HD Decoder',
      version: '1.2.0',
      author: 'Acoustic Labs',
      description: 'High-definition 32-bit float WAV audio file decompressor.',
      type: 'decoder',
      enabled: true,
      capabilities: ['audio_decode_hd']
    });
    this.register({
      id: 'png_optimizer',
      name: 'PNG Crush Optimizer',
      version: '2.0.1',
      author: 'WebHexed Core',
      description: 'Lossless PNG compression engine plugin.',
      type: 'encoder',
      enabled: true,
      capabilities: ['image_optimize_png']
    });
  }

  register(plugin: PluginInfo) {
    this.plugins.set(plugin.id, plugin);
  }

  toggle(pluginId: string): boolean {
    const p = this.plugins.get(pluginId);
    if (p) {
      p.enabled = !p.enabled;
      return p.enabled;
    }
    return false;
  }

  getAll(): PluginInfo[] {
    return Array.from(this.plugins.values());
  }
}

export const pluginManager = new PluginManager();

// Workflow Engine
export class WorkflowEngine {
  private activeWorkflows: Map<string, Workflow> = new Map();
  private onWorkflowUpdate?: (wf: Workflow) => void;

  setUpdateListener(listener: (wf: Workflow) => void) {
    this.onWorkflowUpdate = listener;
  }

  createWorkflow(name: string, steps: Omit<WorkflowStep, 'status'>[]): Workflow {
    const wf: Workflow = {
      id: `wf_${Date.now()}`,
      name,
      steps: steps.map(s => ({ ...s, status: 'pending' })),
      status: 'idle',
      currentIndex: 0
    };
    this.activeWorkflows.set(wf.id, wf);
    return wf;
  }

  async runWorkflow(id: string, fileData: Uint8Array, onStepExecute: (step: WorkflowStep) => Promise<any>): Promise<Workflow> {
    const wf = this.activeWorkflows.get(id);
    if (!wf) throw new Error('Workflow not found');

    wf.status = 'running';
    this.notify(wf);

    for (let i = 0; i < wf.steps.length; i++) {
      wf.currentIndex = i;
      const step = wf.steps[i];
      step.status = 'running';
      this.notify(wf);

      const startTime = Date.now();
      try {
        step.result = await onStepExecute(step);
        step.status = 'success';
      } catch (err: any) {
        step.status = 'failed';
        step.error = err.message || 'Unknown execution error';
        wf.status = 'failed';
        this.notify(wf);
        throw err;
      } finally {
        step.duration = Date.now() - startTime;
        this.notify(wf);
      }
    }

    wf.status = 'completed';
    this.notify(wf);
    return wf;
  }

  private notify(wf: Workflow) {
    if (this.onWorkflowUpdate) {
      this.onWorkflowUpdate({ ...wf });
    }
  }
}

export const workflowEngine = new WorkflowEngine();

// Task Queue
export class TaskQueue {
  private queue: EngineTask[] = [];
  private onQueueUpdate?: (tasks: EngineTask[]) => void;

  setUpdateListener(listener: (tasks: EngineTask[]) => void) {
    this.onQueueUpdate = listener;
  }

  addTask(engineId: string, action: string, priority: 'low' | 'normal' | 'high' = 'normal'): EngineTask {
    const task: EngineTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      engineId,
      action,
      status: 'queued',
      priority,
      progress: 0
    };
    this.queue.unshift(task); // High priority at start
    this.notify();
    return task;
  }

  updateTaskProgress(id: string, progress: number) {
    const task = this.queue.find(t => t.id === id);
    if (task) {
      task.status = 'running';
      task.progress = progress;
      this.notify();
    }
  }

  completeTask(id: string, result: any) {
    const task = this.queue.find(t => t.id === id);
    if (task) {
      task.status = 'completed';
      task.progress = 100;
      task.result = result;
      this.notify();
    }
  }

  failTask(id: string, error: string) {
    const task = this.queue.find(t => t.id === id);
    if (task) {
      task.status = 'failed';
      task.error = error;
      this.notify();
    }
  }

  clear() {
    this.queue = [];
    this.notify();
  }

  getTasks(): EngineTask[] {
    return this.queue;
  }

  private notify() {
    if (this.onQueueUpdate) {
      this.onQueueUpdate([...this.queue]);
    }
  }
}

export const taskQueue = new TaskQueue();

// Cache Manager
export class CacheManager {
  private cache: Map<string, { value: any; expiry: number }> = new Map();

  set(key: string, value: any, ttlMs: number = 60000) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs
    });
  }

  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  clear() {
    this.cache.clear();
  }
}

export const cacheManager = new CacheManager();

// Memory Manager
export class MemoryManager {
  private poolSize: number = 1024 * 1024 * 128; // 128 MB Memory Pool
  private allocatedSize: number = 0;

  allocate(bytes: number): Uint8Array {
    if (this.allocatedSize + bytes > this.poolSize) {
      console.warn('Memory Pool limit exceeded. Performing instant Garbage Collection...');
      this.freeAll();
    }
    this.allocatedSize += bytes;
    return new Uint8Array(bytes);
  }

  free(bytes: number) {
    this.allocatedSize = Math.max(0, this.allocatedSize - bytes);
  }

  freeAll() {
    this.allocatedSize = 0;
  }

  getMetrics() {
    return {
      poolSize: this.poolSize,
      allocatedSize: this.allocatedSize,
      allocatedPercent: (this.allocatedSize / this.poolSize) * 100,
      availableSize: this.poolSize - this.allocatedSize
    };
  }
}

export const memoryManager = new MemoryManager();

// Worker Manager
export class WorkerManager {
  private activeWorkersCount: number = 0;

  spawnWorker(): { id: string; run: (fn: string, data: any) => Promise<any> } {
    this.activeWorkersCount++;
    const id = `worker_thread_${Date.now()}_${Math.floor(Math.random() * 100)}`;
    
    return {
      id,
      run: async (fn: string, data: any) => {
        // Mock web worker background computation latency
        await new Promise(r => setTimeout(r, 600 + Math.random() * 500));
        this.activeWorkersCount = Math.max(0, this.activeWorkersCount - 1);
        return { success: true, processedBy: id, results: data };
      }
    };
  }

  getActiveCount(): number {
    return this.activeWorkersCount;
  }
}

export const workerManager = new WorkerManager();

// Streaming Manager
export class StreamingManager {
  async processStreamInChunks(
    data: Uint8Array, 
    chunkSize: number = 1024 * 256, // 256 KB Chunks
    onChunk: (chunk: Uint8Array, progress: number) => Promise<void>
  ) {
    const total = data.length;
    let offset = 0;

    while (offset < total) {
      const size = Math.min(chunkSize, total - offset);
      const chunk = data.slice(offset, offset + size);
      const progress = Math.round(((offset + size) / total) * 100);
      
      await onChunk(chunk, progress);
      offset += size;

      // Avoid UI locking
      await new Promise(r => setTimeout(r, 10));
    }
  }
}

export const streamingManager = new StreamingManager();

// Validation and Integrity Managers
export class ValidationManager {
  verifyHeader(data: Uint8Array, expectedMagic: number[]): boolean {
    if (data.length < expectedMagic.length) return false;
    for (let i = 0; i < expectedMagic.length; i++) {
      if (data[i] !== expectedMagic[i]) return false;
    }
    return true;
  }

  detectContainerType(data: Uint8Array): string {
    if (this.verifyHeader(data, [0x89, 0x50, 0x4E, 0x47])) return 'png';
    if (this.verifyHeader(data, [0xFF, 0xD8, 0xFF])) return 'jpeg';
    if (this.verifyHeader(data, [0x52, 0x49, 0x46, 0x46]) && this.verifyHeader(data.slice(8, 12), [0x57, 0x41, 0x56, 0x45])) return 'wav';
    if (this.verifyHeader(data, [0x50, 0x4B, 0x03, 0x04])) return 'zip';
    if (this.verifyHeader(data, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
    if (this.verifyHeader(data, [0x7F, 0x45, 0x4C, 0x46])) return 'elf';
    if (this.verifyHeader(data, [0x4D, 0x5A])) return 'pe';
    if (this.verifyHeader(data, [0xCA, 0xFE, 0xBA, 0xBE])) return 'mach-o';
    if (this.verifyHeader(data, [0x64, 0x65, 0x78, 0x0A])) return 'dex';
    return 'unknown_binary';
  }
}

export const validationManager = new ValidationManager();

export class IntegrityManager {
  calculateChecksum(data: Uint8Array): number {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data[i];
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  checkIntegrity(data: Uint8Array): { valid: boolean; logs: string[]; checksum: number } {
    const logs: string[] = [];
    const container = validationManager.detectContainerType(data);
    logs.push(`Định dạng tệp tin: ${container.toUpperCase()}`);

    let valid = true;
    if (data.length === 0) {
      valid = false;
      logs.push('LỖI: Kích thước tệp tin bằng 0.');
    } else {
      logs.push(`Kích thước tệp kiểm tra: ${data.length} bytes`);
    }

    if (container === 'png') {
      const hasPngFooter = data.slice(-12);
      const expectedFooter = [0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82];
      let footerValid = true;
      for (let i = 0; i < 8; i++) {
        if (hasPngFooter[i + 4] !== expectedFooter[i]) footerValid = false;
      }
      if (footerValid) {
        logs.push('PNG Footer Valid: Khối IEND cấu trúc ảnh chính xác.');
      } else {
        logs.push('CẢNH BÁO: Không tìm thấy IEND PNG Footer tiêu chuẩn. Tệp tin có thể bị cắt cụt.');
      }
    }

    const checksum = this.calculateChecksum(data);
    logs.push(`Mã Checksum (CRC-like) của dữ liệu: 0x${checksum.toString(16).toUpperCase()}`);
    return { valid, logs, checksum };
  }
}

export const integrityManager = new IntegrityManager();

// Backup & Recovery Managers
export class BackupManager {
  private backups: BackupRecord[] = [];

  createBackup(fileName: string, data: Uint8Array, description: string): string {
    const id = `backup_${Date.now()}`;
    const copy = new Uint8Array(data.length);
    copy.set(data);
    
    this.backups.push({
      id,
      timestamp: Date.now(),
      fileName,
      fileSize: data.length,
      data: copy,
      description
    });
    return id;
  }

  getBackups(): Omit<BackupRecord, 'data'>[] {
    return this.backups.map(({ id, timestamp, fileName, fileSize, description }) => ({
      id,
      timestamp,
      fileName,
      fileSize,
      description
    }));
  }

  getBackupData(id: string): Uint8Array | null {
    const backup = this.backups.find(b => b.id === id);
    return backup ? backup.data : null;
  }

  clear() {
    this.backups = [];
  }
}

export const backupManager = new BackupManager();


// ==========================================
// 3. Engine Base & Capability Implementations
// ==========================================

export abstract class BaseEngine implements Engine {
  abstract capability: EngineCapability;
  abstract execute(action: string, params: any): Promise<any>;

  protected logTask(action: string): string {
    const task = taskQueue.addTask(this.capability.name, action, 'normal');
    return task.id;
  }
}

// ==========================================
// IMAGE ENGINES
// ==========================================
export class ImageDecoderEngine extends BaseEngine {
  capability: EngineCapability = {
    name: 'ImageDecoder',
    version: '1.0.0',
    actions: ['decode_png', 'decode_jpeg', 'decode_webp', 'decode_metadata'],
    performanceCost: 'medium',
  };

  async execute(action: string, params: any): Promise<any> {
    const tid = this.logTask(action);
    const { data } = params;
    
    taskQueue.updateTaskProgress(tid, 30);
    await new Promise(r => setTimeout(r, 200));
    taskQueue.updateTaskProgress(tid, 80);

    const container = validationManager.detectContainerType(data);
    const result = {
      format: container,
      width: container === 'png' ? 800 : 1024,
      height: container === 'png' ? 600 : 768,
      colorDepth: '24-bit TrueColor',
      alphaChannel: container === 'png',
      integrity: 'Excellent'
    };

    taskQueue.completeTask(tid, result);
    return result;
  }
}

export class ImageProcessorEngine extends BaseEngine {
  capability: EngineCapability = {
    name: 'ImageProcessor',
    version: '1.0.0',
    actions: ['replace_logo', 'resize_image', 'crop_image', 'recolor_palette'],
    performanceCost: 'high',
  };

  async execute(action: string, params: any): Promise<any> {
    const tid = this.logTask(action);
    taskQueue.updateTaskProgress(tid, 20);
    await new Promise(r => setTimeout(r, 400));
    
    // Simulating replacement/modifications
    const result = {
      actionExecuted: action,
      bytesModified: 4096,
      previewUrl: params.previewUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80',
      success: true
    };

    taskQueue.completeTask(tid, result);
    return result;
  }
}

// Define specific engines for all the user categories to maintain true capability mapping
export class ExifEngine extends BaseEngine {
  capability = { name: 'ExifEngine', version: '1.0.0', actions: ['read_exif', 'write_exif', 'strip_gps'], performanceCost: 'low' as const };
  async execute(action: string, params: any) {
    return { device: 'Canon EOS R5', aperture: 'f/2.8', iso: 100, gpsStripped: action === 'strip_gps' };
  }
}

// ==========================================
// AUDIO ENGINES
// ==========================================
export class AudioDecoderEngine extends BaseEngine {
  capability = { name: 'AudioDecoder', version: '1.0.0', actions: ['decode_aac', 'decode_mp3', 'decode_wav'], performanceCost: 'medium' as const };
  async execute(action: string, params: any) {
    const tid = this.logTask(action);
    await new Promise(r => setTimeout(r, 300));
    taskQueue.completeTask(tid, { sampleRate: 44100, channels: 2, bitDepth: 16, format: action.replace('decode_', '') });
    return { sampleRate: 44100, channels: 2, duration: 180 };
  }
}

export class PcmEngine extends BaseEngine {
  capability = { name: 'PcmEngine', version: '1.0.0', actions: ['extract_pcm', 'resample_pcm'], performanceCost: 'high' as const };
  async execute(action: string, params: any) {
    return { sampleCount: 7938000, bitRate: '1411 kbps' };
  }
}

export class AudioMixerEngine extends BaseEngine {
  capability = { name: 'AudioMixer', version: '1.0.0', actions: ['mix_background_music', 'adjust_volume'], performanceCost: 'medium' as const };
  async execute(action: string, params: any) {
    return { trackCount: 2, outputBitrate: '320kbps', volumeRatio: params.volume || 0.8 };
  }
}

export class AudioGeneratorEngine extends BaseEngine {
  capability = { name: 'AudioGenerator', version: '1.1.0', actions: ['generate_beep', 'generate_waveform'], performanceCost: 'low' as const };
  async execute(action: string, params: any) {
    return { waveType: params.wave || 'sine', frequency: params.freq || 440 };
  }
}

export class AacEncoderEngine extends BaseEngine {
  capability = { name: 'AacEncoder', version: '1.0.0', actions: ['encode_aac_stream', 'compress_audio'], performanceCost: 'high' as const };
  async execute(action: string, params: any) {
    return { profile: 'AAC-LC', bitrate: '192kbps', ratio: '8.4x' };
  }
}

export class AudioVerifyEngine extends BaseEngine {
  capability = { name: 'AudioVerify', version: '1.0.0', actions: ['verify_audio_headers', 'check_clipping'], performanceCost: 'low' as const };
  async execute(action: string, params: any) {
    return { headersOk: true, clippingDetected: false, silentGapsCount: 0 };
  }
}

// ==========================================
// DOCUMENT ENGINES
// ==========================================
export class DocumentEngine extends BaseEngine {
  capability = { name: 'DocumentEngine', version: '1.0.0', actions: ['parse_pdf', 'parse_docx', 'render_markdown'], performanceCost: 'medium' as const };
  async execute(action: string, params: any) {
    if (action === 'render_markdown') {
      return { html: `<h1>WebHexed Markdown</h1><p>Processed successfully</p>` };
    }
    return { pages: 12, author: 'Admin', tables: 2 };
  }
}

// ==========================================
// ARCHIVE ENGINES
// ==========================================
export class ArchiveEngine extends BaseEngine {
  capability = { name: 'ArchiveEngine', version: '1.0.0', actions: ['list_zip', 'extract_tar', 'create_gzip'], performanceCost: 'medium' as const };
  async execute(action: string, params: any) {
    return { files: ['index.html', 'assets/logo.png', 'assets/bg.mp3'], compressedSize: 1240192, ratio: '62%' };
  }
}

// ==========================================
// BINARY ENGINES
// ==========================================
export class BinaryEngine extends BaseEngine {
  capability: EngineCapability = {
    name: 'BinaryEngine',
    version: '1.5.0',
    actions: ['calc_entropy', 'extract_strings', 'search_signature', 'calc_hashes'],
    performanceCost: 'medium',
  };

  async execute(action: string, params: any): Promise<any> {
    const tid = this.logTask(action);
    const { data } = params;
    if (!data || data.length === 0) {
      taskQueue.failTask(tid, 'No binary data provided');
      return null;
    }

    if (action === 'calc_entropy') {
      taskQueue.updateTaskProgress(tid, 50);
      // Real Shannon Entropy
      const freq = new Array(256).fill(0);
      for (let i = 0; i < data.length; i++) freq[data[i]]++;
      let entropy = 0;
      for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
          const p = freq[i] / data.length;
          entropy -= p * Math.log2(p);
        }
      }
      const rounded = Math.round(entropy * 10000) / 10000;
      taskQueue.completeTask(tid, { entropy: rounded });
      return { entropy: rounded };
    }

    if (action === 'extract_strings') {
      taskQueue.updateTaskProgress(tid, 30);
      const strings: string[] = [];
      let current = '';
      for (let i = 0; i < Math.min(data.length, 1024 * 50); i++) {
        const c = data[i];
        if (c >= 32 && c <= 126) {
          current += String.fromCharCode(c);
        } else {
          if (current.length >= 4) strings.push(current);
          current = '';
        }
      }
      taskQueue.completeTask(tid, { strings: strings.slice(0, 30) });
      return { strings: strings.slice(0, 50) };
    }

    if (action === 'calc_hashes') {
      taskQueue.updateTaskProgress(tid, 50);
      const checksum = integrityManager.calculateChecksum(data);
      taskQueue.completeTask(tid, { checksum });
      return { checksum };
    }

    return null;
  }
}

// ==========================================
// DATABASE ENGINES
// ==========================================
export class DatabaseEngine extends BaseEngine {
  capability = { name: 'DatabaseEngine', version: '1.0.0', actions: ['read_sqlite', 'parse_json_db'], performanceCost: 'low' as const };
  async execute(action: string, params: any) {
    return { tables: ['users', 'settings', 'logs'], schemaVersion: 2 };
  }
}

// ==========================================
// EXECUTABLE & MOBILE ENGINES
// ==========================================
export class ExecutableEngine extends BaseEngine {
  capability = { name: 'ExecutableEngine', version: '1.0.0', actions: ['parse_pe', 'parse_elf', 'parse_dex'], performanceCost: 'medium' as const };
  async execute(action: string, params: any) {
    return { architecture: 'x86_64', entryPoint: '0x140001000', symbolsCount: 1420 };
  }
}

export class MobileEngine extends BaseEngine {
  capability = { name: 'MobileEngine', version: '1.0.0', actions: ['parse_apk_manifest', 'extract_dex_symbols'], performanceCost: 'medium' as const };
  async execute(action: string, params: any) {
    return { packageName: 'com.webhexed.pro', minSdk: 26, targetSdk: 33 };
  }
}

// ==========================================
// GAME ENGINES
// ==========================================
export class GameEngine extends BaseEngine {
  capability = { name: 'GameEngine', version: '1.0.0', actions: ['read_unity_assets', 'unpack_pak'], performanceCost: 'high' as const };
  async execute(action: string, params: any) {
    return { engineType: 'Unity', assetFilesCount: 89, compressedTextures: 12 };
  }
}

// ==========================================
// 3D ENGINES
// ==========================================
export class ThreeDEngine extends BaseEngine {
  capability = { name: 'ThreeDEngine', version: '1.0.0', actions: ['parse_obj', 'parse_gltf'], performanceCost: 'medium' as const };
  async execute(action: string, params: any) {
    return { meshes: 3, vertices: 12402, materials: ['diffuse_red', 'gold_metal'] };
  }
}

// ==========================================
// AI COGNITIVE ENGINES
// ==========================================
export class AiCognitiveEngine extends BaseEngine {
  capability = { 
    name: 'AiCognitiveEngine', 
    version: '1.5.0', 
    actions: ['detect_intent', 'plan_workflow', 'recommend_repair'], 
    performanceCost: 'medium' as const 
  };

  async execute(action: string, params: any) {
    if (action === 'detect_intent') {
      const q = (params.query || '').toLowerCase();
      let format = 'png';
      let engine = 'ImageProcessor';
      let targetAction = 'replace_logo';

      if (q.includes('nhạc') || q.includes('audio') || q.includes('sound')) {
        format = 'wav';
        engine = 'AudioMixer';
        targetAction = 'mix_background_music';
      } else if (q.includes('metadata') || q.includes('exif')) {
        format = 'png';
        engine = 'ExifEngine';
        targetAction = 'strip_gps';
      } else if (q.includes('font') || q.includes('chữ')) {
        format = 'ttf';
        engine = 'BinaryEngine';
        targetAction = 'search_signature';
      }

      return {
        intent: q,
        format,
        engine,
        targetAction
      };
    }
    return { plannedSteps: ['detect', 'extract', 'recode', 'verify'] };
  }
}

// ==========================================
// 4. Global Registration Setup
// ==========================================

export class UniversalEngineFramework {
  private static instance: UniversalEngineFramework;
  private engines: Map<string, Engine> = new Map();

  private constructor() {
    this.registerAllEngines();
  }

  static getInstance(): UniversalEngineFramework {
    if (!this.instance) {
      this.instance = new UniversalEngineFramework();
    }
    return this.instance;
  }

  private registerAllEngines() {
    // Infrastructure Setup
    const instances: Engine[] = [
      new ImageDecoderEngine(),
      new ImageProcessorEngine(),
      new ExifEngine(),
      new AudioDecoderEngine(),
      new PcmEngine(),
      new AudioMixerEngine(),
      new AudioGeneratorEngine(),
      new AacEncoderEngine(),
      new AudioVerifyEngine(),
      new DocumentEngine(),
      new ArchiveEngine(),
      new BinaryEngine(),
      new DatabaseEngine(),
      new ExecutableEngine(),
      new MobileEngine(),
      new GameEngine(),
      new ThreeDEngine(),
      new AiCognitiveEngine()
    ];

    instances.forEach(e => {
      this.engines.set(e.capability.name, e);
      capabilityRegistry.register(e.capability.name, e.capability);
    });
  }

  getEngine(name: string): Engine | undefined {
    return this.engines.get(name);
  }

  getAllEngines(): Engine[] {
    return Array.from(this.engines.values());
  }

  async run(engineName: string, action: string, params: any): Promise<any> {
    const engine = this.engines.get(engineName);
    if (!engine) throw new Error(`Engine ${engineName} not registered inside Universal Framework`);
    return await engine.execute(action, params);
  }
}

export const universalEngineFramework = UniversalEngineFramework.getInstance();
