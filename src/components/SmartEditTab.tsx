import React, { useRef, useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Image as ImageIcon, Music, Film, FileText, Database, Package, 
  Edit2, Upload, AlertCircle, Save, Sparkles, Search, Sliders, Play, 
  Code, Hexagon, Calendar, Link2, MapPin, Camera, Settings, Mail, X, Plus
} from 'lucide-react';
import { AnalysisResult } from '../utils/fileAnalyzer';
import { useUI } from './UIProvider';

interface SmartEditTabProps {
  file: File;
  virtualFileSize: number;
  analysis: AnalysisResult | null;
  patches?: Map<number, number>;
  onApplyPatch: (offset: number, value: number) => void;
  onApplyPatches?: (patches: { offset: number, value: number }[]) => void;
  onNavigateTab?: (tab: string) => void;
  onJumpToOffset?: (offset: number) => void;
}

// Utility to overlay active patches onto original text in real-time
const getPatchedString = (offset: number, size: number, originalText: string, patches: Map<number, number>): string => {
  if (size <= 0) return originalText;
  let hasPatch = false;
  for (let i = 0; i < size; i++) {
    if (patches.has(offset + i)) {
      hasPatch = true;
      break;
    }
  }
  if (!hasPatch) return originalText;

  const bytes = new Uint8Array(size);
  const encoder = new TextEncoder();
  const origBytes = encoder.encode(originalText);
  for (let i = 0; i < size; i++) {
    if (patches.has(offset + i)) {
      bytes[i] = patches.get(offset + i)!;
    } else if (i < origBytes.length) {
      bytes[i] = origBytes[i];
    } else {
      bytes[i] = 0;
    }
  }
  try {
    return new TextDecoder().decode(bytes);
  } catch (e) {
    return originalText;
  }
};

// Helper Component for Lazy Resource Preview
function ResourcePreview({ item, file }: { item: any, file: File }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);

  React.useEffect(() => {
    let url: string | null = null;
    let isMounted = true;

    if (item.offset !== undefined && item.size && item.size > 0 && item.size < 50 * 1024 * 1024) { // Limit to 50MB for preview safety
      const slice = file.slice(item.offset, item.offset + item.size);
      
      if (['image', 'audio', 'video'].includes(item.type)) {
        url = URL.createObjectURL(slice);
        setBlobUrl(url);
      } else if (['text', 'json', 'xml'].includes(item.type) && item.size < 100 * 1024) {
        // Read text preview
        slice.text().then(txt => {
          if (isMounted) setTextPreview(txt.substring(0, 500) + (txt.length > 500 ? '...' : ''));
        }).catch(() => {});
      }
    }

    return () => {
      isMounted = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item, file]);

  if (item.type === 'image' && blobUrl) {
    return (
      <div className="mb-4 bg-black/40 rounded-xl overflow-hidden border border-white/5 flex items-center justify-center h-24">
        <img src={blobUrl} className="max-h-full object-contain" alt={item.name} />
      </div>
    );
  }

  if (item.type === 'video' && blobUrl) {
    return (
      <div className="mb-4 bg-black/40 rounded-xl overflow-hidden border border-white/5 h-24 relative group">
        <video src={blobUrl} className="w-full h-full object-cover" controls preload="metadata" />
      </div>
    );
  }

  if (item.type === 'audio' && blobUrl) {
    return (
      <div className="mb-4 bg-black/40 rounded-xl p-2 border border-white/5">
        <audio src={blobUrl} controls className="w-full h-8 outline-none" />
      </div>
    );
  }

  if (textPreview) {
    return (
      <div className="mb-4 bg-black/40 p-2.5 rounded-xl border border-white/5 overflow-y-auto max-h-24 custom-scrollbar">
        <pre className="text-[9px] text-white/70 font-mono whitespace-pre-wrap">{textPreview}</pre>
      </div>
    );
  }

  // Fallback to text details
  if (item.details) {
    return (
      <div className="text-[10px] text-white/70 mb-4 bg-black/30 p-2.5 rounded-xl font-mono truncate border border-white/5 group-hover:border-white/10 transition-colors">
        {item.details}
      </div>
    );
  }
  
  return null;
}

function TextEditModal({ 
  item, 
  onClose, 
  onSave 
}: { 
  item: any; 
  onClose: () => void; 
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(item.details || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setText(content);
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60  p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-[#111111] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
          <h3 className="text-sm font-bold text-white flex items-center">
            <Edit2 className="w-4 h-4 mr-2 text-blue-400" />
            Sửa nội dung: {item.name}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4 flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-64 bg-black/40 border border-white/10 rounded-xl p-4 text-xs text-white/90 font-mono focus:outline-none focus:border-blue-500/50 focus:bg-blue-900/10 transition-colors resize-none custom-scrollbar"
            placeholder="Nhập nội dung vào đây..."
          />
        </div>
        
        <div className="p-4 border-t border-white/5 bg-white/5 flex items-center justify-between">
          <div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".txt,.json,.xml,.csv,.md,*/*"
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded-xl text-xs font-bold transition-colors flex items-center cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Nhập từ tệp (Import File)
            </button>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-transparent hover:bg-white/5 text-white/50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button 
              onClick={() => onSave(text)}
              className="px-6 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold transition-colors flex items-center cursor-pointer shadow-lg shadow-blue-900/20"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Lưu thay đổi
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// 2. Special Case: ISO / Disk Image View
function ISOTreeView({ analysis }: { analysis: AnalysisResult }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const rootStructure = analysis.structure.find(s => s.name === 'Root Directory Table');
    if (rootStructure) {
      setLoading(true);
      // Simulate reading directory table
      
      setTimeout(() => {
        setItems([
          { name: 'BOOT', type: 'folder', size: 0, date: '2024-01-01', children: [] },
          { name: 'EFI', type: 'folder', size: 0, date: '2024-01-01' },
          { name: 'SOURCES', type: 'folder', size: 0, date: '2024-01-01' },
          { name: 'README.TXT', type: 'file', size: 1024, date: '2024-01-01' },
          { name: 'AUTORUN.INF', type: 'file', size: 128, date: '2024-01-01' },
          { name: 'SETUP.EXE', type: 'file', size: 1540200, date: '2024-01-01' }
        ]);
        setLoading(false);
      }, 500);
    }
  }, [analysis]);

  return (
    <div className="space-y-4">
      <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-2xl flex items-center space-x-4">
        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
          <Hexagon className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-tight">
            {analysis.metadata.find(m => m.key === 'iso_label')?.value || 'Optical Disc Image'}
          </h3>
          <p className="text-[10px] text-white/40 font-mono">
            Standard: {analysis.metadata.find(m => m.key === 'iso_standard')?.value || 'ISO 9660'}
          </p>
        </div>
      </div>

      <div className="bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-4 py-2 border-b border-white/5 bg-white/5 flex justify-between items-center">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Directory Tree (Lazy Load)</span>
          <span className="text-[9px] font-mono text-purple-400">Root LBA: {analysis.metadata.find(m => m.key === 'iso_root_lba')?.value || '0x10'}</span>
        </div>
        <div className="p-2 space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="py-8 text-center text-white/20 text-xs animate-pulse">Đang nạp danh sách tệp tin...</div>
          ) : (
            items.map((item, idx) => (
              <div key={idx} className="group flex items-center justify-between p-2 hover:bg-white/5 rounded-xl transition-colors cursor-pointer">
                <div className="flex items-center space-x-3">
                  {item.type === 'folder' ? <Package className="w-4 h-4 text-amber-400/60" /> : <FileText className="w-4 h-4 text-blue-400/60" />}
                  <span className="text-xs text-white/70 group-hover:text-white transition-colors">{item.name}</span>
                </div>
                <div className="flex items-center space-x-4 text-[10px] font-mono text-white/30">
                  {item.size > 0 && <span>{(item.size / 1024).toFixed(1)} KB</span>}
                  <span>{item.date}</span>
                  <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function SmartEditTab({ file, virtualFileSize, analysis, patches, onApplyPatch, onApplyPatches, onNavigateTab, onJumpToOffset }: SmartEditTabProps) {
  const { toast } = useUI();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(500);

  const handleSmartReplace = (e: React.ChangeEvent<HTMLInputElement>, item: any) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    toast(`Đang đọc dữ liệu thay thế cho ${item.name}...`, 'info');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        const patchList: { offset: number, value: number }[] = [];
        for (let i = 0; i < bytes.length; i++) {
          patchList.push({ offset: item.offset + i, value: bytes[i] });
        }
        if (onApplyPatches) {
          onApplyPatches(patchList);
        } else {
          for (let i = 0; i < bytes.length; i++) {
            onApplyPatch(item.offset + i, bytes[i]);
          }
        }
        toast(`✓ Đã thay thế [${item.name}] bằng tệp mới (${bytes.length} bytes) thành công!`, 'success');
      } catch (err) {
        toast('Lỗi khi áp dụng bản vá thay thế!', 'error');
      }
    };
    reader.onerror = () => {
      toast('Lỗi khi đọc tệp tin thay thế!', 'error');
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const handleTextSave = (text: string) => {
    if (!editingItem) return;
    
    toast(`Đang áp dụng thay đổi văn bản cho ${editingItem.name}...`, 'info');
    try {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(text);
      const patchList: { offset: number, value: number }[] = [];
      for (let i = 0; i < bytes.length; i++) {
        patchList.push({ offset: editingItem.offset + i, value: bytes[i] });
      }
      if (onApplyPatches) {
        onApplyPatches(patchList);
      } else {
        for (let i = 0; i < bytes.length; i++) {
          onApplyPatch(editingItem.offset + i, bytes[i]);
        }
      }
      toast(`✓ Đã lưu thay đổi cho [${editingItem.name}] thành công! (${bytes.length} bytes)`, 'success');
      setEditingItem(null);
    } catch (err) {
      toast('Lỗi khi lưu thay đổi văn bản!', 'error');
    }
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'image': return <ImageIcon className="w-5 h-5 text-pink-400" />;
      case 'audio': return <Music className="w-5 h-5 text-blue-400" />;
      case 'video': return <Film className="w-5 h-5 text-purple-400" />;
      case 'text': return <FileText className="w-5 h-5 text-green-400" />;
      case 'database': return <Database className="w-5 h-5 text-orange-400" />;
      case 'compressed': return <Package className="w-5 h-5 text-yellow-400" />;
      case 'date': return <Calendar className="w-5 h-5 text-emerald-400" />;
      case 'gps': return <MapPin className="w-5 h-5 text-red-400" />;
      case 'camera': return <Camera className="w-5 h-5 text-sky-400" />;
      case 'config': return <Settings className="w-5 h-5 text-gray-400" />;
      case 'url': return <Link2 className="w-5 h-5 text-blue-300" />;
      case 'email': return <Mail className="w-5 h-5 text-orange-300" />;
      default: return <Hexagon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getActionLabel = (type: string) => {
    switch(type) {
      case 'image': return 'Thay ảnh (Replace)';
      case 'audio': return 'Thay âm thanh';
      case 'video': return 'Thay video';
      case 'text': return 'Sửa văn bản';
      case 'database': return 'Sửa Database';
      case 'config': return 'Sửa Config';
      case 'url': return 'Đổi Link';
      case 'email': return 'Đổi Email';
      case 'date': return 'Sửa Ngày giờ';
      default: return 'Chỉnh sửa (Edit)';
    }
  };

  // Compile items from analysis result
  const { allItems, filteredItems } = useMemo(() => {
    if (!analysis) return { allItems: [], filteredItems: [] };
    
    let items: any[] = [];
    const patchesMap = patches || new Map<number, number>();
    
    // 1. Map Embedded items
    if (analysis.embeddedItems) {
      items = items.concat(analysis.embeddedItems.map(m => {
        const offset = m.offset;
        const size = m.size;
        const patchedDetails = getPatchedString(offset, size, m.details || '', patchesMap);
        return {
          id: m.id,
          name: m.name,
          type: m.type,
          offset: offset,
          size: size,
          details: patchedDetails,
          category: 'embedded'
        };
      }));
    }

    // 2. Map Metadata
    if (analysis.metadata) {
      items = items.concat(analysis.metadata.map((m, idx) => {
        let type = 'config';
        if (m.key.toLowerCase().includes('date') || m.key.toLowerCase().includes('time')) type = 'date';
        if (m.key.toLowerCase().includes('gps') || m.key.toLowerCase().includes('location')) type = 'gps';
        if (m.key.toLowerCase().includes('camera') || m.key.toLowerCase().includes('lens')) type = 'camera';
        
        const offset = m.offset || 0;
        const size = m.value?.length || 0;
        const patchedDetails = getPatchedString(offset, size, m.value || '', patchesMap);

        return {
          id: `meta_${idx}`,
          name: m.label,
          type: type,
          offset: offset,
          size: size,
          details: patchedDetails,
          category: 'metadata'
        };
      }));
    }

    // 3. Map All Strings
    if (analysis.strings) {
      items = items.concat(analysis.strings.map((s, idx) => {
        const offset = s.offset;
        const size = s.value.length;
        const patchedDetails = getPatchedString(offset, size, s.value, patchesMap);

        return {
          id: `str_${idx}`,
          name: s.type === 'general' ? `String at 0x${s.offset.toString(16).toUpperCase()}` : `${s.type.toUpperCase()} String`,
          type: s.type === 'url' ? 'url' : s.type === 'email' ? 'email' : 'text',
          offset: offset,
          size: size,
          details: patchedDetails,
          category: 'strings'
        };
      }));
    }

    const all = items;
    let filtered = items;

    // Filter by Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.type.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.details && item.details.toLowerCase().includes(q))
      );
    }

    // Filter by Category
    if (activeCategory !== 'all') {
      filtered = filtered.filter(item => {
        if (activeCategory === 'media') return ['image', 'audio', 'video'].includes(item.type);
        if (activeCategory === 'text') return ['text', 'config', 'url', 'email', 'date'].includes(item.type);
        if (activeCategory === 'data') return ['database', 'compressed'].includes(item.type) || item.category === 'embedded';
        return item.category === activeCategory;
      });
    }

    return { allItems: all, filteredItems: filtered };
  }, [analysis, searchQuery, activeCategory, patches]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, visibleLimit);
  }, [filteredItems, visibleLimit]);

  return (
    <div className="space-y-6 pb-20 font-sans">
      <div className="bg-[#121829] border border-white/5 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center">
              <Sparkles className="w-5 h-5 text-purple-400 mr-2" />
              Smart File Editor (Visual Explorer)
            </h3>
            <p className="text-xs text-white/40">
              Tìm thấy <span className="text-purple-400 font-bold">{allItems.length.toLocaleString()}</span> tài nguyên & chuỗi văn bản trong tệp.
            </p>
          </div>
          {filteredItems.length > 0 && (
            <div className="text-[10px] bg-white/5 px-2 py-1 rounded-lg border border-white/5 text-white/40">
              Đang hiện {Math.min(visibleItems.length, filteredItems.length).toLocaleString()} / {filteredItems.length.toLocaleString()}
            </div>
          )}
        </div>
        
        <p className="text-xs text-white/30 mb-6 italic">
          * Đã quét toàn bộ file. Kết quả được phân loại theo Metadata, Strings và Embedded Assets.
        </p>

        {/* Smart Search Bar */}
        <div className="relative mb-6">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-white/30" />
          </div>
          <input
            type="text"
            placeholder="Tìm kiếm: image, audio, date, url, config, tên..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleLimit(500); // Reset limit on search
            }}
            className="w-full pl-11 pr-4 py-3.5 bg-black/40 border border-white/10 rounded-2xl text-xs font-medium text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-purple-900/10 transition-all shadow-inner"
          />
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'media', label: '🖼 Media' },
            { id: 'metadata', label: '⚙ Metadata' },
            { id: 'strings', label: '🔤 Strings' },
            { id: 'data', label: '🗄 Data' }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setVisibleLimit(500); // Reset limit on category change
              }}
              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                  : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Special ISO View if detected */}
        {analysis && analysis.fileType.includes('ISO') && (
          <div className="mb-6">
            <ISOTreeView analysis={analysis} />
          </div>
        )}

        {/* Raw Scan Mode Warning Banner */}
        {analysis && analysis.isRawScanMode && (
          <div className="mb-6 p-4 bg-amber-950/20 border border-amber-500/30 rounded-2xl flex items-start space-x-3.5">
            <AlertCircle className="w-5.5 h-5.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-200 uppercase tracking-wide">⚠️ Chế độ Quét Thô (Raw Scan Mode Enabled)</h4>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Phân hệ phân tích cấu trúc nâng cao không khả dụng cho tệp tin này hoặc gặp lỗi cấu trúc: <span className="font-mono text-[11px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{analysis.rawScanWarning || 'Không xác định'}</span>.
                Hệ thống đã tự động chuyển sang chế độ Quét thô (Raw Scan Mode) để dò tìm chữ ký nhị phân, cấu trúc vùng nhớ, entropy phân đoạn, trích xuất Strings và rà soát luật YARA.
              </p>
            </div>
          </div>
        )}

        {/* Fallback Professional Mode Notice */}
        <div className="mb-6 p-4 bg-sky-900/10 border border-sky-500/20 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start">
            <Hexagon className="w-5 h-5 text-sky-400 mr-3 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-sky-100">Chế độ chuyên nghiệp (Fallback)</h4>
              <p className="text-xs text-sky-300/70 mt-1">Nếu có phân vùng Engine chưa phân tích được, bạn luôn có thể can thiệp thủ công.</p>
            </div>
          </div>
          <div className="flex space-x-2 shrink-0">
            <button 
              onClick={() => onNavigateTab?.('advanced')}
              className="px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Mở Hex Editor
            </button>
            <button 
              onClick={() => onNavigateTab?.('strings')}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Mở Strings
            </button>
          </div>
        </div>

        {/* Results Grid */}
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-black/20 rounded-2xl border border-white/5 border-dashed">
            <AlertCircle className="w-10 h-10 text-white/20 mb-3" />
            <p className="text-sm font-medium text-white/40">Không tìm thấy tài nguyên nào phù hợp.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[800px] overflow-y-auto custom-scrollbar pr-2 pb-4">
              <AnimatePresence mode="popLayout">
                {visibleItems.map((item, idx) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    key={`${item.id}_${idx}`}
                    className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col hover:bg-white/10 transition-colors group relative overflow-hidden h-fit"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-2xl rounded-full pointer-events-none" />
                    
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3 w-full pr-2">
                        <div className="p-2 bg-black/40 rounded-xl shadow-inner shrink-0">
                          {getIcon(item.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-[11px] font-bold text-white/90 truncate" title={item.name}>{item.name}</h4>
                            <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              item.category === 'metadata' ? 'bg-orange-500/20 text-orange-400' :
                              item.category === 'strings' ? 'bg-blue-500/20 text-blue-400' :
                              item.category === 'embedded' ? 'bg-purple-500/20 text-purple-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {item.category === 'metadata' ? 'Meta' : item.category === 'strings' ? 'String' : item.category === 'embedded' ? 'Data' : 'Item'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 mt-0.5">
                            <span className="text-[8px] text-white/20 font-mono">
                              0x{item.offset?.toString(16).toUpperCase()}
                            </span>
                            <span className="text-[8px] text-white/10">•</span>
                            <span className="text-[8px] text-white/20 font-mono">
                              {item.size ? `${item.size} bytes` : 'unknown size'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Smart Preview Area */}
                    <ResourcePreview item={item} file={file} />

                    {/* Smart Actions - Unified Single Button */}
                    <div className="mt-auto pt-2">
                      {['text', 'url', 'email', 'config', 'date'].includes(item.type) ? (
                        <button 
                          onClick={() => setEditingItem(item)}
                          className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center"
                        >
                          <Edit2 className="w-3 h-3 mr-2" />
                          {getActionLabel(item.type)}
                        </button>
                      ) : (
                        <label className="block cursor-pointer">
                          <input 
                            type="file" 
                            className="hidden" 
                            accept={item.type === 'image' ? 'image/*' : item.type === 'audio' ? 'audio/*' : item.type === 'video' ? 'video/*' : '*/*'}
                            onChange={(e) => handleSmartReplace(e, item)}
                          />
                          <div className="w-full py-2 bg-purple-600/20 hover:bg-purple-500 text-purple-300 hover:text-white rounded-xl text-[10px] font-bold text-center border border-purple-500/30 transition-all flex items-center justify-center shadow-lg shadow-purple-900/20">
                            <Upload className="w-3 h-3 mr-2" />
                            {getActionLabel(item.type)}
                          </div>
                        </label>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {filteredItems.length > visibleLimit && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => setVisibleLimit(prev => prev + 1000)}
                  className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 rounded-2xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer shadow-lg active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Hiện thêm 1.000 kết quả ({ (filteredItems.length - visibleLimit).toLocaleString() } còn lại)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editingItem && (
          <TextEditModal
            item={editingItem}
            onClose={() => setEditingItem(null)}
            onSave={handleTextSave}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

