import React from 'react';
import type { AnalyticsData } from '../lib/api';

export const CategoryDistributionChart: React.FC<{ data: AnalyticsData['byCategory'] }> = ({ data }) => {
  const max = Math.max(1, ...data.map((d) => d.count));

  if (data.length === 0) {
    return <p className="text-sm text-slate-500 py-6">No complaints recorded in this scope yet.</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const pct = Math.round((item.count / max) * 100);
        return (
          <div key={item.category} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-800 truncate pr-2">{item.category}</span>
              <span className="font-mono tabular-nums text-slate-600 font-semibold">{item.count}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden">
              <div
                className="h-full bg-[#0D9488] rounded-sm transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const DepartmentPerformanceChart: React.FC<{ data: AnalyticsData['byDepartment'] }> = ({ data }) => {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500 py-6">No departmental assignment records in this scope.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
            <th className="py-2.5 pr-4">Department</th>
            <th className="py-2.5 px-3 text-right">Assigned</th>
            <th className="py-2.5 px-3 text-right">Resolved</th>
            <th className="py-2.5 px-3 text-right">Overdue</th>
            <th className="py-2.5 pl-3 text-right">Resolution Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {data.map((dept) => {
            const rate = dept.total > 0 ? Math.round((dept.resolved / dept.total) * 100) : 0;
            return (
              <tr key={dept.id} className="hover:bg-slate-50">
                <td className="py-2.5 pr-4 font-medium text-[#0B1F3A]">{dept.name}</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">{dept.total}</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-teal-700 font-medium">{dept.resolved}</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-red-700 font-medium">{dept.overdue}</td>
                <td className="py-2.5 pl-3 text-right font-mono tabular-nums">
                  <div className="inline-flex items-center gap-2 justify-end">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                      <div className="h-full bg-[#0B1F3A]" style={{ width: `${rate}%` }} />
                    </div>
                    <span className="w-9 text-right text-slate-800 font-semibold">{rate}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
