import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { auth, db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

export const UserManagement: React.FC = () => {
  const { userProfile } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'view'
  });
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userProfile?.role !== 'admin') return;

    if (!window.confirm("Action Required: This will momentarily sign you out to initialize the new user account. You will need to log back in as Admin.")) {
        return;
    }

    setLoading(true);
    setStatus({ type: 'info', msg: 'Creating user...' });

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const newUid = userCredential.user.uid;

      await set(ref(db, `users/${newUid}`), {
        name: formData.name,
        email: formData.email,
        role: formData.role
      });

      await signOut(auth);

      setStatus({ type: 'success', msg: `User ${formData.email} created successfully. Redirecting...` });
      setFormData({ name: '', email: '', password: '', role: 'view' });
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', msg: err.message || 'Failed to create user.' });
    } finally {
      setLoading(false);
    }
  };

  if (userProfile?.role !== 'admin') {
    return <div className="p-10 text-center text-red-500">Access Denied</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-card border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800">User Administration</h2>
          <p className="text-sm text-slate-500 mt-1">Create new accounts and assign roles.</p>
        </div>
        
        <div className="p-8">
          {status.msg && (
            <div className={`mb-6 px-4 py-3 rounded-lg flex items-center ${status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
              <span className={`h-2 w-2 rounded-full mr-3 ${status.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
              {status.msg}
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="John Doe"
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                  value={formData.name}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="john@example.com"
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password</label>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Access Role</label>
                <select
                  name="role"
                  className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                  value={formData.role}
                  onChange={handleChange}
                >
                  <option value="view">Viewer (Read Only)</option>
                  <option value="admin">Administrator (Full Access)</option>
                </select>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 transition-all hover:shadow-lg"
              >
                {loading && (
                   <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                )}
                {loading ? 'Creating Account...' : 'Create User Account'}
              </button>
              <p className="mt-3 text-xs text-slate-400 text-center bg-yellow-50 text-yellow-700 p-2 rounded border border-yellow-200">
                Note: Creating a user will momentarily sign out the current admin session to initialize the new profile.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};