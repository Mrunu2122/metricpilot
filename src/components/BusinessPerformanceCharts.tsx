'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import datasetRaw from '@/data/businessMetrics.json';

const data = datasetRaw.metrics.map((m) => ({
  month: m.label.replace(' 2024', ''),
  fullMonth: m.label,
  revenue: m.revenue,
  spend: m.marketingSpend,
  orders: m.orders,
  cac: m.customerAcquisitionCost,
}));

export function BusinessPerformanceCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 my-6">
      {/* Revenue & Marketing Spend Trend */}
      <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-200">12-Month Revenue & Spend Trajectory</h4>
            <p className="text-xs text-slate-400">Notice July anomaly drop before Q4 holiday surge</p>
          </div>
          <span className="text-[10px] font-mono uppercase bg-slate-800/80 px-2 py-0.5 rounded text-cyan-400 border border-slate-700">
            USD ($)
          </span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(val) => `$${val / 1000}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                formatter={(val: any) => [`$${Number(val).toLocaleString()}`, '']}
              />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
              <Area type="monotone" dataKey="spend" name="Marketing Spend" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorSpend)" />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CAC vs Orders */}
      <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Customer Acquisition Cost vs. Order Volume</h4>
            <p className="text-xs text-slate-400">July CAC spiked to $53.85 due to Paid Social ad platform degradation</p>
          </div>
          <span className="text-[10px] font-mono uppercase bg-slate-800/80 px-2 py-0.5 rounded text-indigo-400 border border-slate-700">
            Efficiency
          </span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(val) => `${val}`} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(val) => `$${val}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
              />
              <Bar yAxisId="left" dataKey="orders" name="Total Orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="cac" name="Blended CAC ($)" fill="#eab308" radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
