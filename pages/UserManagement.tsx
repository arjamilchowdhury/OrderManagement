import React, { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, set, get, remove } from 'firebase/database';
import { auth, db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { UserProfile } from '../types';

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
  
  // State for user list
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [fetchingUsers, setFetchingUsers] = useState(true);

  const PROTECTED_EMAIL = 'jamilsapgam@gmail.com';

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setFetchingUsers(true);
    try {
      const snapshot = await get(ref(db, 'users'));
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: UserProfile[] = Object.keys(data).map(key => ({
          uid: key,
          ...data[key]
        }));
        setUserList(list);
      } else {
        setUserList([]);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setFetchingUsers(false);
    }
  };

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
      // 1. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const newUid = userCredential.user.uid;

      // 2. Create DB Record
      await set(ref(db, `users/${newUid}`), {
        name: formData.name,
        email: formData.email,
        role: formData.role
      });

      // 3. Sign out (auth flow requirement for client-side creation)
      await signOut(auth);

      setStatus({ type: 'success', msg: `User ${formData.email} created successfully. Redirecting...` });
      setFormData({ name: '', email: '', password: '', role: 'view' });
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', msg: err.message || 'Failed to create user.' });
      setLoading(false); // Only stop loading on error, otherwise we are redirecting/logging out
    }
  };

  const handleDeleteUser = async (targetUid: string, targetEmail: string) => {
    if (targetEmail === PROTECTED_EMAIL) {
      alert("This Master Admin user cannot be deleted.");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${targetEmail}? This will remove their profile data.`)) {
      return;
    }

    try {
      await remove(ref(db, `users/${targetUid}`));
      // Optimistically update UI
      setUserList(prev => prev.filter(u => u.uid !== targetUid));
      alert("User profile deleted successfully.");
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user record.");
    }
  };

  if (userProfile?.role !== 'admin') {
    return <div className="p-10 text-center text-red-500">Access Denied</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      
      {/* SECTION 1: CREATE USER */}
      <div className="bg-white rounded-xl shadow-card border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Create New User</h2>
            <p className="text-sm text-slate-500 mt-1">Add a new administrator or viewer account.</p>
          </div>
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
                className="w-full md:w-auto md:min-w-[200px] flex justify-center items-center py-2.5 px-6 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 transition-all"
              >
                {loading && (
                   <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                )}
                {loading ? 'Creating Account...' : 'Create User Account'}
              </button>
              <p className="mt-3 text-xs text-slate-400">
                Note: Creating a user will momentarily sign out the current admin session.
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* SECTION 2: USER LIST */}
      <div className="bg-white rounded-xl shadow-card border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
             <h2 className="text-xl font-bold text-slate-800">Existing Users</h2>
             <p className="text-sm text-slate-500 mt-1">Manage current access permissions.</p>
          </div>
          <div className="bg-white px-3 py-1 rounded-full border border-slate-200 text-sm font-semibold text-slate-600 shadow-sm">
            Total Users: {userList.length}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {fetchingUsers ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-slate-400">Loading users...</td>
                </tr>
              ) : userList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-slate-400">No users found.</td>
                </tr>
              ) : (
                userList.map((user) => {
                   const isMasterAdmin = user.email === PROTECTED_EMAIL;
                   const isAdmin = user.role === 'admin';
                   
                   return (
                    <tr key={user.uid} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mr-3 text-xs font-bold">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          {user.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{user.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          isAdmin 
                            ? 'bg-purple-100 text-purple-800' 
                            : 'bg-slate-100 text-slate-800'
                        }`}>
                          {user.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {isMasterAdmin ? (
                          <span className="text-slate-300 cursor-not-allowed text-xs flex items-center justify-end gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            Protected
                          </span>
                        ) : (
                          <button
                            onClick={() => handleDeleteUser(user.uid, user.email)}
                            className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-md transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                   );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};