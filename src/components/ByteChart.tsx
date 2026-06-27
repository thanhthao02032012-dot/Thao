import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface ByteChartProps {
  file: File;
  editedData: Uint8Array | null;
}

export default function ByteChart({ file, editedData }: ByteChartProps) {
  const [originalData, setOriginalData] = React.useState<Uint8Array | null>(null);

  React.useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setOriginalData(new Uint8Array(e.target.result as ArrayBuffer));
      }
    };
    reader.readAsArrayBuffer(file);
  }, [file]);

  const activeData = editedData || originalData;

  const chartData = useMemo(() => {
    if (!activeData) return [];
    
    // Calculate frequency, taking a sample if file is too large to prevent freezing
    const counts = new Array(256).fill(0);
    const step = Math.max(1, Math.floor(activeData.length / 100000)); // sample max 100k bytes
    
    for (let i = 0; i < activeData.length; i += step) {
      counts[activeData[i]]++;
    }

    return counts.map((count, index) => ({
      byte: index.toString(16).padStart(2, '0').toUpperCase(),
      count
    }));
  }, [activeData]);

  if (!activeData) {
    return <div className="p-4 text-center text-white/50 text-sm">Đang phân tích byte...</div>;
  }

  return (
    <div className="h-64 w-full p-4 bg-transparent border-0 flex flex-col">
      <h3 className="text-sm font-semibold text-white mb-4 flex justify-between items-center">
        <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-purple-500 mr-2"></span>Biểu đồ phân bố Byte (Mẫu)</span>
        {editedData && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-normal border border-purple-500/30">Đã cập nhật</span>}
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
