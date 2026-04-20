import React, { useEffect, useState, useRef } from 'react';
import { api } from '../src/services/api';
import type { OrderRecord } from '../types';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 50;

const SEARCH_FIELDS = [
  { label: 'Order Number', key: 'OrderNumber' },
  { label: 'Material', key: 'Material Number' },
  { label: 'Sales Document', key: 'SalesDocument' },
  { label: 'Batch', key: 'BatchNumber' },
  { label: 'Status', key: 'Status' } 
];

const STATUS_FILTER_OPTIONS = [
  'Shipped',
  'Canceled',
  'Duplicate',
  'PA',
  'Not shipped'
];

interface ReconciliationProps {
  onEdit: (id: string) => void;
}

export const Reconciliation: React.FC<ReconciliationProps> = ({ onEdit }) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [totalRecords, setTotalRecords] = useState(0);

  const [searchField, setSearchField] = useState(SEARCH_FIELDS[0].key);
  const [searchText, setSearchText] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // --- Logic Helpers ---

  const getCalculatedType = (order: OrderRecord): string => {
    const clubNameStr = String(order.ClubName || '').toUpperCase();
    const batchStr = String(order.BatchNumber || '').toUpperCase();
    
    if (clubNameStr.includes('MTO') || batchStr.includes('MTO')) {
      return 'MTO';
    }

    const salesDoc = String(order.SalesDocument || '');
    if (salesDoc.startsWith('1000')) return 'ZBC';
    if (salesDoc.startsWith('450')) return 'ZRP';
    if (salesDoc.startsWith('750')) return 'ZMO';
    if (salesDoc.startsWith('650')) return 'ZBO';

    return String(order.OrderType || 'N/A');
  };

  const getCalculatedCDD = (order: OrderRecord): string => {
    if (!order.OrderDate) return 'N/A';
    
    try {
      const baseDate = new Date(String(order.OrderDate));
      if (isNaN(baseDate.getTime())) return String(order.CDD || 'N/A');

      const clubNameLower = String(order.ClubName || '').toLowerCase();
      const isReplacement = clubNameLower.includes('replacements as');
      
      const offset = isReplacement ? 2 : 4;
      const cddDate = new Date(baseDate);
      cddDate.setDate(baseDate.getDate() + offset);

      const m = cddDate.getMonth() + 1;
      const d = cddDate.getDate();
      const y = cddDate.getFullYear().toString().slice(-2);
      return `${m}/${d}/${y}`;
    } catch (e) {
      return String(order.CDD || 'N/A');
    }
  };

  // --- Data Fetching ---

  const [searchTrigger, setSearchTrigger] = useState(0);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getOrders({
        page: currentPage,
        limit: PAGE_SIZE,
        searchField,
        searchText,
        statusFilters
      });
      
      setOrders(result.orders.map(o => ({ ...o, Code: o.Code || (o as any)._id })));
      setTotalRecords(result.total);
      setHasNextPage(result.hasNextPage);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [currentPage, statusFilters, searchTrigger]);

  const handleSearchSubmit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    setCurrentPage(1);
    setSearchTrigger(prev => prev + 1);
  };

  const handleClear = () => { 
    setSearchText(''); 
    setStatusFilters([]); 
    setCurrentPage(1); 
    setSearchTrigger(prev => prev + 1);
  };

  const toggleFilter = (option: string) => {
      const newFilters = statusFilters.includes(option) ? statusFilters.filter(f => f !== option) : [...statusFilters, option];
      setStatusFilters(newFilters);
      setCurrentPage(1);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(event.target as Node)) setIsFilterOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="bg-white rounded-xl shadow-soft border border-slate-100 p-4 z-20">
        <form onSubmit={handleSearchSubmit} className="flex flex-col xl:flex-row gap-4 xl:items-center justify-between">
            <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto flex-1">
                <div className="w-full md:w-40 xl:w-48">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Search By</label>
                    <select value={searchField} onChange={(e) => setSearchField(e.target.value)} className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none">
                        {SEARCH_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                </div>
                <div className="w-full md:flex-1 relative">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Keywords</label>
                    <div className="relative">
                        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder={`Search...`} className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                             <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 mb-0.5 items-end">
                    <button type="submit" disabled={loading} className="px-5 py-2 h-[42px] bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium shadow-md transition-transform active:scale-95 disabled:opacity-50 min-w-[120px]">
                        {loading ? 'Processing...' : 'Search DB'}
                    </button>
                    {(searchText || statusFilters.length > 0) && !loading && (
                        <button type="button" onClick={handleClear} className="px-4 py-2 h-[42px] bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors">Reset</button>
                    )}
                </div>
            </div>
            <div className="flex items-end justify-between xl:justify-end w-full xl:w-auto gap-4 border-t xl:border-t-0 border-slate-100 pt-4 xl:pt-0">
                <div className="relative" ref={filterRef}>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
                  <button type="button" onClick={() => setIsFilterOpen(!isFilterOpen)} className={`flex items-center justify-between w-full md:w-48 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${statusFilters.length > 0 ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <span className="truncate">{statusFilters.length === 0 ? 'Filter Status' : `${statusFilters.length} Active`}</span>
                    <svg className={`w-4 h-4 ml-2 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {isFilterOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-100 z-50 animate-fade-in-down">
                      <div className="p-2 space-y-1">
                        {STATUS_FILTER_OPTIONS.map(option => (
                          <label key={option} className="flex items-center px-3 py-2 hover:bg-slate-50 rounded-md cursor-pointer group">
                            <input type="checkbox" checked={statusFilters.includes(option)} onChange={() => toggleFilter(option)} className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 transition-colors" />
                            <span className="ml-3 text-sm text-slate-700 group-hover:text-slate-900">{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
            </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-card border border-slate-100 overflow-hidden flex flex-col flex-1 min-h-0 w-full">
        <div className="flex-1 w-full overflow-x-auto overflow-y-auto relative scrollbar-thin block">
          <table className="w-full min-w-[1200px] table-auto divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                {['Order #', 'Sales Doc', 'Date', 'Batch', 'Year', 'Material', 'Club', 'Type', 'Status', 'CDD', 'Tracking'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap border-b border-slate-200">{h}</th>
                ))}
                {isAdmin && <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap border-b border-slate-200">Action</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-50">
              {error ? (
                 <tr><td colSpan={isAdmin ? 12 : 11} className="px-6 py-12 text-center text-red-500">{error}</td></tr>
              ) : loading ? (
                 <tr>
                  <td colSpan={isAdmin ? 12 : 11} className="text-center py-20 text-slate-400">
                    <div className="flex flex-col items-center gap-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
                      <div className="flex flex-col gap-1">
                        <span className="text-brand-700 font-bold uppercase tracking-widest text-xs">Loading Database...</span>
                        <span className="text-slate-400 text-[10px]">This may take a moment for large datasets.</span>
                      </div>
                    </div>
                  </td>
                 </tr>
              ) : orders.length === 0 ? (
                 <tr><td colSpan={isAdmin ? 12 : 11} className="text-center py-20 text-slate-400">No results found. Try a different search.</td></tr>
              ) : (
                orders.map((order) => {
                  const status = (order.Status || '').toLowerCase();
                  let statusColor = 'bg-slate-100 text-slate-600 border border-slate-200';
                  if (status.includes('shipped')) statusColor = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                  else if (status.includes('canceled')) statusColor = 'bg-rose-50 text-rose-700 border border-rose-200';
                  
                  const displayType = getCalculatedType(order);
                  const displayCDD = getCalculatedCDD(order);

                  return (
                    <tr key={order.Code} className="hover:bg-slate-50 transition-colors duration-150 group text-sm">
                      <td className="px-3 py-3 text-slate-900 font-medium truncate">{order.OrderNumber}</td>
                      <td className="px-3 py-3 text-slate-600 truncate">{order.SalesDocument}</td>
                      <td className="px-3 py-3 text-slate-600 whitespace-nowrap truncate">{order.OrderDate}</td>
                      <td className="px-3 py-3 text-slate-600 truncate">{order.BatchNumber}</td>
                      <td className="px-3 py-3 text-slate-600 truncate">{order.Year}</td>
                      <td className="px-3 py-3 truncate font-medium text-slate-700">{order["Material Number"]}</td>
                      <td className="px-3 py-3 text-slate-600 truncate" title={order.ClubName}>{order.ClubName}</td>
                      <td className="px-3 py-3">
                         <span className={`font-bold ${displayType === 'MTO' ? 'text-purple-600' : 'text-slate-700'}`}>
                           {displayType}
                         </span>
                      </td>
                      <td className="px-3 py-3">
                         <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full truncate ${statusColor}`}>
                           {order.Status}
                         </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600 font-bold truncate">{displayCDD}</td>
                      <td className="px-3 py-3 text-slate-500 font-mono text-xs truncate">{order.UPSTrackingNumber}</td>
                      {isAdmin && (
                        <td className="px-3 py-3 text-center">
                          <button onClick={() => onEdit(order.Code)} className="text-brand-600 hover:text-brand-800 font-medium hover:underline text-xs">Edit</button>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {orders.length > 0 && !loading && (
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
               <div className="text-xs text-slate-500">Found {totalRecords} records</div>
               <div className="flex items-center gap-2">
                 <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 bg-white border rounded text-sm disabled:opacity-50">Prev</button>
                 <span className="text-sm font-medium">Page {currentPage}</span>
                 <button onClick={() => setCurrentPage(p => p + 1)} disabled={!hasNextPage} className="px-3 py-1 bg-white border rounded text-sm disabled:opacity-50">Next</button>
               </div>
            </div>
        )}
      </div>
    </div>
  );
};
