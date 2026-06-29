import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { readAndPatchChunk } from '../utils/fileStream';

interface ByteChartProps {
  file: File;
  patches: Map<number, number>;
  virtualFileSize: number;
}

export default function ByteChart({ file, patches, virtualFileSize }: ByteChartProps) {
  const [counts, setCounts] = useState<number[]>(new Array(256).fill(0));
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let active = true;
    const calculateFrequency = async () => {
      setAnalyzing(true);
      setProgress(0);
      const freq = new Array(256).fill(0);
      const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks
      const totalSize = virtualFileSize;
      let offset = 0;

      // If file is extremely large (e.g. > 50MB), sample 100 blocks of 1MB spaced evenly
      // to keep it fast, statistically accurate, and non-freezing.
      if (totalSize <= 50 * 1024 * 1024) {
        while (offset < totalSize && active) {
          const size = Math.min(CHUNK_SIZE, totalSize - offset);
          const chunk = await readAndPatchChunk(file, offset, size, patches, totalSize);
          for (let i = 0; i < chunk.length; i++) {
            freq[chunk[i]]++;
          }
          offset += size;
          setProgress(Math.min(100, Math.floor((offset / totalSize) * 100)));
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } else {
        const numBlocks = 100;
        const blockSize = 1024 * 1024; // 1MB blocks
        const stride = Math.floor((totalSize - blockSize) / numBlocks);
        for (let b = 0; b < numBlocks && active; b++) {
          const blockOffset = b * stride;
          const size = Math.min(blockSize, totalSize - blockOffset);
          const chunk = await readAndPatchChunk(file, blockOffset, size, patches, totalSize);
          for (let i = 0; i < chunk.length; i++) {
            freq[chunk[i]]++;
          }
          setProgress(Math.min(100, Math.floor(((b + 1) / numBlocks) * 100)));
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      if (active) {
        setCounts(freq);
        setAnalyzing(false);
      }
    };

    calculateFrequency();
    return () => {
      active = false;
    };
  }, [file, patches, virtualFileSize]);

  const chartData = useMemo(() => {
    return counts.map((count, index) => ({
      byte: index.toString(16).padStart(2, '0').toUpperCase(),
      count
    }));
  }, [counts]);

  return (
    <div className="h-64 w-full p-4 bg-transparent border-0 flex flex-col">
      <h3 className="text-sm font-semibold text-white mb-4 flex justify-between items-center">
        <span className="flex items-center">
          <span className="w-2 h-2 rounded-full bg-purple-500 mr-2"></span>
          Biểu đồ phân bố Byte {virtualFileSize > 50 * 1024 * 1024 ? '(Mẫu phân tích)' : '(Toàn bộ file)'}
        </span>
        {analyzing ? (
          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-normal border border-purple-500/30 animate-pulse">
            Đang phân tích ({progress}%)
          </span>
        ) : (
          <span className="text-[10px] bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full font-normal border border-green-500/30">
            Sẵn sàng
          </span>
        )}
      </h3>
      <div className="flex-1 min-h-0 bg-white/5 rounded-xl p-2 border border-white/5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="byte" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }} interval="preserveStartEnd" minTickGap={20} stroke="rgba(255,255,255,0.1)" />
            <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }} stroke="rgba(255,255,255,0.1)" />
            <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'rgba(17,24,39,0.9)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }} itemStyle={{ color: '#a855f7' }} />
            <Bar dataKey="count" fill="#a855f7" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
