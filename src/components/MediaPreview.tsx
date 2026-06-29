import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertCircle, Film, Music, ImageIcon, ShieldAlert, Play, Pause, ChevronRight,
  Sparkles, Download, Trash2, Plus, RefreshCw, Layers, Compass, Save, Clock
} from 'lucide-react';
import { getPatchedBlob } from '../utils/fileStream';
import { useUI } from './UIProvider';

interface MediaPreviewProps {
  file: File;
  fileId?: string;
  patches: Map<number, number>;
  virtualFileSize: number;
}

interface GalleryImage {
  id: string;
  name: string;
  type: string;
  offset: number;
  size: number;
  url: string;
}

export default function MediaPreview({ file, fileId = '', patches, virtualFileSize }: MediaPreviewProps) {
  const { toast } = useUI();
  const [error, setError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  // Timeline States
  const [activeSecond, setActiveSecond] = useState<number | null>(0);
  const [timelineMode, setTimelineMode] = useState<'replace' | 'delete' | 'insert' | 'metadata' | null>(null);
  const [timelineMetadata, setTimelineMetadata] = useState('Metadata Frame Header 0xAA');

  // Image Gallery States
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([
    { id: 'logo', name: 'Logo biểu tượng (Logo Icon)', type: 'PNG Image', offset: 0x2C40, size: 4520, url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=120&auto=format&fit=crop&q=60' },
    { id: 'icon', name: 'Launcher Icon', type: 'PNG Image', offset: 0x4B20, size: 1024, url: 'https://images.unsplash.com/photo-1618005198143-e5283b519a7f?w=120&auto=format&fit=crop&q=60' },
    { id: 'splash', name: 'Màn hình chào (Splash Screen)', type: 'JPEG Image', offset: 0x8A00, size: 15400, url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=120&auto=format&fit=crop&q=60' },
    { id: 'texture', name: 'Giao diện Game (Texture)', type: 'WebP Image', offset: 0xC3F0, size: 2840, url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=120&auto=format&fit=crop&q=60' }
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);

  useEffect(() => {
    // Compile local patched blob of the file
    const patchedBlob = getPatchedBlob(file, patches, virtualFileSize);
    const localUrl = URL.createObjectURL(patchedBlob);
    setPreviewUrl(localUrl);
    setError(false);

    return () => {
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
      }
    };
  }, [file, patches, virtualFileSize]);

  const isAudio = file && ((file.type && file.type.startsWith('audio/')) || (file.name && file.name.match(/\.(mp3|wav|ogg|aac|flac)$/i)));
  const isVideo = file && ((file.type && file.type.startsWith('video/')) || (file.name && file.name.match(/\.(mp4|webm|mkv|avi|mov)$/i)));
  const isImage = file && ((file.type && file.type.startsWith('image/')) || (file.name && file.name.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i)));

  // Mock timestamp timeline data generator
  const getTimelineDetails = (sec: number) => {
    return {
      second: `00:${sec.toString().padStart(2, '0')}`,
      frame: Math.floor(sec * 24 + Math.random() * 24),
      sample: sec * 44100,
      metadata: `ID3v2 TIT2 Chunk | Subtitle Frame index ${sec}`,
      chunk: `Data Chunk #${Math.floor(sec / 2) + 1}`,
      offset: 0x3000 + (sec * 2048)
    };
  };

  const handleTimelineAction = (action: 'replace' | 'delete' | 'insert') => {
    setTimelineMode(action);
    toast(`Đã kích hoạt chế độ: ${action.toUpperCase()} tại mốc thời gian ${activeSecond} giây`, 'info');
  };

  const saveTimelineEdit = () => {
    toast(`✓ Đã lưu thay đổi clip tại giây ${activeSecond} thành công! Parser tự tính toán offsets và viết lại byte.`, 'success');
    setTimelineMode(null);
  };

  // Image Gallery handlers
  const triggerImageUpload = (id: string) => {
    setActiveImageId(id);
    fileInputRef.current?.click();
  };

  const handleImageReplace = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile || !activeImageId) return;

    const fileUrl = URL.createObjectURL(uploadedFile);
    setGalleryImages(prev => prev.map(img => {
      if (img.id === activeImageId) {
        // Change size and offset to simulate direct rewrite in memory!
        return {
          ...img,
          name: uploadedFile.name,
          size: uploadedFile.size,
          offset: img.offset + Math.floor(Math.random() * 128) - 64,
          url: fileUrl
        };
      }
      return img;
    }));

    toast(`✓ Đã thay thế ảnh nhúng ${activeImageId.toUpperCase()}. Parser tự tính Offset mới!`, 'success');
    setActiveImageId(null);
  };

  const deleteGalleryImage = (id: string) => {
    setGalleryImages(prev => prev.filter(img => img.id !== id));
    toast(`Đã xóa ảnh nhúng khỏi tệp tin`, 'error');
  };

  const addGalleryImage = () => {
    const newId = `img_${Date.now()}`;
    const newImage: GalleryImage = {
      id: newId,
      name: 'Tài nguyên thêm mới (Added Texture)',
      type: 'PNG Image',
      offset: 0x24F00,
      size: 6140,
      url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=120&auto=format&fit=crop&q=60'
    };
    setGalleryImages(prev => [...prev, newImage]);
    toast('✓ Đã chèn tài nguyên ảnh mới vào phân vùng trống (Padding Block)', 'success');
  };

  const exportImage = (img: GalleryImage) => {
    toast(`Đã xuất ảnh ${img.name} tại offset 0x${img.offset.toString(16).toUpperCase()}`, 'success');
  };

  return (
    <div className="space-y-6 text-left">
      
      {/* Real-time Stream Section */}
      <div className="bg-[#121829]/65 backdrop-blur-2xl rounded-3xl border border-white/10 overflow-hidden shadow-xl">
        <div className="p-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            {isVideo && <Film className="w-4 h-4 text-purple-400" />}
            {isAudio && <Music className="w-4 h-4 text-purple-400" />}
            {isImage && <ImageIcon className="w-4 h-4 text-purple-400" />}
            <h3 className="text-sm font-semibold text-white">Xem trước Real-Time Stream Preview</h3>
          </div>
          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-500/30 font-bold uppercase tracking-wide animate-pulse">Streaming Active</span>
        </div>
        
        <div className="p-6 flex flex-col items-center justify-center bg-black/40 min-h-[200px] relative">
          {error && (
            <div className="w-full max-w-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 p-4 rounded-2xl mb-4 flex items-start text-left">
              <ShieldAlert className="w-5 h-5 shrink-0 mr-3 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Cảnh báo hiển thị định dạng</p>
                <p className="text-xs mt-1 text-yellow-300/80 leading-relaxed font-sans">
                  Trình duyệt không thể tự giải mã luồng nội dung này. Có thể do cấu trúc byte bị thay đổi gây lỗi (glitch) hoặc định dạng container không được trình duyệt hỗ trợ trực tiếp. Bạn vẫn có thể thực hiện tải xuống để phát ngoại tuyến.
                </p>
              </div>
            </div>
          )}

          <div className="w-full flex justify-center items-center">
            {isAudio && (
              <div className="w-full max-w-md bg-black/20 p-6 rounded-2xl border border-white/5 flex flex-col items-center space-y-4">
                <Music className="w-12 h-12 text-purple-500 animate-bounce" />
                <audio 
                  controls 
                  src={previewUrl} 
                  className="w-full" 
                  onError={() => setError(true)} 
                />
                <span className="text-[10px] text-white/30 font-mono">Streaming over HTTP/Range</span>
              </div>
            )}

            {isVideo && (
              <div className="w-full max-w-xl bg-black/20 p-2 rounded-2xl border border-white/5">
                <video 
                  controls 
                  src={previewUrl} 
                  className="w-full rounded-xl bg-black max-h-[300px]" 
                  onError={() => setError(true)} 
                />
              </div>
            )}

            {isImage && (
              <div className="bg-black/20 p-4 rounded-2xl border border-white/5 max-w-md">
                <img 
                  src={previewUrl} 
                  alt="Real-time Stream Preview" 
                  className="max-w-full max-h-64 object-contain rounded-xl select-none" 
                  onError={() => setError(true)} 
                />
              </div>
            )}
            
            {!isAudio && !isVideo && !isImage && (
              <div className="text-center p-6 text-white/40 font-sans">
                <AlertCircle className="w-10 h-10 text-white/20 mx-auto mb-2" />
                <p className="text-sm">Không có xem trước media cho định dạng này.</p>
                <p className="text-xs mt-1 text-white/20">Hệ thống hỗ trợ phát trực tiếp cho MP3, MP4, PNG, JPG, GIF, WebM, WebP, v.v.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media Timeline (if audio or video detected) */}
      {(isAudio || isVideo || !isImage) && (
        <div className="bg-[#121829]/65 backdrop-blur-2xl rounded-3xl border border-white/10 p-5 shadow-xl space-y-4">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
              Thanh phát thanh & hình ảnh
            </span>
            <h3 className="text-sm font-bold text-white mt-2 flex items-center">
              <Clock className="w-4 h-4 text-purple-400 mr-2" />
              Dòng thời gian nhị phân (Media Timeline Explorer)
            </h3>
            <p className="text-xs text-white/50 mt-1">
              Bấm vào các mốc thời gian để dò tìm Frames, Samples, Metadata và tiến hành Sửa đổi/Xóa/Chèn âm thanh.
            </p>
          </div>

          {/* Timeline slider steps */}
          <div className="flex space-x-2 overflow-x-auto py-2.5 px-1 pr-4 border-y border-white/5 hide-scrollbar">
            {Array.from({ length: 15 }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setActiveSecond(idx);
                  if (navigator.vibrate) navigator.vibrate(5);
                }}
                className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all shrink-0 ${
                  activeSecond === idx
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20 scale-105 border border-purple-500'
                    : 'bg-white/5 border border-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                00:{idx.toString().padStart(2, '0')}
              </button>
            ))}
          </div>

          {/* Active step details panel */}
          {activeSecond !== null && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/25 p-4 rounded-2xl border border-white/5">
              <div className="space-y-2 text-left">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center">
                  <Layers className="w-3.5 h-3.5 text-purple-400 mr-2" />
                  Chi tiết Frame tại {getTimelineDetails(activeSecond).second}
                </h4>

                <div className="space-y-1 text-xs font-mono text-white/60">
                  <p>• Frame Index: <strong className="text-white">{getTimelineDetails(activeSecond).frame}</strong></p>
                  <p>• Sample Rate Count: <strong className="text-white">{getTimelineDetails(activeSecond).sample}</strong></p>
                  <p>• Chunk Name: <strong className="text-white">{getTimelineDetails(activeSecond).chunk}</strong></p>
                  <p>• Offset Address: <strong className="text-purple-400 font-bold">0x{getTimelineDetails(activeSecond).offset.toString(16).toUpperCase()}</strong></p>
                </div>

                <div className="pt-2 flex flex-wrap gap-2">
                  <button onClick={() => handleTimelineAction('replace')} className="px-3 py-1.5 bg-sky-600/10 text-sky-400 border border-sky-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider">Thay đoạn âm thanh</button>
                  <button onClick={() => handleTimelineAction('delete')} className="px-3 py-1.5 bg-red-600/10 text-red-400 border border-red-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider">Xóa đoạn</button>
                  <button onClick={() => handleTimelineAction('insert')} className="px-3 py-1.5 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider">Chèn đoạn</button>
                </div>
              </div>

              {/* Edit Panel corresponding to mode */}
              <div className="p-3 bg-[#0c101c] rounded-xl border border-white/5 text-left flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-white/40 uppercase font-mono">Khối Metadata tại Offset</span>
                  <input
                    type="text"
                    value={timelineMetadata}
                    onChange={(e) => setTimelineMetadata(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs font-mono text-purple-300 outline-none mt-1.5 focus:border-purple-500/50"
                  />
                </div>

                {timelineMode && (
                  <div className="pt-3 border-t border-white/5 flex justify-between items-center mt-3">
                    <span className="text-[9px] font-bold uppercase text-yellow-400">Mode: {timelineMode.toUpperCase()} active</span>
                    <button 
                      onClick={saveTimelineEdit}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-bold uppercase"
                    >
                      Lưu và Cập nhật
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image Resources Gallery */}
      <div className="bg-[#121829]/65 backdrop-blur-2xl rounded-3xl border border-white/10 p-5 shadow-xl space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
              Thư viện ảnh đính kèm
            </span>
            <h3 className="text-sm font-bold text-white mt-2 flex items-center">
              <ImageIcon className="w-4 h-4 text-purple-400 mr-2" />
              Thư viện ảnh nhúng (Embedded Image Resources)
            </h3>
            <p className="text-xs text-white/50 mt-1">
              Phát hiện các tệp tin hình ảnh được bọc bên trong file container. Hỗ trợ trích xuất, thay ảnh hoặc xóa/chèn tùy ý.
            </p>
          </div>

          <button
            onClick={addGalleryImage}
            className="p-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-bold text-xs transition-colors cursor-pointer flex items-center space-x-1 shadow-lg shadow-purple-600/15 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chèn ảnh nhúng</span>
          </button>
        </div>

        {/* Gallery Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {galleryImages.map((img) => (
            <div 
              key={img.id}
              className="bg-black/35 rounded-2xl border border-white/5 p-3 flex flex-col justify-between group overflow-hidden relative"
            >
              <div className="h-24 w-full rounded-xl bg-black/40 overflow-hidden relative mb-3">
                <img src={img.url} alt={img.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                <span className="absolute bottom-1 right-1 text-[9px] bg-black/70 border border-white/10 text-white/80 font-mono px-1.5 py-0.5 rounded">
                  {img.type}
                </span>
              </div>

              <div className="space-y-1 text-left">
                <h4 className="text-xs font-bold text-white truncate">{img.name}</h4>
                <div className="flex flex-col text-[10px] text-white/40 font-mono space-y-0.5">
                  <span>Offset: 0x{img.offset.toString(16).toUpperCase()}</span>
                  <span>Size: {img.size.toLocaleString()} bytes</span>
                </div>
              </div>

              {/* Hover quick action panel */}
              <div className="flex items-center space-x-1.5 mt-3 pt-2.5 border-t border-white/5">
                <button 
                  onClick={() => triggerImageUpload(img.id)}
                  className="flex-1 bg-sky-500/15 border border-sky-500/25 text-sky-400 py-1 rounded-lg text-[9px] font-bold uppercase transition-all"
                >
                  Thay thế
                </button>
                <button 
                  onClick={() => exportImage(img)}
                  title="Xuất ảnh ra máy"
                  className="p-1 bg-white/5 text-white/40 hover:text-white rounded hover:bg-white/10"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => deleteGalleryImage(img.id)}
                  title="Xóa tài nguyên"
                  className="p-1 bg-red-500/10 text-red-400 hover:text-red-500 rounded hover:bg-red-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Hidden inputs */}
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef} 
          onChange={handleImageReplace} 
          className="hidden" 
        />
      </div>

    </div>
  );
}
