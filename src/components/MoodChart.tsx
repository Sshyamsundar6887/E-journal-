import { MoodTrendPoint } from '../types';

interface MoodChartProps {
  data: MoodTrendPoint[];
}

export default function MoodChart({ data }: MoodChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-44 w-full flex items-center justify-center text-xs text-slate-500 italic bg-[#0F1115] rounded-xl border border-[#1F2229]">
        Record entries to populate emotional trend timeline
      </div>
    );
  }

  // Sort by date to draw line chronologically
  const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Dimensions
  const width = 450;
  const height = 180;
  const paddingLeft = 35;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 25;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Math helper to convert data index & score to SVG points
  // Score range: -1 to 1
  const getX = (index: number) => {
    if (sortedData.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (sortedData.length - 1)) * chartWidth;
  };

  const getY = (score: number) => {
    // scale from [-1, 1] to [chartHeight, 0] inside the plot space
    const normalized = (score + 1) / 2; // scale to 0..1
    return paddingTop + chartHeight - (normalized * chartHeight);
  };

  // Construct points string for line
  let pointsStr = "";
  sortedData.forEach((pt, idx) => {
    pointsStr += `${getX(idx)},${getY(pt.score)} `;
  });

  return (
    <div className="space-y-3 bg-[#0F1115] p-4 rounded-xl border border-[#1F2229]">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Emotional Balance Trend</h4>
        <span className="text-[10px] text-slate-500">Current Span: {sortedData.length} entries</span>
      </div>

      <div className="relative w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
          {/* Y-Axis Grid Lines */}
          <line
            x1={paddingLeft}
            y1={getY(1)}
            x2={width - paddingRight}
            y2={getY(1)}
            stroke="#1F2229"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text x={paddingLeft - 8} y={getY(1) + 3} className="text-[8px] fill-slate-500 font-sans text-right" textAnchor="end">Pos</text>

          <line
            x1={paddingLeft}
            y1={getY(0)}
            x2={width - paddingRight}
            y2={getY(0)}
            stroke="#2F3542"
            strokeDasharray="4 4"
            strokeWidth="1.2"
          />
          <text x={paddingLeft - 8} y={getY(0) + 3} className="text-[8px] fill-slate-500 font-sans text-right" textAnchor="end">Neu</text>

          <line
            x1={paddingLeft}
            y1={getY(-1)}
            x2={width - paddingRight}
            y2={getY(-1)}
            stroke="#1F2229"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text x={paddingLeft - 8} y={getY(-1) + 3} className="text-[8px] fill-slate-500 font-sans text-right" textAnchor="end">Neg</text>

          {/* Connected Trend Line */}
          {sortedData.length > 1 && (
            <path
              d={`M ${pointsStr.trim().replace(/ /g, " L ")}`}
              fill="none"
              stroke="#6366F1"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive Data Nodes */}
          {sortedData.map((pt, idx) => {
            const x = getX(idx);
            const y = getY(pt.score);
            const dateObj = new Date(pt.date);
            const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

            // Choose color based on mood
            const isPositive = pt.score > 0.15;
            const isNegative = pt.score < -0.15;
            const dotFill = isPositive ? "#10B981" : isNegative ? "#EF4444" : "#F59E0B";

            return (
              <g key={idx} className="group cursor-pointer">
                <circle
                  cx={x}
                  cy={y}
                  r="4.5"
                  fill={dotFill}
                  stroke="#0D0E12"
                  strokeWidth="1.5"
                  className="transition-all duration-150 group-hover:r-[6px] shadow-sm"
                />
                
                {/* Micro Label */}
                <text
                  x={x}
                  y={y - 9}
                  className="text-[8px] font-bold font-sans fill-slate-300 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-center"
                  textAnchor="middle"
                >
                  {pt.mood}
                </text>

                {/* X-Axis ticks */}
                {idx === 0 || idx === sortedData.length - 1 || idx === Math.floor(sortedData.length / 2) ? (
                  <text
                    x={x}
                    y={height - 6}
                    className="text-[8px] fill-slate-500 font-sans"
                    textAnchor="middle"
                  >
                    {formattedDate}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Mood Map Legend */}
      <div className="flex justify-center gap-4 text-[10px] text-slate-400 pt-1.5 border-t border-[#1F2229]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 block"></span>
          Positive
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 block"></span>
          Neutral
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500 block"></span>
          Negative
        </span>
      </div>
    </div>
  );
}
