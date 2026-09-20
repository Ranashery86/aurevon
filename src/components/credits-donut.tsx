"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { serviceBarColor } from "@/lib/chart-colors";

type DonutSegment = {
  name: string;
  value: number;
};

type CreditsDonutProps = {
  segments: DonutSegment[];
  totalCredits: number;
  usedCredits: number;
};

// Light neutral for the "Remaining" slice, matching the original 2-segment
// donut's remaining color. Never used for a service slice.
const REMAINING_COLOR = "#e2e8f0";

export function CreditsDonut({
  segments,
  totalCredits,
  usedCredits,
}: CreditsDonutProps) {
  // Services with zero usage are dropped so no zero-width slice is rendered.
  const usedSegments = segments.filter((segment) => segment.value > 0);

  if (usedSegments.length === 0) {
    return (
      <div className="flex h-72 w-full items-center justify-center">
        <p className="text-sm text-slate-400">
          No activity yet. Your service requests will appear here.
        </p>
      </div>
    );
  }

  const remaining = Math.max(0, totalCredits - usedCredits);
  const chartData = [
    ...usedSegments,
    ...(remaining > 0 ? [{ name: "Remaining", value: remaining }] : []),
  ];

  return (
    <div className="relative h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={72}
            outerRadius={110}
            paddingAngle={chartData.length > 1 ? 2 : 0}
            stroke="none"
          >
            {chartData.map((segment) => (
              <Cell
                key={segment.name}
                fill={
                  segment.name === "Remaining"
                    ? REMAINING_COLOR
                    : serviceBarColor(segment.name)
                }
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [`${value} credits`, ""]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              fontSize: 13,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-3xl font-bold text-slate-900">{remaining}</p>
        <p className="text-xs font-medium text-slate-500">
          of {totalCredits} credits remaining
        </p>
      </div>
    </div>
  );
}