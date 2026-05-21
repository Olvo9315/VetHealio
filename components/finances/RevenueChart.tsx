"use client";

import type { ChartPoint } from "@/lib/actions/invoices";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface RevenueChartProps {
  data: ChartPoint[];
}

function fmt(v: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

export function RevenueChart({ data }: RevenueChartProps) {
  const hasData = data.some((d) => d.amount > 0);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold">Ingresos — últimos 30 días</p>
        <p className="text-xs text-muted-foreground">Solo facturas pagadas</p>
      </div>
      {!hasData ? (
        <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
          Sin datos de ingresos
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}€`}
              width={45}
            />
            <Tooltip
              formatter={(value) => [fmt(Number(value ?? 0)), "Ingresos"]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
                color: "hsl(var(--foreground))",
              }}
            />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
