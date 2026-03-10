import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { User, DashboardMetrics, STATUS_LABELS, STATUS_COLORS } from '../types';

interface Props { user: User }

export default function DashboardPage({ user }: Props) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      const data = await api.get('/sales/dashboard/metrics');
      setMetrics(data);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  if (!metrics) return <div className="text-navy-500">Failed to load dashboard</div>;

  const totalRevenue = metrics.monthlyRevenue.reduce((sum, m) => sum + (m.total || 0), 0);
  const currentMonth = metrics.monthlyRevenue[metrics.monthlyRevenue.length - 1];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Dashboard</h1>
          <p className="text-navy-500 text-sm mt-1">Welcome back, {user.first_name}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <div className="text-sm text-navy-500 mb-1">Total Accounts</div>
          <div className="text-2xl font-bold text-navy-900">{metrics.totalAccounts}</div>
        </div>
        <div className="card">
          <div className="text-sm text-navy-500 mb-1">Needs Follow-Up</div>
          <div className="text-2xl font-bold text-brand-600">{metrics.dormantCount}</div>
          <div className="text-xs text-navy-400 mt-1">No contact in 14+ days</div>
        </div>
        <div className="card">
          <div className="text-sm text-navy-500 mb-1">This Month Revenue</div>
          <div className="text-2xl font-bold text-green-600">
            ${(currentMonth?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-navy-500 mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-navy-900">
            ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Pipeline & Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Pipeline by status */}
        <div className="card">
          <h2 className="font-bold text-navy-900 mb-4">Pipeline Overview</h2>
          <div className="space-y-3">
            {metrics.statusCounts.map((sc) => {
              const status = sc.status as keyof typeof STATUS_LABELS;
              const percentage = metrics.totalAccounts > 0 ? (sc.count / metrics.totalAccounts) * 100 : 0;
              return (
                <div key={sc.status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-navy-700">{STATUS_LABELS[status] || sc.status}</span>
                    <span className="font-medium text-navy-900">{sc.count}</span>
                  </div>
                  <div className="w-full h-2.5 bg-navy-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        status === 'active' ? 'bg-green-500' :
                        status === 'prospect' ? 'bg-blue-500' :
                        status === 'cold' ? 'bg-gray-400' :
                        status === 'dnc' ? 'bg-red-400' : 'bg-yellow-400'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly Revenue Chart (simple bar chart) */}
        <div className="card">
          <h2 className="font-bold text-navy-900 mb-4">Monthly Revenue</h2>
          {metrics.monthlyRevenue.length > 0 ? (
            <div className="space-y-2">
              {metrics.monthlyRevenue.map((m) => {
                const maxRevenue = Math.max(...metrics.monthlyRevenue.map(r => r.total || 0));
                const percentage = maxRevenue > 0 ? ((m.total || 0) / maxRevenue) * 100 : 0;
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-xs text-navy-500 w-16">{m.month}</span>
                    <div className="flex-1 h-6 bg-navy-50 rounded overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded transition-all flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      >
                        {percentage > 15 && (
                          <span className="text-[10px] text-white font-medium">
                            ${(m.total || 0).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {percentage <= 15 && (
                      <span className="text-xs text-navy-500">${(m.total || 0).toLocaleString()}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-navy-400 text-sm py-8 text-center">No sales data yet. Import from AccountEdge to see revenue trends.</p>
          )}
        </div>
      </div>

      {/* Bottom row: Top Accounts & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Accounts */}
        <div className="card">
          <h2 className="font-bold text-navy-900 mb-4">Top Accounts by Revenue</h2>
          {metrics.topAccounts.length > 0 ? (
            <div className="space-y-3">
              {metrics.topAccounts.slice(0, 5).map((a, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-navy-50 last:border-0">
                  <div>
                    <div className="font-medium text-navy-900 text-sm">{a.shop_name}</div>
                    <div className="text-xs text-navy-400">{a.city} — {a.sale_count} sales</div>
                  </div>
                  <div className="text-sm font-bold text-green-600">
                    ${a.total_revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-navy-400 text-sm py-8 text-center">No sales data yet.</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h2 className="font-bold text-navy-900 mb-4">Recent Activity</h2>
          {metrics.recentActivities.length > 0 ? (
            <div className="space-y-3">
              {metrics.recentActivities.map((a) => (
                <Link
                  key={a.id}
                  to={`/accounts/${a.account_id}`}
                  className="flex items-start gap-3 py-2 border-b border-navy-50 last:border-0 hover:bg-navy-50 -mx-2 px-2 rounded transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center text-sm flex-shrink-0">
                    {a.activity_type === 'call' ? '📞' : a.activity_type === 'email' ? '📧' : a.activity_type === 'visit' ? '🚗' : '📋'}
                  </div>
                  <div>
                    <div className="text-sm text-navy-900">
                      <span className="font-medium">{a.first_name}</span> logged a {a.activity_type} with <span className="font-medium">{a.shop_name}</span>
                    </div>
                    <div className="text-xs text-navy-400 mt-0.5">
                      {new Date(a.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-navy-400 text-sm py-8 text-center">No recent activity. Start logging calls and visits!</p>
          )}
        </div>
      </div>
    </div>
  );
}
