import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Terminal, Undo2, Hexagon, Cpu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#070b13] flex flex-col items-center justify-center p-6 text-center font-sans relative overflow-hidden select-none">
      {/* Background Grid & Ambient Glows */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-md w-full relative z-10 space-y-8">
        {/* Animated Cyber Core */}
        <div className="relative w-32 h-32 mx-auto">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 15, ease: 'linear' }}
            className="absolute inset-0 border-2 border-dashed border-red-500/20 rounded-full"
          />
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
            className="absolute inset-2 border border-dashed border-purple-500/30 rounded-full"
          />
          <div className="absolute inset-4 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.15)]">
            <ShieldAlert className="w-12 h-12 text-red-500 animate-pulse" />
          </div>
        </div>

        {/* Text Section */}
        <div className="space-y-3">
          <h1 className="text-5xl font-extrabold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-purple-400 to-indigo-400 font-mono">
            0x194
          </h1>
          <div className="text-xs font-bold text-red-400 uppercase tracking-[0.25em] font-mono flex items-center justify-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" /> PAGE_NOT_FOUND
          </div>
          <p className="text-white/80 text-sm font-medium pt-3 leading-relaxed">
            Phân vùng bộ nhớ hoặc địa chỉ URL bạn cố gắng truy cập không tồn tại hoặc đã bị ghi đè bởi trình dọn dẹp nhị phân.
          </p>
          <div className="inline-flex items-center space-x-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg text-[10px] text-white/40 font-mono">
            <Cpu className="w-3 h-3 text-purple-400" />
            <span>SEGMENT_FAULT_OFFSET_NULL</span>
          </div>
        </div>

        {/* Call to Action Button */}
        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="pt-4"
        >
          <button
            onClick={() => navigate('/')}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-950/40 cursor-pointer"
          >
            <Undo2 className="w-4 h-4" />
            <span>Quay lại Bảng điều khiển (0x00)</span>
          </button>
        </motion.div>
      </div>

      {/* Hex decorative background items */}
      <div className="absolute bottom-10 right-10 opacity-10 pointer-events-none">
        <Hexagon className="w-24 h-24 text-purple-500" />
      </div>
      <div className="absolute top-10 left-10 opacity-10 pointer-events-none">
        <Hexagon className="w-16 h-16 text-blue-500" />
      </div>
    </div>
  );
}
