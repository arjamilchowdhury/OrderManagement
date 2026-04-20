import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../src/services/api';

export const UserProfile: React.FC = () => {
  const { userProfile } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile?.uid && userProfile.uid !== 'viewer') {
      api.getShareToken(userProfile.uid)
        .then(t => setToken(t))
        .catch(e => console.error("Could not fetch token", e));
    }
  }, [userProfile]);

  const handleGenerateList = async () => {
    if (!userProfile?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const newToken = await api.generateShareToken(userProfile.uid);
      setToken(newToken);
      setCopied(false);
    } catch (e: any) {
      setError(e.message || 'Failed to generate token');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeList = async () => {
    if (!userProfile?.uid) return;
    if (!confirm('Are you sure you want to revoke the shared link? Existing viewers will instantly lose access.')) return;
    setLoading(true);
    setError(null);
    try {
      await api.revokeShareToken(userProfile.uid);
      setToken(null);
    } catch (e: any) {
      setError(e.message || 'Failed to revoke token');
    } finally {
      setLoading(false);
    }
  };

  const shareUrl = token ? `${window.location.origin}/view/${token}` : '';

  const copyToClipboard = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (userProfile?.role === 'viewer') {
    return (
      <div className="bg-white rounded-2xl shadow-soft border border-slate-100 p-8 max-w-lg mx-auto mt-10">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">You are viewing as a Guest</h2>
        <p className="text-slate-500 mb-6">
          You are currently accessing this application via a read-only shared link. 
          You cannot generate new sharing links from this session.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-soft border border-slate-100 p-8 max-w-3xl mx-auto mt-10">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Share Access</h2>
      <p className="text-slate-500 mb-6">
        Generate a secure, view-only hyperlink to share your view with external clients or stakeholders.
        Anyone with this link can view the data without needing to log in, but they will not be able to make any changes.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm mb-6 flex">
            {error}
        </div>
      )}

      {!token ? (
        <button
          onClick={handleGenerateList}
          disabled={loading}
          className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors disabled:opacity-70 shadow-sm"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          {loading ? 'Generating...' : 'Generate View-Only Hyperlink'}
        </button>
      ) : (
        <div className="space-y-4">
            <label className="block text-sm font-bold text-slate-700 tracking-wide uppercase">Your Shared Link</label>
            <div className="flex bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200 transition-all">
               <input 
                 type="text" 
                 readOnly 
                 value={shareUrl}
                 className="flex-1 bg-transparent border-none px-4 py-3 text-slate-700 focus:outline-none"
               />
               <button
                 onClick={copyToClipboard}
                 className="flex items-center justify-center gap-2 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 border-l border-slate-200 font-medium transition-colors"
               >
                 {copied ? (
                   <>
                     <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                     </svg>
                     <span className="text-green-600">Copied!</span>
                   </>
                 ) : (
                   <>
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                     </svg>
                     Copy Link
                   </>
                 )}
               </button>
            </div>
            
            <div className="pt-4 flex gap-3 border-t border-slate-100 mt-6">
                <button
                  onClick={handleGenerateList}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-slate-700"
                >
                  Regenerate Link
                </button>
                <button
                  onClick={handleRevokeList}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  Revoke Link
                </button>
            </div>
        </div>
      )}
    </div>
  );
};
