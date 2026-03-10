import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { User, Account, Note, Activity, STATUS_LABELS, STATUS_COLORS, StatusType } from '../types';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface Props { user: User }

export default function AccountDetailPage({ user }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState<Account | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Account>>({});

  // Note input
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Activity input
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityType, setActivityType] = useState('call');
  const [activityDesc, setActivityDesc] = useState('');

  const { isListening, startListening, stopListening, isSupported } = useVoiceInput(
    (text) => setNewNote(prev => prev + (prev ? ' ' : '') + text)
  );

  useEffect(() => { loadAccount(); }, [id]);

  const loadAccount = async () => {
    try {
      const data = await api.get(`/accounts/${id}`);
      setAccount(data.account);
      setNotes(data.notes);
      setActivities(data.activities);
      setEditForm(data.account);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/accounts/${id}/notes`, {
        content: newNote.trim(),
        is_voice_transcribed: isListening
      });
      setNewNote('');
      loadAccount();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNote(false);
    }
  };

  const logActivity = async () => {
    try {
      await api.post(`/accounts/${id}/activities`, {
        activity_type: activityType,
        description: activityDesc || null
      });
      setShowActivityForm(false);
      setActivityDesc('');
      loadAccount();
    } catch (err) {
      console.error(err);
    }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/accounts/${id}`, editForm);
      setEditing(false);
      loadAccount();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!account) return (
    <div className="card text-center py-12">
      <p className="text-navy-500">Account not found</p>
      <button onClick={() => navigate('/accounts')} className="btn-primary mt-4">Back to Accounts</button>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <button onClick={() => navigate('/accounts')} className="text-sm text-navy-400 hover:text-navy-600 mb-2 flex items-center gap-1">
            ← Back to Accounts
          </button>
          <h1 className="text-2xl font-bold text-navy-900">{account.shop_name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`badge ${STATUS_COLORS[account.status]}`}>{STATUS_LABELS[account.status]}</span>
            {account.city && <span className="text-sm text-navy-500">{account.city}{account.province ? `, ${account.province}` : ''}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {account.phone && (
            <a href={`tel:${account.phone}`} className="btn-primary flex items-center gap-2">
              📞 Call
            </a>
          )}
          {account.email && (
            <a href={`mailto:${account.email}`} className="btn-secondary flex items-center gap-2">
              📧 Email
            </a>
          )}
          <button onClick={() => setEditing(!editing)} className="btn-ghost">
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Account details */}
        <div className="lg:col-span-1 space-y-6">
          {/* Contact Info */}
          <div className="card">
            <h3 className="font-bold text-navy-900 mb-4">Contact Information</h3>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-navy-500 mb-1">Shop Name</label>
                  <input className="input-field" value={editForm.shop_name || ''} onChange={e => setEditForm(f => ({...f, shop_name: e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs text-navy-500 mb-1">Contact Names</label>
                  <input className="input-field" value={editForm.contact_names || ''} onChange={e => setEditForm(f => ({...f, contact_names: e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs text-navy-500 mb-1">Phone</label>
                  <input className="input-field" value={editForm.phone || ''} onChange={e => setEditForm(f => ({...f, phone: e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs text-navy-500 mb-1">Email</label>
                  <input className="input-field" value={editForm.email || ''} onChange={e => setEditForm(f => ({...f, email: e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs text-navy-500 mb-1">Address</label>
                  <input className="input-field" value={editForm.address || ''} onChange={e => setEditForm(f => ({...f, address: e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs text-navy-500 mb-1">City</label>
                  <input className="input-field" value={editForm.city || ''} onChange={e => setEditForm(f => ({...f, city: e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs text-navy-500 mb-1">Status</label>
                  <select className="input-field" value={editForm.status || 'prospect'} onChange={e => setEditForm(f => ({...f, status: e.target.value as StatusType}))}>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <button onClick={saveEdit} className="btn-primary w-full">Save Changes</button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <InfoRow label="Contact(s)" value={account.contact_names} />
                <InfoRow label="Phone" value={account.phone} isLink={`tel:${account.phone}`} />
                <InfoRow label="Email" value={account.email} isLink={`mailto:${account.email}`} />
                <InfoRow label="Address" value={account.address} />
                <InfoRow label="City" value={account.city} />
              </div>
            )}
          </div>

          {/* Business Details */}
          <div className="card">
            <h3 className="font-bold text-navy-900 mb-4">Business Details</h3>
            <div className="space-y-3 text-sm">
              <InfoRow label="Type" value={account.account_type} />
              <InfoRow label="Suppliers" value={account.suppliers} />
              <InfoRow label="Paint Line" value={account.paint_line} />
              <InfoRow label="Sundries" value={account.sundries} />
              <InfoRow label="Allied Products" value={account.allied_products} />
              <InfoRow label="Contract" value={account.has_contract ? 'Yes' : 'No'} />
              <InfoRow label="MPO" value={account.mpo} />
              <InfoRow label="# Techs" value={account.num_techs?.toString()} />
              <InfoRow label="Sq. Footage" value={account.sq_footage} />
              <InfoRow label="Annual Revenue" value={account.annual_revenue ? `$${account.annual_revenue.toLocaleString()}` : null} />
              <InfoRow label="Former Sherwin" value={account.former_sherwin_client ? 'Yes' : 'No'} />
              <InfoRow label="Rep" value={account.rep_first_name ? `${account.rep_first_name} ${account.rep_last_name}` : null} />
              <InfoRow label="Follow-Up" value={account.follow_up_date} />
              <InfoRow label="Last Contact" value={account.last_contacted_at ? new Date(account.last_contacted_at).toLocaleDateString() : 'Never'} />
            </div>
          </div>
        </div>

        {/* Right column: Notes & Activities */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick note input */}
          <div className="card">
            <h3 className="font-bold text-navy-900 mb-3">Add Note</h3>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Type a note or use voice input..."
                  className="input-field min-h-[60px] resize-none pr-10"
                  rows={2}
                />
                {isSupported && (
                  <button
                    onClick={isListening ? stopListening : startListening}
                    className={`absolute right-2 top-2 p-1.5 rounded-lg transition-colors ${
                      isListening ? 'text-brand-500 bg-brand-50' : 'text-navy-400 hover:text-navy-600'
                    }`}
                    title={isListening ? 'Stop recording' : 'Voice input'}
                  >
                    {isListening && <div className="absolute inset-0 bg-brand-500/20 rounded-full voice-pulse" />}
                    <svg className="w-5 h-5 relative" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                    </svg>
                  </button>
                )}
              </div>
              <button onClick={saveNote} disabled={savingNote || !newNote.trim()} className="btn-primary self-end">
                {savingNote ? '...' : 'Save'}
              </button>
            </div>
            {isListening && (
              <div className="text-xs text-brand-500 mt-2 flex items-center gap-1">
                <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                Listening... speak now
              </div>
            )}
          </div>

          {/* Log Activity */}
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-navy-900">Log Activity</h3>
              {!showActivityForm && (
                <div className="flex gap-2">
                  {['call', 'email', 'visit', 'meeting'].map(type => (
                    <button
                      key={type}
                      onClick={() => { setActivityType(type); setShowActivityForm(true); }}
                      className="btn-ghost text-sm py-1 px-3"
                    >
                      {type === 'call' ? '📞' : type === 'email' ? '📧' : type === 'visit' ? '🚗' : '📋'} {type}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {showActivityForm && (
              <div className="flex gap-2">
                <select value={activityType} onChange={e => setActivityType(e.target.value)} className="input-field w-auto">
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="visit">Visit</option>
                  <option value="meeting">Meeting</option>
                </select>
                <input
                  value={activityDesc}
                  onChange={e => setActivityDesc(e.target.value)}
                  placeholder="Quick description..."
                  className="input-field flex-1"
                />
                <button onClick={logActivity} className="btn-primary">Log</button>
                <button onClick={() => setShowActivityForm(false)} className="btn-ghost">Cancel</button>
              </div>
            )}
          </div>

          {/* Notes Timeline */}
          <div className="card">
            <h3 className="font-bold text-navy-900 mb-4">Notes & History</h3>
            {notes.length === 0 && activities.length === 0 ? (
              <p className="text-navy-400 text-sm py-6 text-center">No notes or activities yet. Add your first note above!</p>
            ) : (
              <div className="space-y-4">
                {/* Combine notes and activities, sort by date */}
                {[
                  ...notes.map(n => ({ type: 'note' as const, date: n.created_at, data: n })),
                  ...activities.map(a => ({ type: 'activity' as const, date: a.created_at, data: a }))
                ]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((item, idx) => (
                    <div key={`${item.type}-${idx}`} className="flex gap-3 pb-4 border-b border-navy-50 last:border-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${
                        item.type === 'note' ? 'bg-blue-100' : 'bg-green-100'
                      }`}>
                        {item.type === 'note' ? '📝' :
                          (item.data as Activity).activity_type === 'call' ? '📞' :
                          (item.data as Activity).activity_type === 'email' ? '📧' :
                          (item.data as Activity).activity_type === 'visit' ? '🚗' : '📋'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <span className="text-xs font-medium text-navy-900">
                            {item.type === 'note'
                              ? `${(item.data as Note).first_name} ${(item.data as Note).last_name}`
                              : `${(item.data as Activity).first_name} ${(item.data as Activity).last_name} — ${(item.data as Activity).activity_type}`
                            }
                          </span>
                          <span className="text-xs text-navy-400 flex-shrink-0 ml-2">
                            {new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-navy-700 mt-1 whitespace-pre-wrap">
                          {item.type === 'note'
                            ? (item.data as Note).content
                            : (item.data as Activity).description || `Logged a ${(item.data as Activity).activity_type}`
                          }
                        </p>
                        {item.type === 'note' && (item.data as Note).is_voice_transcribed ? (
                          <span className="inline-flex items-center gap-1 text-xs text-navy-400 mt-1">
                            🎤 Voice transcribed
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, isLink }: { label: string; value: string | null | undefined; isLink?: string }) {
  if (!value || value === 'null') return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-navy-50">
      <span className="text-navy-500">{label}</span>
      {isLink ? (
        <a href={isLink} className="font-medium text-brand-600 hover:text-brand-700">{value}</a>
      ) : (
        <span className="font-medium text-navy-900 text-right">{value}</span>
      )}
    </div>
  );
}
