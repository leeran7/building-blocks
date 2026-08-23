"use client";

/**
 * AltitudeChart — Recharts line chart for altitude history.
 *
 * Design spec: design.md §6.17
 * AC-19: Recharts LineChart with x=date, y=altitude per payment
 * AC-20: Single point → dot visible, no error
 * R-4: Client component only, never imported from server
 *
 * Dynamically imported with ssr:false from BlockCard.
 */

import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

interface Payment {
  id: string;
  amount_cents: number;
  metres_added: number;
  created_at: string;
}

interface AltitudeChartProps {
  payments: Payment[];
  categoryAccent: string;
  displayName?: string;
}

export default function AltitudeChart({
  payments,
  categoryAccent,
  displayName = "this block",
}: AltitudeChartProps) {
  if (payments.length === 0) {
    return (
      <div className="w-full h-[120px] flex items-center justify-center">
        <p className="text-sm text-text-muted text-center">Chart unavailable</p>
      </div>
    );
  }

  // Build cumulative altitude data from payments
  let cumulative = 0;
  const chartData = payments.map((p) => {
    cumulative += p.metres_added;
    return {
      date: new Date(p.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      altitude: Math.round(cumulative * 10) / 10,
    };
  });

  return (
    <div
      className="w-full h-[120px]"
      aria-label={`Altitude history for ${displayName}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
        >
          <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6b6b8a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6b6b8a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#16161f",
              border: "1px solid #1e1e2e",
              borderRadius: "8px",
              color: "#f0f0ff",
              fontSize: 12,
            }}
            itemStyle={{ color: "#f0f0ff" }}
            labelStyle={{ color: "#6b6b8a" }}
          />
          <Line
            type="monotone"
            dataKey="altitude"
            stroke={categoryAccent}
            strokeWidth={2}
            dot={{ r: 4, fill: categoryAccent }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
