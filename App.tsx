
import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Reconciliation } from './pages/Reconciliation';
import { UserManagement } from './pages/UserManagement';
import { EditOrder } from './pages/EditOrder';
import { ClubOrder } from './pages/ClubOrder';
import { Shipment } from './pages/Shipment';
import { UserProfile } from './pages/UserProfile';
import { AppRoute } from './types';

const PlaceholderPage: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  // ... rest of PlaceHolderPage ...
  <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8 bg-white rounded-2xl shadow-soft border border-slate-100">
    <div className="bg-slate-50 p-6 rounded-full mb-6">
      <svg className="w-12 h-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    </div>
    <h2 className="text-2xl font-bold text-slate-800 mb-2">{title}</h2>
    <p className="text-slate-500 max-w-sm">{subtitle}</p>
    <button className="mt-6 px-6 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
      Notify me when ready
    </button>
  </div>
);

const App: React.FC = () => {
  const { user, userProfile, loading, logout, authError } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(AppRoute.RECONCILIATION);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      if (document.body.classList.contains('viewer-mode') === false && userProfile?.role === 'viewer') {
        document.body.classList.add('viewer-mode');
      } else if (userProfile?.role !== 'viewer') {
        document.body.classList.remove('viewer-mode');
      }
      fetch(`${import.meta.env.VITE_API_BASE || ''}/api/last-updated`)
        .then(res => res.json())
        .then(data => {
          if (data.lastUpdated) {
            setLastUpdated(new Date(data.lastUpdated).toLocaleString());
          }
        })
        .catch(err => console.error('Failed to fetch last updated', err));
    }
  }, [user, currentRoute, userProfile]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-2xl shadow-soft border border-slate-100 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
             <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-slate-500 mb-6">{authError}</p>
          <a href="/" className="px-6 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition">Go to Home</a>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const navItems = [
    { id: AppRoute.RECONCILIATION, label: 'Reconciliation' },
    { id: AppRoute.CLUB_ORDER, label: 'Club Order' },
    { id: AppRoute.SHIPMENT, label: 'Shipment' },
    { id: AppRoute.GOOD_RECEIVE, label: 'Good Received' },
    { id: AppRoute.ORDER_CLOSING, label: 'Order Closing' },
  ];

  if (userProfile?.role === 'admin') {
     navItems.push({ id: AppRoute.EXTRACTOR, label: 'Extractor' });
  }

  const handleEditOrder = (orderId: string) => {
    setEditingOrderId(orderId);
    setCurrentRoute(AppRoute.EDIT_ORDER);
  };

  const handleBackToReconciliation = () => {
    setEditingOrderId(null);
    setCurrentRoute(AppRoute.RECONCILIATION);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
      {/* Top Notification Banner */}
      {lastUpdated && (
        <div className="bg-brand-600 text-white text-xs font-semibold py-1.5 px-4 text-center tracking-wide shadow-sm z-[60] relative">
          Last Updated: {lastUpdated}
        </div>
      )}
      
      {/* Top Navigation Bar - Dark Theme */}
      <nav className="bg-slate-900 shadow-xl sticky top-0 z-50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            
            {/* Logo & Desktop Menu */}
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center gap-2 mr-8">
                <div className="h-8 w-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-brand-500/20">
                  O
                </div>
                <span className="font-bold text-xl text-white tracking-tight">Order Management</span>
              </div>
              <div className="hidden md:flex md:space-x-1">
                {navItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentRoute(item.id)}
                    className={`${currentRoute === item.id 
                      ? 'bg-slate-800 text-white shadow-inner' 
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'} 
                      px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ease-in-out`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* User Profile & Actions */}
            <div className="hidden md:flex items-center ml-4 space-x-6">
               {userProfile?.role === 'admin' && (
                 <button 
                  onClick={() => setCurrentRoute(AppRoute.USERS)}
                  className={`text-sm font-medium transition-colors flex items-center gap-1 ${currentRoute === AppRoute.USERS ? 'text-brand-400' : 'text-slate-400 hover:text-white'}`}
                 >
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                   Users
                 </button>
               )}
               
               <div className="h-8 w-px bg-slate-700"></div>

               <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentRoute(AppRoute.USER_PROFILE)}>
                 <div className="flex flex-col items-end">
                   <span className="text-sm font-medium text-white leading-tight hover:text-brand-300 transition-colors">{userProfile?.name}</span>
                   <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                       userProfile?.role === 'admin' 
                         ? 'bg-purple-900/50 text-purple-200 border-purple-700/50' 
                         : userProfile?.role === 'viewer' ? 'bg-orange-900/50 text-orange-200 border-orange-700/50' : 'bg-slate-800 text-slate-300 border-slate-700'
                   }`}>
                       {userProfile?.role}
                   </span>
                 </div>
                 <div className="h-8 w-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs text-white font-bold hover:bg-slate-600 transition-colors">
                    {userProfile?.name?.charAt(0) || 'U'}
                 </div>
               </div>
               
               <button 
                 onClick={logout}
                 className="text-slate-400 hover:text-white transition-colors"
                 title="Logout"
               >
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                 </svg>
               </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="-mr-2 flex items-center md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
              >
                <span className="sr-only">Open main menu</span>
                {isMobileMenuOpen ? (
                  <svg className="block h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="block h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-t border-slate-800 shadow-xl">
            <div className="pt-2 pb-3 space-y-1 px-2">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setCurrentRoute(item.id); setIsMobileMenuOpen(false); }}
                  className={`${currentRoute === item.id 
                    ? 'bg-brand-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'} 
                    block px-3 py-2 rounded-md text-base font-medium w-full text-left transition-colors`}
                >
                  {item.label}
                </button>
              ))}
              {userProfile?.role === 'admin' && (
                <button
                  onClick={() => { setCurrentRoute(AppRoute.USERS); setIsMobileMenuOpen(false); }}
                  className={`${currentRoute === AppRoute.USERS
                    ? 'bg-brand-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'} 
                    block px-3 py-2 rounded-md text-base font-medium w-full text-left transition-colors`}
                >
                  Manage Users
                </button>
              )}
            </div>
            <div className="pt-4 pb-4 border-t border-slate-800">
              <div className="flex items-center px-5">
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
                    {userProfile?.name?.charAt(0)}
                  </div>
                </div>
                <div className="ml-3">
                  <div className="flex items-center gap-2">
                      <div className="text-base font-medium leading-none text-white">{userProfile?.name}</div>
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${
                         userProfile?.role === 'admin' 
                           ? 'bg-purple-900/50 text-purple-200 border-purple-700/50' 
                           : 'bg-slate-800 text-slate-300 border-slate-700'
                       }`}>
                         {userProfile?.role}
                      </span>
                  </div>
                  <div className="text-sm font-medium leading-none text-slate-400 mt-1">{userProfile?.email}</div>
                </div>
                <button 
                  onClick={logout}
                  className="ml-auto bg-slate-800 p-2 rounded-full text-slate-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content Area */}
      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 ${currentRoute === AppRoute.RECONCILIATION || currentRoute === AppRoute.EXTRACTOR ? 'max-w-[1600px] lg:px-12 2xl:max-w-full' : 'max-w-7xl'}`}>
        <div className="animate-fade-in-up h-full">
            {currentRoute === AppRoute.RECONCILIATION && <Reconciliation onEdit={handleEditOrder} />}
            {currentRoute === AppRoute.EDIT_ORDER && editingOrderId && <EditOrder orderId={editingOrderId} onBack={handleBackToReconciliation} />}
            {currentRoute === AppRoute.CLUB_ORDER && <ClubOrder />}
            {currentRoute === AppRoute.SHIPMENT && <Shipment />}
            {currentRoute === AppRoute.GOOD_RECEIVE && <PlaceholderPage title="Goods Received" subtitle="Track incoming inventory, verify shipments, and update stock levels." />}
            {currentRoute === AppRoute.ORDER_CLOSING && <PlaceholderPage title="Order Closing" subtitle="Finalize transactions, generate invoices, and archive completed orders." />}
            {currentRoute === AppRoute.EXTRACTOR && (
                <div className="w-full h-[85vh] bg-white rounded-xl shadow-soft overflow-hidden border border-slate-100">
                    <iframe src="/extractor.html" className="w-full h-full border-none" title="Extractor"></iframe>
                </div>
            )}
            {currentRoute === AppRoute.USERS && <UserManagement />}
            {currentRoute === AppRoute.USER_PROFILE && <UserProfile />}
        </div>
      </main>
    </div>
  );
};

export default App;
