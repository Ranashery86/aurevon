"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type CreditsDonutProps = {
  used: number;
  remaining: number;
  total: number;
};

export function CreditsDonut({ used, remaining, total }: CreditsDonutProps) {
  const safeRemaining = Math.max(0, remaining);
  const data = [
    { name: "Used", value: Math.max(0, used) },
    { name: "Remaining", value: safeRemaining },
  ];

  return (
    <div className="relative h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={72}
            outerRadius={110}
            paddingAngle={safeRemaining > 0 ? 2 : 0}
            stroke="none"
          >
            <Cell fill="#ff6b5b" />
            <Cell fill="#e2e8f0" />
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
        <p className="text-3xl font-bold text-slate-900">{safeRemaining}</p>
        <p className="text-xs font-medium text-slate-500">
          of {total} credits remaining
        </p>
      </div>
    </div>
  );
}