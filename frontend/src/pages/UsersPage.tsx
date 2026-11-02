import { useEffect, useState } from 'react';
import { getUsers, updateUserRole } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';
import api from '../services/api';
import {
  Users, UserPlus, Shield, Briefcase, Loader2, X,
  Mail, Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTime } from '../utils/helpers';

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'worker'>('worker');
  const [inviting, setInviting] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    getUsers()
      .then(setUsers)
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateUserRole(userId, newRole);
      toast.success('Role updated');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      await api.post('/auth/invite', {
        email: inviteEmail.trim(),
        fullName: inviteName.trim(),
        password: invitePassword,
        role: inviteRole,
      });
      toast.success(`User invited as ${inviteRole}`);
      setShowInvite(false);
      setInviteEmail('');
      setInviteName('');
      setInvitePassword('');
      setInviteRole('worker');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to invite user');
    } finally {
      setInviting(false);
    }
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">Access Denied</p>
        <p className="text-sm text-slate-400">Administrator privileges required</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage users and their roles. {users.length} total users.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Invite User
        </button>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Invite New User</h2>
              </div>
              <button onClick={() => setShowInvite(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Email *</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="user@company.com"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Initial Password *</label>
                <input
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Min. 6 characters"
                  required
                  minLength={6}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  The user should change their password after first login
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Role *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInviteRole('worker')}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      inviteRole === 'worker'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Briefcase className="w-4 h-4" />
                    Worker
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteRole('admin')}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      inviteRole === 'admin'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    Admin
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {inviting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Invite User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-200/60">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No users yet</p>
          <p className="text-sm text-slate-400">Invite users to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
                  <th className="px-6 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                          u.role === 'admin'
                            ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
                            : 'bg-gradient-to-br from-blue-500 to-cyan-600'
                        }`}>
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{u.fullName}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        u.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                        {u.role === 'admin' ? 'Admin' : 'Worker'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDateTime(u.createdAt)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {u.id !== currentUser?.id ? (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="worker">Worker</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Current user</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
