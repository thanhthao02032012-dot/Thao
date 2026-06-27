import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Download, Undo, FileAudio, FileVideo, FileImage } from 'lucide-react';
import { EditRecord } from '../types';

interface HexEditorProps {
  file: File;
  onClose?: () => void;
  onDataChange?: (newData: Uint8Array) => void;
  jumpToOffset?: number | null;
}

const BYTES_PER_ROW = 16;
const ROWS_PER_PAGE = 256;
const BYTES_PER_PAGE = BYTES_PER_ROW * ROWS_PER_PAGE;

export default function HexEditor({ file, onClose, onDataChange, jumpToOffset }: HexEditorProps) {
  const [data, setData] = useState<Uint8Array | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [history, setHistory] = useState<EditRecord[]>([]);
  const [selectedOffset, setSelectedOffset] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [itemsPerRow, setItemsPerRow] = useState(16);

  useEffect(() => {
    const handleResize = () => {
      setItemsPerRow(window.innerWidth < 640 ? 8 : 16);
    };
    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (jumpToOffset !== undefined && jumpToOffset !== null && data) {
      const page = Math.floor(jumpToOffset / BYTES_PER_PAGE);
      setCurrentPage(page);
      setSelectedOffset(jumpToOffset);
    }
  }, [jumpToOffset, data]);

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const initialData = new Uint8Array(e.target.result as ArrayBuffer);
        setData(initialData);
        if (onDataChange) {
          onDataChange(initialData);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  }, [file]);

  const totalPages = data ? Math.ceil(data.length / BYTES_PER_PAGE) : 0;
  
  const pageData = useMemo(() => {
    if (!data) return null;
    const start = currentPage * BYTES_PER_PAGE;
    return data.slice(start, start + BYTES_PER_PAGE);
  }, [data, currentPage]);

  const handleByteEdit = (offset: number, valueStr: string) => {
    if (!data) return;
    const val = parseInt(valueStr, 16);
    if (isNaN(val) || val < 0 || val > 255) return;
    
    const oldValue = data[offset];
    if (oldValue === val) return;

    const newData = new Uint8Array(data);
    newData[offset] = val;
    setData(newData);
    setHistory([...history, { offset, oldValue, newValue: val }]);
    
    if (onDataChange) {
      onDataChange(newData);
    }
  };

  const handleUndo = () => {
    if (history.length === 0 || !data) return;
    const lastEdit = history[history.length - 1];
    const newData = new Uint8Array(data);
    newData[lastEdit.offset] = lastEdit.oldValue;
    setData(newData);
    setHistory(history.slice(0, -1));
    
    if (onDataChange) {
      onDataChange(newData);
    }
  };

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([data], { type: file.type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited_${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!data || !pageData) {
    return <div className="p-8 text-center text-white/50">Đang tải file...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Toolbar */}
      <div className="hidden lg:flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center space-x-4">
          <h2 className="font-semibold text-white truncate max-w-xs">{file.name}</h2>
          <span className="text-sm text-white/50 shrink-0">{data.length} bytes</span>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button 
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex items-center px-3 py-1.5 text-sm font-medium text-white/70 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white disabled:opacity-50 transition-colors"
          >
            <Undo className="w-4 h-4 mr-2" />
            Hoàn tác
          </button>
          <button 
            onClick={handleDownload}
            className="flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Tải xuống
          </button>
          {onClose && (
            <button onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-white/70 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors">
              Đóng
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative">
        {/* Mobile Toolbar Overlay - Fixed at bottom */}
        <div className="lg:hidden absolute bottom-0 left-0 right-0 p-2 bg-[#121827]/95 backdrop-blur-xl border-t border-white/10 flex justify-between z-20 shadow-2xl">
          <button 
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex items-center px-3 py-2 text-sm font-medium text-white/70 bg-white/5 border border-white/10 rounded-lg disabled:opacity-50"
          >
            <Undo className="w-4 h-4 mr-1" />
            Undo
          </button>
          <button 
            onClick={handleDownload}
            className="flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg"
          >
            <Download className="w-4 h-4 mr-1" />
            Tải về
          </button>
        </div>

        {/* Editor Area */}
        <div className="flex-1 overflow-auto p-2 lg:p-4 font-mono text-[10px] sm:text-xs lg:text-sm pb-16 lg:pb-4 custom-scrollbar">
          <div className="flex mb-2 text-white/50 border-b border-white/10 pb-2 min-w-max">
            <div className="w-16 sm:w-20 lg:w-24 shrink-0">Offset</div>
            <div className={`flex-1 grid grid-cols-${itemsPerRow === 8 ? '8' : '16'} gap-0.5 sm:gap-1 lg:gap-2 lg:mr-4`}>
              {Array.from({ length: itemsPerRow }).map((_, i) => (
                <div key={i} className="text-center w-5 sm:w-6">{i.toString(16).padStart(2, '0').toUpperCase()}</div>
              ))}
            </div>
            <div className="w-20 lg:w-32 shrink-0 tracking-widest hidden md:block">ASCII</div>
          </div>
          
          <div className="space-y-1 min-w-max">
            {Array.from({ length: Math.ceil(pageData.length / itemsPerRow) }).map((_, rowIndex) => {
              const startOffset = currentPage * BYTES_PER_PAGE + rowIndex * itemsPerRow;
              const rowBytes = pageData.slice(rowIndex * itemsPerRow, (rowIndex + 1) * itemsPerRow);
              
              return (
                <div key={rowIndex} className="flex group hover:bg-white/5 rounded-sm transition-colors">
                  <div className="w-16 sm:w-20 lg:w-24 shrink-0 text-white/40 select-none py-0.5">
                    {startOffset.toString(16).padStart(8, '0').toUpperCase()}
                  </div>
                  <div className={`flex-1 grid grid-cols-${itemsPerRow === 8 ? '8' : '16'} gap-0.5 sm:gap-1 lg:gap-2 lg:mr-4 py-0.5`}>
                    {Array.from({ length: itemsPerRow }).map((_, colIndex) => {
                      if (colIndex >= rowBytes.length) return <div key={colIndex} className="w-5 sm:w-6" />;
                      const offset = startOffset + colIndex;
                      const byte = rowBytes[colIndex];
                      const isSelected = selectedOffset === offset;
                      
                      return (
                        <div 
                          key={colIndex} 
                          className={`w-5 sm:w-6 text-center cursor-pointer rounded transition-colors ${isSelected ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25 ring-1 ring-purple-400' : 'hover:bg-white/10 text-white/80'}`}
                          onClick={() => {
                            setSelectedOffset(offset);
                            setEditValue(byte.toString(16).padStart(2, '0').toUpperCase());
                          }}
                        >
                          {isSelected ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => {
                                handleByteEdit(offset, editValue);
                                setSelectedOffset(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleByteEdit(offset, editValue);
                                  setSelectedOffset(null);
                                }
                              }}
                              className="w-full h-full bg-purple-600 text-white text-center outline-none rounded"
                              autoFocus
                            />
                          ) : (
                            byte.toString(16).padStart(2, '0').toUpperCase()
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="w-20 lg:w-32 shrink-0 text-white/60 tracking-[0.2em] hidden md:block py-0.5">
                    {Array.from({ length: rowBytes.length }).map((_, colIndex) => {
                      const byte = rowBytes[colIndex];
                      const char = (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
                      return <span key={colIndex}>{char}</span>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Bit Editor Panel */}
        {selectedOffset !== null && data && (
          <div className="bg-black/20 backdrop-blur-md border-t border-white/10 p-3 lg:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 lg:mb-0 pb-20 lg:pb-4 shadow-lg z-10 relative">
            <div className="flex items-center space-x-4 w-full sm:w-auto justify-between sm:justify-start">
              <span className="text-sm font-semibold text-white">Sửa Bit</span>
              <span className="text-xs text-purple-400 font-mono bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">0x{selectedOffset.toString(16).toUpperCase()}</span>
            </div>
            <div className="flex items-center justify-center gap-1 w-full sm:w-auto">
              {Array.from({ length: 8 }).map((_, bitIndex) => {
                // MSB to LSB
                const shift = 7 - bitIndex;
                const byte = data[selectedOffset];
                const bitVal = (byte >> shift) & 1;
                return (
                  <button
                    key={bitIndex}
                    onClick={() => {
                      const newByte = byte ^ (1 << shift); // Toggle bit
                      handleByteEdit(selectedOffset, newByte.toString(16));
                    }}
                    className={`flex-1 sm:w-8 h-8 rounded flex items-center justify-center font-mono text-sm font-semibold transition-all
                      ${bitVal ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {bitVal}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Pagination */}
        <div className={`flex items-center justify-between p-4 border-t border-white/10 bg-black/10 ${selectedOffset !== null ? 'hidden lg:flex' : 'mb-14 lg:mb-0'} z-10 relative`}>
          <div className="text-sm text-white/50">
            Trang {currentPage + 1} / {totalPages}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-white disabled:opacity-50 text-sm transition-colors"
            >
              Trước
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-white disabled:opacity-50 text-sm transition-colors"
            >
              Sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
