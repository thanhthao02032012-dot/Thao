import React, { useState } from 'react';
import HexEditor from './HexEditor';
import ByteChart from './ByteChart';
import MediaPreview from './MediaPreview';
import FileAnalyzer from './FileAnalyzer';
import BulkEditor from './BulkEditor';
import SignatureEditor from './SignatureEditor';
import { BarChart2, Edit3, Eye, FileSearch, Menu, X, PenTool } from 'lucide-react';

interface WorkspaceProps {
  file: File;
  onClose: () => void;
}

export default function Workspace({ file, onClose }: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'analyze' | 'bulk' | 'sign'>('preview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editedData, setEditedData] = useState<Uint8Array | null>(null);
  const [jumpToOffset, setJumpToOffset] = useState<number | null>(null);

  const handleDataChange = (newData: Uint8Array) => {
    setEditedData(newData);
  };

  const handleGoToOffset = (offset: number) => {
    setJumpToOffset(offset);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-transparent overflow-hidden relative z-10">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-all"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Column: Hex Editor */}
      <div className="flex-1 h-full lg:border-r border-white/10 bg-white/5 backdrop-blur-xl relative z-10 flex flex-col m-4 rounded-3xl overflow-hidden shadow-2xl">
        <div className="lg:hidden flex items-center justify-between p-3 bg-white/5 border-b border-white/10">
          <span className="font-semibold text-white text-sm truncate px-2">{file.name}</span>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-white/70 hover:bg-white/10 hover:text-white rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden p-2">
           <HexEditor file={file} onDataChange={handleDataChange} jumpToOffset={jumpToOffset} />
        </div>
      </div>

      {/* Right Column / Sidebar: Tools */}
      <div className={`
        fixed inset-y-0 right-0 z-50 w-80 bg-[#121827]/95 backdrop-blur-2xl shadow-2xl border-l border-white/10 transform transition-transform duration-300 ease-in-out lg:relative lg:transform-none lg:w-96 lg:bg-transparent lg:shadow-none lg:border-none flex flex-col h-full lg:p-4
        ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full bg-white/5 lg:backdrop-blur-xl lg:border lg:border-white/10 lg:rounded-3xl overflow-hidden shadow-2xl">
          {/* Sidebar Header (Mobile) */}
          <div className="flex items-center justify-between p-4 lg:hidden border-b border-white/10 bg-white/5">
            <span className="font-semibold text-white">Công cụ</span>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-white/50 hover:bg-white/10 hover:text-white rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex p-2 bg-black/20 gap-1 shrink-0 overflow-x-auto hide-scrollbar border-b border-white/5">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex-1 flex items-center justify-center space-x-1 py-2 px-2 text-xs sm:text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'preview' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Xem trước</span>
            </button>
            <button
              onClick={() => setActiveTab('analyze')}
              className={`flex-1 flex items-center justify-center space-x-1 py-2 px-2 text-xs sm:text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'analyze' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileSearch className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Phân tích</span>
            </button>
            <button
              onClick={() => setActiveTab('bulk')}
              className={`flex-1 flex items-center justify-center space-x-1 py-2 px-2 text-xs sm:text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'bulk' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Edit3 className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Sửa loạt</span>
            </button>
            <button
              onClick={() => setActiveTab('sign')}
              className={`flex-1 flex items-center justify-center space-x-1 py-2 px-2 text-xs sm:text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'sign' ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <PenTool className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Ký File</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar pb-24 lg:pb-4">
            {activeTab === 'preview' && (
              <>
                <div className="bg-black/20 rounded-2xl border border-white/5 p-5">
                  <h3 className="font-semibold text-white mb-3 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                    Thông tin file
                  </h3>
                  <ul className="text-sm text-white/70 space-y-2">
                    <li className="flex flex-col"><span className="text-white/40 text-xs uppercase tracking-wider mb-1">Tên</span> <span className="break-all font-medium text-white">{file.name}</span></li>
                    <li className="flex flex-col"><span className="text-white/40 text-xs uppercase tracking-wider mb-1">Loại</span> <span className="font-medium text-white">{file.type || 'Không xác định'}</span></li>
                    <li className="flex flex-col"><span className="text-white/40 text-xs uppercase tracking-wider mb-1">Kích thước</span> <span className="font-medium text-white">{(file.size / 1024).toFixed(2)} KB</span></li>
                  </ul>
                </div>
                <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                  <MediaPreview file={file} editedData={editedData} />
                </div>
              </>
            )}

            {activeTab === 'analyze' && (
              <>
                <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                  <FileAnalyzer data={editedData} onGoToOffset={handleGoToOffset} />
                </div>
                <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden mt-6">
                  <ByteChart file={file} editedData={editedData} />
                </div>
              </>
            )}

            {activeTab === 'bulk' && (
              <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                <BulkEditor data={editedData} onDataChange={handleDataChange} />
              </div>
            )}

            {activeTab === 'sign' && (
              <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                <SignatureEditor data={editedData} onDataChange={handleDataChange} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
