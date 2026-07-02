import React from 'react';

export default function PremiumBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#0B0F14]">
      {/* Subtle vignette border */}
      <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_70%,#05070a_100%] z-[1]" />
    </div>
  );
}
