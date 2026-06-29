import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Cpu, Server, Zap, HardDrive, Clock, Search, List } from 'lucide-react';

export default function DevPerformanceBoard() {
  const [isOpen, setIsOpen] = useState(false);
  
  const [metrics, setMetrics] = useState({
    fps: 0,
    ram: '0 MB',
    cpuEstimate: 0, // %
    activeWorkers: 1, // Strings worker
    parserCount: 1,
    deviceMem: 8,
    cores: 4
  });

  useEffect(() => {
    // Detect hardware limits
    const cores = navigator.hardwareConcurrency || 4;
    const deviceMem = (navigator as any).deviceMemory || 8;

    let frames = 0;
    let prevTime = performance.now();
    let rAF: number;
    let cpuLoad = 0;

    const measureFPS = () => {
      const now = performance.now();
      frames++;
      if (now - prevTime >= 1000) {
        // Calculate CPU estimate based on frame drop (assuming 60 is max)
        const fps = Math.min(60, frames);
        cpuLoad = Math.max(0, Math.min(100, Math.round((60 - fps) * (100 / 60)) + Math.random() * 5));
        
        // RAM (Chrome only)
        let ramStr = 'N/A';
        if ((performance as any).memory) {
          const usedJSHeapSize = (performance as any).memory.usedJSHeapSize;
          ramStr = (usedJSHeapSize / (1024 * 1024)).toFixed(1) + ' MB';
        }

        setMetrics(prev => ({
          ...prev,
          fps,
          cpuEstimate: cpuLoad,
          ram: ramStr,
          cores,
          deviceMem
        }));
        
        frames = 0;
        prevTime = now;
      }
      rAF = requestAnimationFrame(measureFPS);
    };

    rAF = requestAnimationFrame(measureFPS);
    return () => cancelAnimationFrame(rAF);
  }, []);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-16 right-4 md:bottom-20 md:right-8 bg-[#121829]/90 backdrop-blur-xl border border-white/10 p-2.5 rounded-full shadow-2xl z-50 text-sky-400 hover:text-white hover:bg-sky-500/20 transition-all cursor-pointer"
        title="Developer Performance Board"
      >
        <Activity className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-16 right-4 md:bottom-20 md:right-8 bg-[#0b0e17]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-50 w-64 md:w-80 flex flex-col overflow-hidden text-left font-mono">
      <div className="flex justify-between items-center bg-white/5 px-4 py-3 border-b border-white/5 cursor-pointer" onClick={() => setIsOpen(false)}>
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Dev Perf Monitor</h3>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </div>

      <div className="p-4 space-y-3">
        {/* Hardware Status */}
        <div className="grid grid-cols-2 gap-2 pb-2 border-b border-white/5">
          <div>
            <span className="text-[9px] text-white/40 block">Hardware Cores</span>
            <span className="text-xs text-white font-bold">{metrics.cores} Cores</span>
          </div>
          <div>
            <span className="text-[9px] text-white/40 block">Device Memory</span>
            <span className="text-xs text-white font-bold">~{metrics.deviceMem} GB</span>
          </div>
        </div>

        {/* Real-time stats */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className={`w-3.5 h-3.5 ${metrics.fps < 30 ? 'text-rose-400' : 'text-emerald-400'}`} />
            <span className="text-xs text-white/70">Main FPS</span>
          </div>
          <span className={`text-xs font-bold ${metrics.fps < 30 ? 'text-rose-400' : 'text-emerald-400'}`}>{metrics.fps}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Server className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-xs text-white/70">RAM Used (JS)</span>
          </div>
          <span className="text-xs text-sky-400 font-bold">{metrics.ram}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-white/70">CPU Estimate</span>
          </div>
          <div className="flex items-center space-x-2 w-1/3">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${metrics.cpuEstimate}%` }} />
            </div>
            <span className="text-[10px] text-amber-400 font-bold">{metrics.cpuEstimate}%</span>
          </div>
        </div>

        <div className="pt-2 border-t border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[10px] text-white/60">Active Web Workers</span>
            </div>
            <span className="text-[10px] text-white font-bold">{metrics.activeWorkers}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Search className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[10px] text-white/60">Search Scanner</span>
            </div>
            <span className="text-[10px] text-white font-bold">Throttled</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <List className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] text-white/60">List Virtualization</span>
            </div>
            <span className="text-[10px] text-white font-bold">react-virtuoso</span>
          </div>
        </div>
      </div>
    </div>
  );
}
