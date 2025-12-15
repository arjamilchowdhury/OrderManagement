import React, { useEffect, useState, useMemo, useRef } from 'react';
import { db } from '../services/firebase';
import { ref, query, orderByChild, limitToLast, get, endAt } from 'firebase/database';
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

  // --- Modes ---
  // BROWSE: Server-side pagination (Efficient for initial load)
  // SEARCH: Client-side filtering of full dataset (Robust for substring/multi-field search)
  const [mode, setMode] = useState<'BROWSE' | 'SEARCH'>('BROWSE');
  
  // Use ref to track current mode for async callbacks
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // --- State ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Browse Mode State
  const [browseOrders, setBrowseOrders] = useState<OrderRecord[]>([]);
  const [cursorStack, setCursorStack] = useState<Map<number, {value: any, key: string} | null>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);

  // Search Mode State
  const [allData, setAllData] = useState<OrderRecord[]>([]); // Cache for search
  const [searchField, setSearchField] = useState(SEARCH_FIELDS[0].key);
  const [searchText, setSearchText] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  
  // UI State
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // --- 1. Browse Mode Logic (Server Side) ---

  const fetchBrowsePage = async (page: number, cursor: {value: any, key: string} | null) => {
    // Prevent fetching if we've switched modes while waiting
    if (modeRef.current === 'SEARCH') return;

    setLoading(true);
    setError(null);
    try {
      const dbRef = ref(db, 'order_management/master_recon_file');
      let q;

      // Default Browse: Sort by OrderDate Descending
      const baseQuery = query(dbRef, orderByChild('OrderDate'));

      if (cursor) {
        q = query(baseQuery, endAt(cursor.value, cursor.key), limitToLast(PAGE_SIZE + 1));
      } else {
        q = query(baseQuery, limitToLast(PAGE_SIZE));
      }

      const snapshot = await get(q);
      
      // Double check mode after await using ref to get latest state
      // Cast to string to prevent TypeScript from narrowing based on the previous check
      if ((modeRef.current as string) === 'SEARCH') {
          setLoading(false);
          return;
      }
      
      if (snapshot.exists()) {
        const raw: OrderRecord[] = [];
        snapshot.forEach(c => {
          raw.push({ ...c.val(), Code: c.key as string });
        });

        if (cursor) {
           const last = raw[raw.length - 1];
           if (last && last.Code === cursor.key) raw.pop();
        }

        if (raw.length > 0) {
            const boundary = raw[0];
            setCursorStack(prev => {
                const map = new Map(prev);
                map.set(page + 1, { value: boundary.OrderDate, key: boundary.Code });
                return map;
            });
            setHasNextPage(true);
        } else {
            setHasNextPage(false);
        }

        setBrowseOrders(raw.reverse());
        if (raw.length === 0) setHasNextPage(false);

      } else {
        setBrowseOrders([]);
        setHasNextPage(false);
      }
    } catch (err: any) {
      console.error(err);
      if (modeRef.current === 'BROWSE') setError(err.message || 'Failed to load data');
    } finally {
      if (modeRef.current === 'BROWSE') setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'BROWSE') {
        const cursor = currentPage === 1 ? null : cursorStack.get(currentPage) || null;
        fetchBrowsePage(currentPage, cursor);
    }
  }, [mode, currentPage]);

  // --- 2. Search Mode Logic (Client Side "Deep Search") ---

  const initSearch = async () => {
    // Switch to SEARCH immediately so UI shows "Scanning..."
    setMode('SEARCH');
    setLoading(true);
    setError(null);
    
    try {
        const dbRef = ref(db, 'order_management/master_recon_file');
        // Optimization: Get raw data without server sorting to avoid index requirements/delays
        const snapshot = await get(dbRef); 
        
        if (snapshot.exists()) {
            const val = snapshot.val();
            const fullList: OrderRecord[] = [];
            
            // Convert Object to Array
            Object.entries(val).forEach(([key, value]: [string, any]) => {
                fullList.push({ ...value, Code: key });
            });
            
            // Client-side Sort (Newest First)
            fullList.sort((a, b) => {
                const da = a.OrderDate ? new Date(a.OrderDate).getTime() : 0;
                const db = b.OrderDate ? new Date(b.OrderDate).getTime() : 0;
                return db - da;
            });

            setAllData(fullList);
            setCurrentPage(1);
        } else {
            setAllData([]);
        }
    } catch (err: any) {
        console.error(err);
        setError("Failed to download database for searching. Check internet connection.");
    } finally {
        setLoading(false);
    }
  };

  // Derived State for Search Results
  const searchResults = useMemo(() => {
    if (mode !== 'SEARCH') return [];

    return allData.filter(order => {
        // 1. Text Search
        if (searchText.trim()) {
            const val = order[searchField];
            if (!val) return false;
            if (!String(val).toLowerCase().includes(searchText.toLowerCase())) {
                return false;
            }
        }

        // 2. Status Filter
        if (statusFilters.length > 0) {
            const s = (order.Status || '').toLowerCase();
            const matches = statusFilters.some(filter => {
                const f = filter.toLowerCase();
                // Check if status field includes the filter text (e.g. "shipped" in "Order Shipped")
                return s.includes(f);
            });
            if (!matches) return false;
        }

        return true;
    });
  }, [allData, mode, searchText, searchField, statusFilters]);

  const currentSearchPageData = useMemo(() => {
     const start = (currentPage - 1) * PAGE_SIZE;
     return searchResults.slice(start, start + PAGE_SIZE);
  }, [searchResults, currentPage]);

  const searchPageCount = Math.ceil(searchResults.length / PAGE_SIZE);

  // --- Handlers ---

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'BROWSE') {
        initSearch();
    }
  };

  const handleClear = () => {
    setSearchText('');
    setStatusFilters([]);
    setMode('BROWSE');
    setCurrentPage(1);
    setCursorStack(new Map());
    setAllData([]);
    // Browse mode useEffect will trigger data re-fetch
  };

  const toggleFilter = (option: string) => {
      const newFilters = statusFilters.includes(option)
         ? statusFilters.filter(f => f !== option)
         : [...statusFilters, option];
      
      setStatusFilters(newFilters);
      
      // If currently in browse mode, trigger deep search to apply filters across all data
      if (mode === 'BROWSE' && newFilters.length > 0) {
          initSearch();
      }
  };

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Render Helpers ---

  const renderPagination = () => {
     if (mode === 'BROWSE') {
         return (
             <div className="flex items-center gap-2">
                 <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || loading}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                 >
                    Previous
                 </button>
                 <span className="text-sm font-medium text-slate-600 px-2">Page {currentPage}</span>
                 <button
                    onClick={() => setCurrentPage(p => p + 1)}
                    disabled={!hasNextPage || loading}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                 >
                    Next
                 </button>
             </div>
         );
     } else {
         return (
             <div className="flex items-center gap-2">
                 <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                 >
                    Previous
                 </button>
                 <span className="text-sm font-medium text-slate-600 px-2">
                     Page {currentPage} of {searchPageCount || 1}
                 </span>
                 <button
                    onClick={() => setCurrentPage(p => Math.min(searchPageCount, p + 1))}
                    disabled={currentPage >= searchPageCount}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                 >
                    Next
                 </button>
             </div>
         );
     }
  };

  const activeData = mode === 'BROWSE' ? browseOrders : currentSearchPageData;

  return (
    <div className="flex flex-col gap-6 h-full">
      
      {/* 1. Control Panel */}
      <div className="bg-white rounded-xl shadow-soft border border-slate-100 p-4 z-20">
        <form onSubmit={handleSearchSubmit} className="flex flex-col xl:flex-row gap-4 xl:items-center justify-between">
            
            {/* Left: Search Controls */}
            <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto flex-1">
                <div className="w-full md:w-40 xl:w-48">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Search By</label>
                    <select
                        value={searchField}
                        onChange={(e) => setSearchField(e.target.value)}
                        className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                    >
                        {SEARCH_FIELDS.map(f => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                    </select>
                </div>

                <div className="w-full md:flex-1 relative">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Keywords</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder={`Search keywords in ${SEARCH_FIELDS.find(f => f.key === searchField)?.label}...`}
                            className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                             <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                             </svg>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mb-0.5 items-end">
                    <button 
                        type="submit"
                        disabled={loading}
                        className="px-5 py-2 h-[42px] bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium shadow-md transition-transform active:scale-95 disabled:opacity-50"
                    >
                        {loading ? 'Processing...' : (mode === 'SEARCH' ? 'Search Again' : 'Search DB')}
                    </button>
                    
                    {(mode === 'SEARCH' || searchText || statusFilters.length > 0) && (
                        <button 
                            type="button"
                            onClick={handleClear}
                            className="px-4 py-2 h-[42px] bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>

            {/* Right: Filters */}
            <div className="flex items-end justify-between xl:justify-end w-full xl:w-auto gap-4 border-t xl:border-t-0 border-slate-100 pt-4 xl:pt-0">
                <div className="relative" ref={filterRef}>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={`flex items-center justify-between w-full md:w-48 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                      statusFilters.length > 0 
                        ? 'bg-brand-50 border-brand-200 text-brand-700' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">
                      {statusFilters.length === 0 
                        ? 'Filter Status' 
                        : `${statusFilters.length} Active`}
                    </span>
                    <svg className={`w-4 h-4 ml-2 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isFilterOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-100 z-50 animate-fade-in-down">
                      <div className="p-2 space-y-1">
                        {STATUS_FILTER_OPTIONS.map(option => (
                          <label key={option} className="flex items-center px-3 py-2 hover:bg-slate-50 rounded-md cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={statusFilters.includes(option)}
                              onChange={() => toggleFilter(option)}
                              className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 transition-colors"
                            />
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

      {/* 2. Data Table */}
      <div className="bg-white rounded-xl shadow-card border border-slate-100 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-auto relative scrollbar-thin">
          <table className="min-w-full table-fixed divide-y divide-slate-100">
            {/* Columns */}
            <colgroup>
              <col className="w-28" /> 
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-16" />
              <col className="w-96" />
              <col className="w-40" />
              <col className="w-24" />
              <col className="w-32" />
              <col className="w-24" />
              <col className="w-40" />
              {isAdmin && <col className="w-20" />}
            </colgroup>
            
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                {['Order #', 'Sales Doc', 'Date', 'Batch', 'Year', 'Material', 'Club', 'Type', 'Status', 'CDD', 'Tracking'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider truncate border-b border-slate-200">
                        {h}
                    </th>
                ))}
                {isAdmin && <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Action</th>}
              </tr>
            </thead>
            
            <tbody className="bg-white divide-y divide-slate-50">
              {error ? (
                 <tr>
                    <td colSpan={isAdmin ? 12 : 11} className="px-6 py-12 text-center text-red-500">
                      {error}
                    </td>
                 </tr>
              ) : loading ? (
                 <tr><td colSpan={isAdmin ? 12 : 11} className="text-center py-20 text-slate-400">
                    <div className="flex flex-col items-center gap-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                        <span>{mode === 'SEARCH' ? 'Scanning entire database...' : 'Loading orders...'}</span>
                    </div>
                 </td></tr>
              ) : activeData.length === 0 ? (
                 <tr>
                   <td colSpan={isAdmin ? 12 : 11} className="text-center py-20 text-slate-400">
                     {mode === 'SEARCH' 
                       ? `No matches found for "${searchText}" with selected filters.` 
                       : 'No orders available.'}
                   </td>
                 </tr>
              ) : (
                activeData.map((order) => {
                  const status = (order.Status || '').toLowerCase();
                  let statusColor = 'bg-slate-100 text-slate-600 border border-slate-200';
                  if (status.includes('shipped')) statusColor = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                  else if (status.includes('canceled')) statusColor = 'bg-rose-50 text-rose-700 border border-rose-200';
                  else if (status.includes('duplicate')) statusColor = 'bg-orange-50 text-orange-700 border border-orange-200';
                  else if (status.includes('pa')) statusColor = 'bg-indigo-50 text-indigo-700 border border-indigo-200';

                  return (
                    <tr key={order.Code} className="hover:bg-slate-50 transition-colors duration-150 group text-sm">
                      <td className="px-3 py-3 text-slate-900 font-medium truncate" title={String(order.OrderNumber)}>
                        {order.OrderNumber}
                      </td>
                      <td className="px-3 py-3 text-slate-600 truncate" title={String(order.SalesDocument)}>
                        {order.SalesDocument}
                      </td>
                      <td className="px-3 py-3 text-slate-600 whitespace-nowrap truncate">
                        {order.OrderDate}
                      </td>
                      <td className="px-3 py-3 text-slate-600 truncate">
                        {order.BatchNumber}
                      </td>
                      <td className="px-3 py-3 text-slate-600 truncate">
                        {order.Year}
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative group cursor-help">
                           <span className="truncate block w-full text-slate-700 font-medium">
                             {order["Material Number"]}
                           </span>
                           <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg pointer-events-none">
                              {order["Material Number"]}
                           </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 truncate" title={order.ClubName}>
                        {order.ClubName}
                      </td>
                      <td className="px-3 py-3 text-slate-600 truncate">
                        {order.OrderType}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full truncate max-w-full justify-center ${statusColor}`}>
                          {order.Status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600 truncate">
                        {order.CDD}
                      </td>
                      <td className="px-3 py-3 text-slate-500 font-mono text-xs truncate" title={order.UPSTrackingNumber}>
                        {order.UPSTrackingNumber}
                      </td>
                      
                      {isAdmin && (
                        <td className="px-3 py-3 text-center">
                          <button 
                            onClick={() => onEdit(order.Code)}
                            className="text-brand-600 hover:text-brand-800 font-medium hover:underline focus:outline-none text-xs"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 3. Pagination Controls */}
        {activeData.length > 0 && (
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
               <div className="text-xs text-slate-500 font-medium">
                 {mode === 'SEARCH' 
                    ? `Found ${searchResults.length} results` 
                    : 'Showing recent orders'}
               </div>
               {renderPagination()}
            </div>
        )}
      </div>
    </div>
  );
};
