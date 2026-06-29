import React, { useMemo } from 'react';
import { motion } from 'motion/react';

export default function PremiumBackground() {
  // Generate a stable list of particles so they don't re-roll on every render
  const particles = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 3 + 1, // 1px to 4px
      duration: Math.random() * 20 + 15, // 15s to 35s
      delay: Math.random() * -20, // Negative delay so they start immediately at different phases
    }));
  }, []);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#09090B]">
      {/* Premium ambient light source / vignette */}
      <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_40%,#09090B_100%] z-[1]" />

      {/* Moving blobs */}
      <div className="absolute inset-0 opacity-40 blur-[130px] sm:blur-[160px]">
        {/* Violet Purple Blob */}
        <motion.div
          animate={{
            x: ['-20%', '10%', '-10%', '-20%'],
            y: ['-10%', '15%', '-5%', '-10%'],
            scale: [1, 1.15, 0.9, 1],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-[5%] left-[10%] w-[60vw] h-[60vw] max-w-[550px] max-h-[550px] rounded-full bg-purple-600/25"
        />

        {/* Deep Royal Blue Blob */}
        <motion.div
          animate={{
            x: ['20%', '-10%', '5%', '20%'],
            y: ['10%', '-15%', '10%', '10%'],
            scale: [1, 0.9, 1.1, 1],
          }}
          transition={{
            duration: 35,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute bottom-[10%] right-[10%] w-[55vw] h-[55vw] max-w-[500px] max-h-[500px] rounded-full bg-blue-600/20"
        />

        {/* Magenta Accent Blob */}
        <motion.div
          animate={{
            x: ['-10%', '20%', '-5%', '-10%'],
            y: ['20%', '5%', '-15%', '20%'],
            scale: [0.8, 1.1, 0.9, 0.8],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-[40%] left-[30%] w-[45vw] h-[45vw] max-w-[400px] max-h-[400px] rounded-full bg-fuchsia-600/15"
        />
      </div>

      {/* Floating subtle particles */}
      <div className="absolute inset-0 z-[2]">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            style={{
              position: 'absolute',
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
              borderRadius: '50%',
              backgroundColor: 'rgba(168, 85, 247, 0.35)',
              boxShadow: '0 0 8px rgba(168, 85, 247, 0.5)',
            }}
            animate={{
              y: ['0px', '-150px', '0px'],
              x: ['0px', '40px', '0px'],
              opacity: [0.1, 0.7, 0.1],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  );
}
