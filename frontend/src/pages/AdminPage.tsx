import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { User } from '../types';

interface Props { user: User }

export default function AdminPage({ user }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', first_name: '', last_name: '', role: 'rep' });
  const [error, setError] = useState('');

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      const data = await api.get('/auth/users');
      setUsers(data.users);
    } catch (err) { console.error(err); }
  };

  const loadAudit = async () => {
    // Audit logs would come from a dedicated endpoint - for now show placeholder
    setAuditLog([]);
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/register', newUser);
      setShowAddUser(false);
      setNewUser({ email: '', password: '', first_name: '', last_name: '', role: 'rep' });
      loadUsers();
    } catch (err: any) {
      setError(err.error || 'Failed to create user');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 mb-6">Admin Panel</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-navy-100 rounded-lg p-1 w-fit">
        {['users', 'audit'].map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab as any); if (tab === 'audit') loadAudit(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500 hover:text-navy-700'
            }`}
          >
            {tab === 'users' ? 'User Management' : 'Audit Log'}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-navy-900">Team Members</h2>
            <button onClick={() => setShowAddUser(true)} className="btn-primary">+ Add User</button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-navy-100">
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Name</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Email</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Role</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-navy-50">
                    <td className="py-3 px-4 font-medium text-navy-900">{u.first_name} {u.last_name}</td>
                    <td className="py-3 px-4 text-sm text-navy-600">{u.email}</td>
                    <td className="py-3 px-4">
                      <span className={`badge ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : u.role === 'manager' ? 'bg-blue-100 text-blue-800' : 'bg-navy-100 text-navy-700'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${u.is_active ? 'badge-active' : 'badge-cold'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-navy-500">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showAddUser && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <h3 className="text-lg font-bold text-navy-900 mb-4">Add Team Member</h3>
                {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
                <form onSubmit={createUser} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input required placeholder="First Name" value={newUser.first_name}
                      onChange={e => setNewUser(u => ({...u, first_name: e.target.value}))} className="input-field" />
                    <input required placeholder="Last Name" value={newUser.last_name}
                      onChange={e => setNewUser(u => ({...u, last_name: e.target.value}))} className="input-field" />
                  </div>
                  <input required type="email" placeholder="Email" value={newUser.email}
                    onChange={e => setNewUser(u => ({...u, email: e.target.value}))} className="input-field" />
                  <input required type="password" placeholder="Password" value={newUser.password}
                    onChange={e => setNewUser(u => ({...u, password: e.target.value}))} className="input-field" />
                  <select value={newUser.role} onChange={e => setNewUser(u => ({...u, role: e.target.value}))} className="input-field">
                    <option value="rep">Sales Rep</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowAddUser(false)} className="btn-secondary flex-1">Cancel</button>
                    <button type="submit" className="btn-primary flex-1">Create</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="card">
          <h2 className="font-bold text-navy-900 mb-4">Audit Log</h2>
          <p className="text-navy-500 text-sm">All changes to accounts, notes, and sales are logged for security.</p>
          <p className="text-navy-400 text-sm mt-2">Audit viewer coming in next release.</p>
        </div>
      )}
    </div>
  );
}
