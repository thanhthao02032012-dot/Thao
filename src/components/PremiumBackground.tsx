import React from 'react';

export default function PremiumBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#09090B]">
      {/* Premium ambient light source / vignette */}
      <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_40%,#09090B_100%] z-[1]" />

      {/* Static deep glows without animations */}
      <div className="absolute inset-0 opacity-25 blur-[130px] sm:blur-[160px]">
        {/* Violet Purple Glow */}
        <div className="absolute top-[10%] left-[15%] w-[500px] h-[500px] rounded-full bg-purple-600/15" />
        {/* Deep Royal Blue Glow */}
        <div className="absolute bottom-[15%] right-[15%] w-[450px] h-[450px] rounded-full bg-blue-600/10" />
      </div>
    </div>
  );
}
