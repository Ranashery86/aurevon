"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { serviceBarColor } from "@/lib/chart-colors";

type DonutSegment = {
  name: string;
  value: number;
};

type CreditsDonutProps = {
  segments: DonutSegment[];
  totalUsed: number;
};

export function CreditsDonut({ segments, totalUsed }: CreditsDonutProps) {
  // Zero-usage services are dropped so no zero-width slice is rendered.
  const nonEmpty = segments.filter((segment) => segment.value > 0);

  if (nonEmpty.length === 0) {
    return (
      <div className="flex h-72 w-full items-center justify-center">
        <p className="text-sm text-slate-400">
          No activity yet. Your service requests will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={nonEmpty}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={72}
            outerRadius={110}
            paddingAngle={nonEmpty.length > 1 ? 2 : 0}
            stroke="none"
          >
            {nonEmpty.map((segment) => (
              <Cell key={segment.name} fill={serviceBarColor(segment.name)} />
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
        <p className="text-3xl font-bold text-slate-900">{totalUsed}</p>
        <p className="text-xs font-medium text-slate-500">
          credits used this cycle
        </p>
      </div>
    </div>
  );
}