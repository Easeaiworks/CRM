import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { User, Account, STATUS_LABELS, STATUS_COLORS, StatusType } from '../types';

interface Props { user: User }

export default function AccountsPage({ user }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, [page, statusFilter]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: page.toString(), limit: '25' };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const data = await api.get('/accounts', params);
      setAccounts(data.accounts);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadAccounts();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Accounts</h1>
          <p className="text-navy-500 text-sm mt-1">{total} total accounts</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
          + New Account
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <div className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, city, contact..."
                className="input-field"
              />
              <button type="submit" className="btn-primary">Search</button>
            </div>
          </form>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-field w-auto"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Account list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-navy-500">No accounts found</p>
        </div>
      ) : (
        <>
          {/* Mobile: card view */}
          <div className="md:hidden space-y-3">
            {accounts.map((account) => (
              <Link
                key={account.id}
                to={`/accounts/${account.id}`}
                className="card block hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-navy-900">{account.shop_name}</div>
                    <div className="text-sm text-navy-500 mt-1">{account.city || 'No city'}</div>
                    {account.contact_names && (
                      <div className="text-sm text-navy-400 mt-0.5">{account.contact_names}</div>
                    )}
                  </div>
                  <span className={`badge ${STATUS_COLORS[account.status]}`}>
                    {STATUS_LABELS[account.status]}
                  </span>
                </div>
                <div className="flex gap-3 mt-3 text-xs text-navy-400">
                  {account.rep_first_name && <span>Rep: {account.rep_first_name}</span>}
                  {account.phone && <span>📞 {account.phone}</span>}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table view */}
          <div className="hidden md:block card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-navy-100">
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Shop Name</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">City</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Contact</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Rep</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Last Contact</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b border-navy-50 hover:bg-navy-50 transition-colors">
                    <td className="py-3 px-4">
                      <Link to={`/accounts/${account.id}`} className="font-medium text-navy-900 hover:text-brand-600">
                        {account.shop_name}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-sm text-navy-600">{account.city || '-'}</td>
                    <td className="py-3 px-4 text-sm text-navy-600">{account.contact_names || '-'}</td>
                    <td className="py-3 px-4 text-sm text-navy-600">
                      {account.rep_first_name ? `${account.rep_first_name} ${account.rep_last_name}` : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${STATUS_COLORS[account.status]}`}>
                        {STATUS_LABELS[account.status]}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-navy-500">
                      {account.last_contacted_at
                        ? new Date(account.last_contacted_at).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        {account.phone && (
                          <a href={`tel:${account.phone}`} className="text-green-600 hover:text-green-700" title="Call">
                            📞
                          </a>
                        )}
                        {account.email && (
                          <a href={`mailto:${account.email}`} className="text-blue-600 hover:text-blue-700" title="Email">
                            📧
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost disabled:opacity-50"
              >
                Previous
              </button>
              <span className="flex items-center px-4 text-sm text-navy-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-ghost disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <AddAccountModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); loadAccounts(); }}
        />
      )}
    </div>
  );
}

function AddAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    shop_name: '', address: '', city: '', contact_names: '', phone: '', email: '',
    status: 'prospect', account_type: 'collision'
  });
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent, skipDuplicate = false) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await api.post('/accounts', { ...form, skip_duplicate_check: skipDuplicate });
      onCreated();
    } catch (err: any) {
      if (err.status === 409 && err.duplicates) {
        setDuplicates(err.duplicates);
      } else {
        setError(err.error || 'Failed to create account');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-navy-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-navy-900">New Account</h2>
          <button onClick={onClose} className="text-navy-400 hover:text-navy-600 text-xl">&times;</button>
        </div>

        {duplicates.length > 0 ? (
          <div className="p-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <h3 className="font-bold text-yellow-800 mb-2">Potential Duplicate Detected!</h3>
              {duplicates.map((d: any, i: number) => (
                <div key={i} className="text-sm text-yellow-700 mb-1">
                  <strong>{d.shop_name}</strong> ({d.city}) — {(d.score * 100).toFixed(0)}% match
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={(e) => handleSubmit(e, true)} className="btn-primary flex-1">
                Create Anyway
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Shop Name *</label>
              <input type="text" required value={form.shop_name}
                onChange={(e) => setForm(f => ({ ...f, shop_name: e.target.value }))}
                className="input-field" placeholder="e.g. Acme Collision" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1">City</label>
                <input type="text" value={form.city}
                  onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1">Status</label>
                <select value={form.status}
                  onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                  className="input-field">
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Address</label>
              <input type="text" value={form.address}
                onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Contact Name(s)</label>
              <input type="text" value={form.contact_names}
                onChange={(e) => setForm(f => ({ ...f, contact_names: e.target.value }))}
                className="input-field" placeholder="e.g. Joe, John" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1">Phone</label>
                <input type="tel" value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1">Email</label>
                <input type="email" value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  className="input-field" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
