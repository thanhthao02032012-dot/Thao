import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Download, Undo2, Redo2, Navigation, Bookmark, Share2, Menu, X, Sliders, Play
} from 'lucide-react';

interface FloatingMenuFABProps {
  onDownload: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onJumpOffset: () => void;
  onBookmarks: () => void;
  onExport: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function FloatingMenuFAB({
  onDownload, onUndo, onRedo, onJumpOffset, onBookmarks, onExport,
  canUndo, canRedo
}: FloatingMenuFABProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleAction = (callback: () => void) => {
    callback();
    setIsOpen(false);
    if (navigator.vibrate) navigator.vibrate(12);
  };

  // Radial button items coordinates and angles (relative to bottom-right bottom: 16px, right: 16px)
  const menuItems = [
    { icon: Undo2, label: 'Undo', onClick: onUndo, active: canUndo, color: 'from-pink-500 to-rose-500' },
    { icon: Redo2, label: 'Redo', onClick: onRedo, active: canRedo, color: 'from-purple-500 to-indigo-500' },
    { icon: Navigation, label: 'Jump', onClick: onJumpOffset, active: true, color: 'from-blue-500 to-sky-500' },
    { icon: Bookmark, label: 'Ghim', onClick: onBookmarks, active: true, color: 'from-emerald-500 to-teal-500' },
    { icon: Download, label: 'Tải', onClick: onDownload, active: true, color: 'from-yellow-500 to-amber-500' }
  ];

  return (
    <div className="fixed bottom-20 right-6 z-40 flex flex-col items-end pointer-events-none select-none">
      
      {/* Expanded fan buttons stack */}
      <AnimatePresence>
        {isOpen && (
          <div className="flex flex-col items-end space-y-3 mb-4 pointer-events-auto">
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="flex items-center space-x-2.5"
                >
                  {/* Text Label tag */}
                  <div className="px-2.5 py-1 rounded-lg bg-black/90 border border-white/10 text-[10px] text-white/80 font-bold uppercase tracking-wider shadow-sm">
                    {item.label}
                  </div>
                  
                  {/* Rounded sub-action button */}
                  <button
                    onClick={() => item.active && handleAction(item.onClick)}
                    disabled={!item.active}
                    className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md disabled:opacity-30 disabled:scale-100 cursor-pointer"
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {/* Primary Floating Trigger Button */}
      <button
        onClick={toggleMenu}
        className="pointer-events-auto w-14 h-14 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 flex items-center justify-center text-white shadow-md border border-purple-500/30 shrink-0 cursor-pointer"
      >
        <motion.div
          animate={{ rotate: isOpen ? 135 : 0 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
        >
          <Plus className="w-7 h-7" />
        </motion.div>
      </button>
    </div>
  );
}
