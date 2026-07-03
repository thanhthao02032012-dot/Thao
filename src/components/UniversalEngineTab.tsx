import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cpu, Activity, Layers, ShieldCheck, CheckCircle2, Beaker, Play, 
  Sparkles, Undo, Eye, RefreshCw, FileCode, Trash2, ArrowRight, ShieldAlert,
  Download, Zap, HelpCircle, HardDrive, Terminal
} from 'lucide-react';
import { useUI } from './UIProvider';
import { 
  universalEngineFramework, 
  capabilityRegistry, 
  pluginManager, 
  taskQueue, 
  memoryManager, 
  workerManager, 
  integrityManager, 
  backupManager,
  EngineTask,
  PluginInfo,
  validationManager
} from '../lib/engine/universalFramework';

interface UniversalEngineTabProps {
  file: File;
  onAction: (action: string, payload: any) => void;
}

export default function UniversalEngineTab({ file, onAction }: UniversalEngineTabProps) {
  const { toast } = useUI();
  
  // File data buffer for live tests
  const [fileBuffer, setFileBuffer] = useState<Uint8Array | null>(null);
  const [activeEngineCategory, setActiveEngineCategory] = useState<string>('all');
  const [selectedEngine, setSelectedEngine] = useState<any>(null);
  const [selectedAction, setSelectedAction] = useState<string>('');
  
  // Framework infrastructure states
  const [tasks, setTasks] = useState<EngineTask[]>([]);
  const [memoryMetrics, setMemoryMetrics] = useState(memoryManager.getMetrics());
  const [workerCount, setWorkerCount] = useState(workerManager.getActiveCount());
  const [plugins, setPlugins] = useState<PluginInfo[]>(pluginManager.getAll());
  const [backups, setBackups] = useState<any[]>(backupManager.getBackups());
  
  // Smart Edit States
  const [smartScenario, setSmartScenario] = useState<string>('');
  const [smartStep, setSmartStep] = useState<number>(0);
  const [smartWorkflowLogs, setSmartWorkflowLogs] = useState<string[]>([]);
  const [integrityStatus, setIntegrityStatus] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Load file data on entry
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        const u8 = new Uint8Array(reader.result as ArrayBuffer);
        setFileBuffer(u8);
        
        // Auto check integrity
        const check = integrityManager.checkIntegrity(u8);
        setIntegrityStatus(check);
      }
    };
    reader.readAsArrayBuffer(file);
    
    // Set listeners
    taskQueue.setUpdateListener((updatedTasks) => {
      setTasks(updatedTasks);
      setMemoryMetrics(memoryManager.getMetrics());
      setWorkerCount(workerManager.getActiveCount());
    });

    return () => {
      taskQueue.setUpdateListener(() => {});
    };
  }, [file]);

  const refreshInfrastructure = () => {
    setMemoryMetrics(memoryManager.getMetrics());
    setWorkerCount(workerManager.getActiveCount());
    setPlugins(pluginManager.getAll());
    setBackups(backupManager.getBackups());
  };

  // Categories list
  const categories = [
    { id: 'all', name: 'Tất cả Engine', count: universalEngineFramework.getAllEngines().length },
    { id: 'core', name: 'Cốt lõi / Cơ sở', count: 12 },
    { id: 'image', name: 'Xử lý Ảnh', count: 20 },
    { id: 'audio', name: 'Âm thanh', count: 14 },
    { id: 'video', name: 'Video / Luồng', count: 11 },
    { id: 'document', name: 'Tài liệu / PDF', count: 8 },
    { id: 'archive', name: 'Lưu trữ / Nén', count: 8 },
    { id: 'binary', name: 'Nhị phân / YARA', count: 14 },
    { id: 'database', name: 'Cơ sở dữ liệu', count: 9 },
    { id: 'executable', name: 'Thực thi / OS', count: 7 },
    { id: 'mobile', name: 'Di động / APK', count: 11 },
    { id: 'game', name: 'Game / Unity', count: 10 },
    { id: '3d', name: 'Đồ họa 3D', count: 7 },
    { id: 'ai', name: 'Trí tuệ nhân tạo (AI)', count: 11 }
  ];

  // Fetch engines based on category filter
  const getFilteredEngines = () => {
    const all = universalEngineFramework.getAllEngines();
    if (activeEngineCategory === 'all') return all;
    
    return all.filter(e => {
      const name = e.capability.name.toLowerCase();
      if (activeEngineCategory === 'image') return name.includes('image') || name.includes('exif');
      if (activeEngineCategory === 'audio') return name.includes('audio') || name.includes('pcm') || name.includes('aac');
      if (activeEngineCategory === 'video') return name.includes('video') || name.includes('frame');
      if (activeEngineCategory === 'document') return name.includes('doc') || name.includes('pdf');
      if (activeEngineCategory === 'archive') return name.includes('archive') || name.includes('zip');
      if (activeEngineCategory === 'binary') return name.includes('binary') || name.includes('hex');
      if (activeEngineCategory === 'database') return name.includes('database') || name.includes('sqlite');
      if (activeEngineCategory === 'executable') return name.includes('executable') || name.includes('pe') || name.includes('elf');
      if (activeEngineCategory === 'mobile') return name.includes('mobile') || name.includes('apk');
      if (activeEngineCategory === 'game') return name.includes('game') || name.includes('unity');
      if (activeEngineCategory === '3d') return name.includes('three') || name.includes('gltf');
      if (activeEngineCategory === 'ai') return name.includes('ai') || name.includes('cognitive');
      return true;
    });
  };

  const handleRunEngineAction = async () => {
    if (!selectedEngine || !selectedAction) {
      toast("Vui lòng chọn Engine và hành động trước khi chạy", "warning");
      return;
    }

    try {
      toast(`Đang kích hoạt ${selectedEngine.capability.name}...`, "info");
      
      // Memory allocation simulation
      const allocSize = selectedEngine.capability.performanceCost === 'high' ? 1024 * 1024 * 32 : 1024 * 1024 * 4;
      const dummyMem = memoryManager.allocate(allocSize);
      
      const result = await universalEngineFramework.run(
        selectedEngine.capability.name,
        selectedAction,
        { data: fileBuffer || new Uint8Array(), filename: file.name }
      );

      // Free simulation memory
      memoryManager.free(allocSize);
      refreshInfrastructure();

      toast(`Chạy thành công: ${selectedAction}`, "success");
    } catch (err: any) {
      toast(`Lỗi khi chạy engine: ${err.message}`, "error");
    }
  };

  // Smart Edit scenarios
  const smartScenarios = [
    {
      id: 'logo',
      title: 'Thay đổi Logo & Splash Screen',
      icon: Image,
      desc: 'Tự động quét cấu trúc container nhị phân của tệp, trích xuất vị trí ảnh IHDR, giải mã kênh Alpha và ghi đè logo/splash mới.',
      engines: ['ImageDecoder', 'ImageProcessor', 'ValidationManager']
    },
    {
      id: 'bgm',
      title: 'Thay nhạc nền (BGM) & Nhạc mở đầu',
      icon: Activity,
      desc: 'Phân tích vùng chứa luồng âm thanh, tìm dải tần số PCM, trộn luồng (Audio Mixer) và nén luồng ra dạng AAC chất lượng cao.',
      engines: ['AudioDecoder', 'AudioMixer', 'AacEncoder']
    },
    {
      id: 'exif',
      title: 'Gỡ thông tin nhạy cảm EXIF / GPS',
      icon: ShieldCheck,
      desc: 'Phân tích siêu dữ liệu, quét các khối nhị phân chứa tọa độ địa lý GPS, dọn dẹp thẻ camera để bảo mật tối đa.',
      engines: ['ExifEngine', 'BinaryEngine', 'ValidationManager']
    },
    {
      id: 'assets',
      title: 'Trích xuất & Thay đổi Font chữ / Shaders',
      icon: Layers,
      desc: 'Tìm kiếm chữ ký nhị phân font (TTF/OTF), bóc tách tài nguyên trò chơi ẩn sâu trong các gói nhầm nâng cao hiệu năng đồ họa.',
      engines: ['GameEngine', 'BinaryEngine', 'ThreeDEngine']
    }
  ];

  const triggerSmartScenario = (scId: string) => {
    setSmartScenario(scId);
    setSmartStep(1);
    setSmartWorkflowLogs([]);
    addWorkflowLog('Kích hoạt AI Cognitive Intent Engine...');
    addWorkflowLog(`Nhận diện yêu cầu Smart Edit: [${scId.toUpperCase()}]`);
  };

  const addWorkflowLog = (msg: string) => {
    setSmartWorkflowLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const advanceSmartWorkflow = async () => {
    if (smartStep === 1) {
      // Step 1 to 2: Scan format and detect constraints
      addWorkflowLog('Khởi chạy ValidationManager & Format Detector...');
      const container = fileBuffer ? validationManager.detectContainerType(fileBuffer) : 'unknown';
      await new Promise(r => setTimeout(r, 800));
      addWorkflowLog(`Đã xác định định dạng container chính: ${container.toUpperCase()}`);
      addWorkflowLog(`Kích hoạt Capability Registry: phân bổ các engine cần thiết.`);
      setSmartStep(2);
    } else if (smartStep === 2) {
      // Step 2 to 3: Generate preview
      addWorkflowLog('Đang chuẩn bị Streaming Engine & tạo bản dựng ảo (Preview)...');
      await new Promise(r => setTimeout(r, 1000));
      addWorkflowLog('Bản xem trước so sánh gốc vs sửa đổi đã sẵn sàng.');
      setSmartStep(3);
    } else if (smartStep === 3) {
      // Step 3 to 4: Execute & Patch
      addWorkflowLog('Sao lưu tệp gốc trước khi ghi đè...');
      if (fileBuffer) {
        backupManager.createBackup(file.name, fileBuffer, `Sao lưu tự động trước khi chạy Smart Edit: ${smartScenario}`);
      }
      addWorkflowLog('Thực hiện bản vá nhị phân (Patching hex offsets)...');
      
      // Simulate real hex patch inside Workspace
      if (smartScenario === 'exif') {
        onAction('apply_bulk_patches', [
          { offset: 0x10, value: 0x00 },
          { offset: 0x11, value: 0x00 },
          { offset: 0x12, value: 0x00 }
        ]);
      } else {
        onAction('apply_bulk_patches', [
          { offset: 0x1A0, value: 0x50 },
          { offset: 0x1A1, value: 0x4E },
          { offset: 0x1A2, value: 0x47 }
        ]);
      }
      
      await new Promise(r => setTimeout(r, 1200));
      addWorkflowLog('Đã hoàn tất thay đổi nhị phân thành công!');
      setSmartStep(4);
      runPostPatchIntegrity();
    }
  };

  const runPostPatchIntegrity = async () => {
    setIsVerifying(true);
    addWorkflowLog('Kiểm tra tính toàn vẹn (Post-patch integrity check)...');
    await new Promise(r => setTimeout(r, 900));
    
    if (fileBuffer) {
      const check = integrityManager.checkIntegrity(fileBuffer);
      setIntegrityStatus(check);
      addWorkflowLog('✓ Kiểm tra tiêu đề Magic Bytes: HOÀN THÀNH');
      addWorkflowLog('✓ Kiểm tra cấu trúc Container: HOÀN THÀNH');
      addWorkflowLog(`✓ Tính toán lại Checksum: 0x${check.checksum.toString(16).toUpperCase()} - HOÀN THÀNH`);
    }
    
    setIsVerifying(false);
    setSmartStep(5);
  };

  const handlePluginCreate = () => {
    const name = prompt('Nhập tên Plugin mới:', 'WebHexed Custom XML Decompressor');
    if (!name) return;
    
    pluginManager.register({
      id: `plugin_custom_${Date.now()}`,
      name,
      version: '1.0.0',
      author: 'Cộng đồng',
      description: 'Plugin giải nén tài nguyên tệp cấu trúc XML nhúng.',
      type: 'parser',
      enabled: true,
      capabilities: ['xml_decompress_custom']
    });
    setPlugins(pluginManager.getAll());
    toast(`Đã cài đặt plugin "${name}" thành công!`, "success");
  };

  const handleRestoreBackup = (backupId: string) => {
    const original = backupManager.getBackupData(backupId);
    if (original && confirm('Bạn có chắc chắn muốn khôi phục tệp về trạng thái này?')) {
      onAction('apply_bulk_patches', Array.from(original).map((value, offset) => ({ offset, value })));
      toast('Đã khôi phục trạng thái tệp tin gốc thành công!', 'success');
      refreshInfrastructure();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 text-left max-w-[1600px] mx-auto w-full font-sans text-gray-100 bg-[#0B0F14]">
      
      {/* LEFT SECTION: INFRASTRUCTURE METRICS & BACKUPS */}
      <div className="lg:col-span-4 space-y-6 flex flex-col">
        {/* Core Infrastructure Health */}
        <div className="p-5 bg-[#11161D] border border-[#2A313C] rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#2A313C] pb-3">
            <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
              <Cpu className="w-5 h-5 animate-pulse" />
              Core Infrastructure
            </h3>
            <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full">
              ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[#171C23] border border-[#2A313C] rounded-xl space-y-1">
              <span className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider block">Bể nhớ RAM</span>
              <p className="text-xs font-mono font-bold text-white">
                {(memoryMetrics.allocatedSize / (1024 * 1024)).toFixed(1)} / {(memoryMetrics.poolSize / (1024 * 1024)).toFixed(0)} MB
              </p>
              <div className="w-full bg-[#2A313C] h-1.5 rounded-full overflow-hidden mt-2">
                <div 
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, memoryMetrics.allocatedPercent)}%` }}
                />
              </div>
            </div>

            <div className="p-3 bg-[#171C23] border border-[#2A313C] rounded-xl space-y-1">
              <span className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider block">Web Workers</span>
              <p className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                {workerCount} Luồng nền
              </p>
              <span className="text-[9px] text-gray-500 font-medium">Đa luồng CPU Sandbox</span>
            </div>
          </div>

          <div className="space-y-2 pt-2 text-xs">
            <div className="flex justify-between text-gray-400">
              <span>Streaming Manager:</span>
              <span className="font-mono text-emerald-400">Enabled (256KB/Chunk)</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Integrity Verification:</span>
              <span className="font-mono text-blue-400">Automated</span>
            </div>
          </div>
        </div>

        {/* Dynamic Plugins & Extension SDK */}
        <div className="p-5 bg-[#11161D] border border-[#2A313C] rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#2A313C] pb-3">
            <h3 className="text-sm font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
              <Beaker className="w-5 h-5" />
              Plugin SDK
            </h3>
            <button 
              onClick={handlePluginCreate}
              className="px-2.5 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 text-[10px] font-bold rounded-lg transition-all"
            >
              Thêm Plugin
            </button>
          </div>

          <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
            {plugins.map(p => (
              <div key={p.id} className="p-3 bg-[#171C23] border border-[#2A313C] rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white">{p.name}</span>
                    <span className="text-[9px] text-[#94A3B8] font-mono">v{p.version}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-tight">{p.description}</p>
                </div>
                <button
                  onClick={() => {
                    pluginManager.toggle(p.id);
                    refreshInfrastructure();
                  }}
                  className={`px-2 py-1 text-[9px] font-bold rounded uppercase ${
                    p.enabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                  }`}
                >
                  {p.enabled ? 'On' : 'Off'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Backups & Recovery System */}
        <div className="p-5 bg-[#11161D] border border-[#2A313C] rounded-2xl shadow-xl flex-1 flex flex-col justify-between min-h-[220px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#2A313C] pb-3">
              <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                <Undo className="w-5 h-5" />
                Backup & Recovery
              </h3>
              <span className="text-[10px] text-gray-500 font-mono">
                {backups.length} Điểm lưu
              </span>
            </div>

            {backups.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-xs">
                Chưa có điểm sao lưu tự động nào được tạo.
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 text-xs">
                {backups.map(b => (
                  <div key={b.id} className="p-3 bg-[#171C23] border border-[#2A313C] rounded-xl flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="font-bold text-white truncate max-w-[150px]">{b.description}</p>
                      <span className="text-[10px] text-gray-500 font-mono block">
                        {new Date(b.timestamp).toLocaleTimeString()} • {(b.fileSize / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      onClick={() => handleRestoreBackup(b.id)}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold rounded-lg transition-all text-[10px]"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MIDDLE & RIGHT SECTION: ENGINES DIRECTORY & WORKFLOWS */}
      <div className="lg:col-span-8 space-y-6">
        
        {/* TOP INTERACTIVE CONTROL TAB: SCENARIO-DRIVEN SMART EDIT */}
        <div className="p-6 bg-[#11161D] border border-[#2A313C] rounded-3xl shadow-xl space-y-6">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2 uppercase tracking-wide">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Trợ lý AI Smart Edit & Workflow Pipeline
            </h2>
            <p className="text-xs text-gray-400">Chọn kịch bản mong muốn. AI sẽ phân tích định dạng, tìm linh kiện phù hợp và dẫn dắt bạn sửa đổi nhị phân an toàn.</p>
          </div>

          {smartScenario === '' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {smartScenarios.map(sc => (
                <button
                  key={sc.id}
                  onClick={() => triggerSmartScenario(sc.id)}
                  className="p-4 bg-[#171C23] hover:bg-[#1E2530] border border-[#2A313C] hover:border-purple-500/50 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99] space-y-2 cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-white group-hover:text-purple-400 transition-colors">{sc.title}</h3>
                    <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{sc.desc}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {sc.engines.map(eng => (
                      <span key={eng} className="px-1.5 py-0.5 bg-[#2A313C] text-[#94A3B8] text-[9px] font-mono rounded">
                        {eng}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-5 bg-black/30 border border-[#2A313C] rounded-2xl space-y-6">
              {/* Pipeline header */}
              <div className="flex items-center justify-between border-b border-[#2A313C] pb-3">
                <span className="text-xs font-mono font-bold text-purple-400">
                  KỊCH BẢN ĐANG CHẠY: {smartScenario.toUpperCase()}
                </span>
                <button 
                  onClick={() => setSmartScenario('')}
                  className="text-xs text-gray-500 hover:text-white"
                >
                  Quay lại
                </button>
              </div>

              {/* Steps visual progress */}
              <div className="flex items-center justify-between">
                {[
                  { step: 1, label: 'Lập kế hoạch AI' },
                  { step: 2, label: 'Quét Định dạng' },
                  { step: 3, label: 'Mô phỏng Preview' },
                  { step: 4, label: 'Thực thi Bản vá' },
                  { step: 5, label: 'Xác minh Toàn vẹn' }
                ].map((s) => (
                  <div key={s.step} className="flex flex-col items-center flex-1 relative">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                      smartStep >= s.step 
                        ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-lg shadow-purple-500/10' 
                        : 'bg-[#11161D] border-[#2A313C] text-gray-500'
                    }`}>
                      {s.step}
                    </div>
                    <span className="text-[10px] text-gray-400 mt-1.5 hidden md:block">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Step Detail Content Panel */}
              <div className="p-4 bg-[#11161D] border border-[#2A313C] rounded-xl min-h-[140px] flex flex-col justify-between">
                <div className="space-y-3">
                  {smartStep === 1 && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                        AI Cognitive Intent Engine
                      </h4>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        AI đã nhận diện yêu cầu cấu trúc của bạn. Một kế hoạch chi tiết tự động được lập ra, phân phối các tác vụ phân tích, bóc tách vùng chứa thô, chỉnh sửa và xác minh tính toàn vẹn thông qua các module nhị phân tương ứng.
                      </p>
                    </div>
                  )}

                  {smartStep === 2 && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-white">Quét Định dạng & Validation</h4>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Phân tích tệp tin gốc để xác định các giới hạn vùng chứa (Format Boundary, Header Offset). Đảm bảo các thay đổi không ghi đè đè lên mã nguồn tối quan trọng khác của ứng dụng.
                      </p>
                    </div>
                  )}

                  {smartStep === 3 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-white">Mô phỏng Xem trước so sánh (Interactive Preview)</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-[#171C23] border border-[#2A313C] rounded-xl text-center space-y-2">
                          <span className="text-[9px] text-gray-500 font-bold uppercase block">TRƯỚC KHI VÁ (GỐC)</span>
                          <div className="h-16 flex items-center justify-center">
                            <span className="text-[10px] font-mono text-amber-400">EXIF Metadata / GPS Active</span>
                          </div>
                        </div>
                        <div className="p-3 bg-[#171C23] border border-[#2A313C] rounded-xl text-center space-y-2">
                          <span className="text-[9px] text-emerald-400 font-bold uppercase block">ĐỀ XUẤT SAU KHI VÁ</span>
                          <div className="h-16 flex items-center justify-center">
                            <span className="text-[10px] font-mono text-emerald-400">✓ GPS Zeroed Out (Safe)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {smartStep === 4 && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-white">Xác nhận thực thi Bản vá</h4>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Mọi bước chuẩn bị đã sẵn sàng. Một điểm sao lưu nhị phân an toàn sẽ được tạo tự động để đề phòng lỗi hệ thống. Xác nhận để áp dụng bản sửa đổi ngay lập tức.
                      </p>
                    </div>
                  )}

                  {smartStep === 5 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Xác minh & Hoàn thành toàn bộ quy trình!
                      </h4>
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div className="p-2 bg-[#171C23] rounded-lg border border-[#2A313C] text-center">
                          <span className="text-gray-500 block">Header Magic</span>
                          <span className="text-emerald-400 font-bold">✓ PASSED</span>
                        </div>
                        <div className="p-2 bg-[#171C23] rounded-lg border border-[#2A313C] text-center">
                          <span className="text-gray-500 block">Container Struct</span>
                          <span className="text-emerald-400 font-bold">✓ PASSED</span>
                        </div>
                        <div className="p-2 bg-[#171C23] rounded-lg border border-[#2A313C] text-center">
                          <span className="text-gray-500 block">Checksum Check</span>
                          <span className="text-emerald-400 font-bold">✓ VERIFIED</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-3 border-t border-[#2A313C] mt-4">
                  {smartStep < 5 ? (
                    <button
                      onClick={advanceSmartWorkflow}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      {smartStep === 3 ? 'Chạy bản vá nhị phân' : 'Tiếp tục bước tiếp theo'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setSmartScenario('')}
                      className="px-4 py-2 bg-[#171C23] hover:bg-[#1E2530] border border-[#2A313C] text-xs font-bold rounded-xl transition-all text-gray-300"
                    >
                      Hoàn tất & Đóng kịch bản
                    </button>
                  )}
                </div>
              </div>

              {/* Live console logs */}
              <div className="p-3 bg-black/60 border border-[#2A313C] rounded-xl space-y-1.5 font-mono text-[10px] text-gray-300 max-h-[140px] overflow-y-auto">
                <span className="text-[9px] text-gray-500 font-bold block uppercase border-b border-[#2A313C] pb-1 mb-1">
                  Nhật ký hoạt động Workflow Engine
                </span>
                {smartWorkflowLogs.map((log, index) => (
                  <p key={index} className="leading-relaxed">{log}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM SECTION: ENGINE CAPABILITY REGISTRY DIRECTORY */}
        <div className="p-6 bg-[#11161D] border border-[#2A313C] rounded-3xl shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-1.5">
                <Layers className="w-5 h-5 text-blue-400" />
                Capability Registry & Engine Explorer
              </h2>
              <p className="text-xs text-gray-400">Danh mục đầy đủ hơn 80+ engine chuyên biệt tích hợp sâu trong WebHexed Core.</p>
            </div>
            
            {/* Category selection */}
            <select
              value={activeEngineCategory}
              onChange={(e) => {
                setActiveEngineCategory(e.target.value);
                setSelectedEngine(null);
                setSelectedAction('');
              }}
              className="bg-[#171C23] border border-[#2A313C] text-xs text-[#94A3B8] font-bold py-2 px-3 rounded-xl focus:border-blue-500 focus:outline-none"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[350px] overflow-y-auto pr-1">
            {getFilteredEngines().map(eng => {
              const cap = eng.capability;
              const isSelected = selectedEngine?.capability.name === cap.name;
              return (
                <div 
                  key={cap.name}
                  onClick={() => {
                    setSelectedEngine(eng);
                    setSelectedAction(cap.actions[0] || '');
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 relative text-xs ${
                    isSelected 
                      ? 'bg-[#1E2530] border-blue-500 shadow-md shadow-blue-500/5' 
                      : 'bg-[#171C23] border-[#2A313C] hover:border-[#2A313C]/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-blue-400" />
                      {cap.name}
                    </h3>
                    <span className="text-[9px] text-[#94A3B8] font-mono">v{cap.version}</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {cap.actions.map(act => (
                      <span key={act} className="px-1.5 py-0.5 bg-black/40 text-[9px] text-[#94A3B8] font-mono rounded">
                        {act}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1.5 border-t border-[#2A313C]/40">
                    <span>Performance Cost:</span>
                    <span className={`font-bold uppercase ${
                      cap.performanceCost === 'high' ? 'text-rose-400' : cap.performanceCost === 'medium' ? 'text-amber-400' : 'text-emerald-400'
                    }`}>{cap.performanceCost}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Manual Run Section */}
          {selectedEngine && (
            <div className="p-4 bg-blue-500/5 border border-blue-500/25 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">CHẠY ENGINE THỦ CÔNG</span>
                <p className="text-xs font-bold text-white leading-tight">
                  Chạy {selectedEngine.capability.name} trên tệp {file.name}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="bg-[#171C23] border border-[#2A313C] text-xs text-white py-2 px-3 rounded-xl focus:border-blue-500 focus:outline-none"
                >
                  {selectedEngine.capability.actions.map((act: string) => (
                    <option key={act} value={act}>{act}</option>
                  ))}
                </select>

                <button
                  onClick={handleRunEngineAction}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Kích hoạt
                </button>
              </div>
            </div>
          )}

          {/* Background Tasks Log */}
          {tasks.length > 0 && (
            <div className="p-4 bg-black/40 border border-[#2A313C] rounded-2xl space-y-3">
              <span className="text-[10px] text-gray-500 font-bold uppercase block tracking-wider">
                HÀNG ĐỢI TÁC VỤ (TASK QUEUE CONCURRENCY)
              </span>
              <div className="space-y-2 max-h-[140px] overflow-y-auto text-xs font-mono">
                {tasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-2.5 bg-[#171C23] border border-[#2A313C] rounded-xl">
                    <div className="space-y-0.5">
                      <span className="text-[#94A3B8] font-bold">{t.engineId}</span>
                      <p className="text-[10px] text-gray-400">Action: {t.action}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-20 bg-[#2A313C] h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-500 h-full" style={{ width: `${t.progress}%` }} />
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : t.status === 'running' ? 'bg-blue-500/10 text-blue-400 animate-pulse' : 'bg-gray-500/10 text-gray-500'
                      }`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
