import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { ref, query, orderByChild, limitToLast, get, endAt, equalTo } from 'firebase/database';
import type { OrderRecord } from '../types';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 50;

// Search Field Mapping
const SEARCH_FIELDS = [
  { label: 'Order Number', key: 'OrderNumber', type: 'exact' },
  { label: 'Material', key: 'Material Number', type: 'exact' },
  { label: 'Sales Document', key: 'SalesDocument', type: 'exact' }
];

interface Cursor {
  value: string | number;
  key: string;
}

interface ReconciliationProps {
  onEdit: (id: string) => void;
}

export const Reconciliation: React.FC<ReconciliationProps> = ({ onEdit }) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  // --- State Management ---
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search State
  const [searchMode, setSearchMode] = useState(false);
  const [searchField, setSearchField] = useState(SEARCH_FIELDS[0].key);
  const [searchText, setSearchText] = useState('');
  const [activeSearch, setActiveSearch] = useState<{field: string, text: string} | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [cursorStack, setCursorStack] = useState<Map<number, Cursor | null>>(new Map());
  const [hasNextPage, setHasNextPage] = useState(true);

  // --- Data Fetching Logic ---

  const fetchOrders = async (page: number, currentCursor: Cursor | null, searchParams: {field: string, text: string} | null) => {
    setLoading(true);
    setError(null);
    
    try {
      const dbRef = ref(db, 'order_management/master_recon_file');
      let q;

      if (searchParams) {
        // --- SEARCH MODE ---
        let baseQuery = query(dbRef, orderByChild(searchParams.field));
        
        if (currentCursor) {
            q = query(baseQuery, equalTo(searchParams.text), limitToLast(PAGE_SIZE + 1), endAt(currentCursor.value, currentCursor.key));
        } else {
            q = query(baseQuery, equalTo(searchParams.text), limitToLast(PAGE_SIZE));
        }

      } else {
        // --- BROWSE MODE (Default) ---
        if (currentCursor) {
           q = query(dbRef, orderByChild('OrderDate'), limitToLast(PAGE_SIZE + 1), endAt(currentCursor.value, currentCursor.key));
        } else {
           q = query(dbRef, orderByChild('OrderDate'), limitToLast(PAGE_SIZE));
        }
      }

      const snapshot = await get(q);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        let loadedOrders: OrderRecord[] = Object.keys(data).map(key => ({
          ...data[key],
          Code: key
        }));

        // --- Post-Processing ---
        
        // Sort descending by date locally for display consistency
        loadedOrders.sort((a, b) => {
           const dateA = new Date(a.OrderDate || 0).getTime();
           const dateB = new Date(b.OrderDate || 0).getTime();
           return dateB - dateA;
        });

        // Handle Pagination Overlap
        if (currentCursor) {
           loadedOrders = loadedOrders.filter(o => o.Code !== currentCursor.key);
        }

        // Check for "Next Page" availability
        if (loadedOrders.length < PAGE_SIZE && currentCursor) {
            setHasNextPage(false);
        } else if (loadedOrders.length === 0) {
            setHasNextPage(false);
        } else {
            setHasNextPage(true);
        }

        setOrders(loadedOrders);

        // Prepare Cursor for Next Page
        if (loadedOrders.length > 0) {
           const lastItem = loadedOrders[loadedOrders.length - 1];
           const nextCursorValue = searchParams ? lastItem[searchParams.field] : lastItem.OrderDate;
           
           setCursorStack(prev => {
             const newMap = new Map(prev);
             newMap.set(page + 1, { value: nextCursorValue, key: lastItem.Code });
             return newMap;
           });
        }

      } else {
        setOrders([]);
        setHasNextPage(false);
      }

    } catch (err: any) {
      console.error("Data Load Error:", err);
      if (err.message && err.message.includes('index')) {
        setError(`Missing Index: Please add ".indexOn": ["OrderDate", "${searchField}"] to Firebase Rules.`);
      } else {
        setError(err.message || 'Unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers ---

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchText.trim()) return;

    setCurrentPage(1);
    setCursorStack(new Map());
    setActiveSearch({ field: searchField, text: searchText.trim() });
    setSearchMode(true);
  };

  const clearSearch = () => {
    setSearchText('');
    setSearchMode(false);
    setActiveSearch(null);
    setCurrentPage(1);
    setCursorStack(new Map());
  };

  const goToPage = (pageNumber: number) => {
    if (pageNumber === 1) {
        setCurrentPage(1);
        return;
    }
    const cursor = cursorStack.get(pageNumber);
    if (cursor) {
        setCurrentPage(pageNumber);
    }
  };

  // --- Effects ---

  useEffect(() => {
    const cursor = currentPage === 1 ? null : cursorStack.get(currentPage) || null;
    fetchOrders(currentPage, cursor, activeSearch);
  }, [currentPage, activeSearch]);


  // --- Render Helpers ---

  const renderPaginationNumbers = () => {
    const pages = [];
    const clickableLimit = hasNextPage ? currentPage + 1 : currentPage;
    
    let start = Math.max(1, currentPage - 2);
    let end = Math.max(start + 4, currentPage + 1);

    for (let i = start; i <= end; i++) {
        if (i <= clickableLimit || cursorStack.has(i)) {
             pages.push(
                <button
                    key={i}
                    onClick={() => goToPage(i)}
                    className={`w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors ${
                        currentPage === i 
                        ? 'bg-brand-600 text-white shadow-md' 
                        : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                    }`}
                >
                    {i}
                </button>
             );
        }
    }
    return pages;
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      
      {/* 1. Control Panel */}
      <div className="bg-white rounded-xl shadow-soft border border-slate-100 p-4 z-20">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
            
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto flex-1">
                {/* Search Type Selector */}
                <div className="w-full md:w-48">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Search By</label>
                    <select
                        value={searchField}
                        onChange={(e) => setSearchField(e.target.value)}
                        disabled={loading}
                        className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    >
                        {SEARCH_FIELDS.map(f => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                    </select>
                </div>

                {/* Search Input */}
                <div className="w-full md:flex-1 relative">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Search Term</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder={`Enter exact ${SEARCH_FIELDS.find(f => f.key === searchField)?.label}...`}
                            className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none shadow-inner"
                        />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                             <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                             </svg>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mb-0.5">
                    <button 
                        type="submit"
                        disabled={loading || !searchText}
                        className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium shadow-md transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Search
                    </button>
                    
                    {searchMode && (
                        <button 
                            type="button"
                            onClick={clearSearch}
                            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
            
            {!searchMode && (
                <div className="hidden md:block text-xs text-slate-400 font-medium">
                    Showing latest orders
                </div>
            )}
        </form>
      </div>

      {/* 2. Data Table */}
      <div className="bg-white rounded-xl shadow-card border border-slate-100 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-auto relative scrollbar-thin">
          <table className="min-w-full table-fixed divide-y divide-slate-100">
            {/* Optimized Column Widths */}
            <colgroup>
              <col className="w-28" /> {/* Order # */}
              <col className="w-28" /> {/* Sales Doc */}
              <col className="w-28" /> {/* Date */}
              <col className="w-24" /> {/* Batch */}
              <col className="w-16" /> {/* Year */}
              <col className="w-96" /> {/* Material - Wide */}
              <col className="w-40" /> {/* Club */}
              <col className="w-24" /> {/* Type */}
              <col className="w-32" /> {/* Status */}
              <col className="w-24" /> {/* CDD */}
              <col className="w-40" /> {/* UPS */}
              {isAdmin && <col className="w-20" />} {/* Action */}
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
                    <td colSpan={isAdmin ? 12 : 11} className="px-6 py-12 text-center">
                      <div className="inline-flex flex-col items-center p-4 rounded-lg bg-red-50 text-red-700 border border-red-100 max-w-md mx-auto">
                         <div className="flex items-center font-bold mb-2">
                           <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                           Database Error
                         </div>
                         <span className="text-sm">{error}</span>
                      </div>
                    </td>
                 </tr>
              ) : loading ? (
                 <tr><td colSpan={isAdmin ? 12 : 11} className="text-center py-20 text-slate-400">
                    <div className="flex justify-center items-center gap-2">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                 </td></tr>
              ) : orders.length === 0 ? (
                 <tr>
                   <td colSpan={isAdmin ? 12 : 11} className="text-center py-20 text-slate-400">
                     {searchMode 
                        ? `No exact matches found for "${activeSearch?.text}".` 
                        : "No orders found."}
                   </td>
                 </tr>
              ) : (
                orders.map((order) => {
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
                      
                      {/* Material Column: Priority Visibility */}
                      <td className="px-3 py-3">
                        <div className="relative group cursor-help">
                           <span className="truncate block w-full text-slate-700 font-medium">
                             {order["Material Number"]}
                           </span>
                           {/* Custom Tooltip */}
                           <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg pointer-events-none">
                              {order["Material Number"]}
                              <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-800"></div>
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
        {!error && orders.length > 0 && (
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
               
               <div className="text-xs text-slate-500 font-medium">
                 {searchMode ? 'Search Results' : 'Sorting by Newest Date'} • Page {currentPage}
               </div>

               <div className="flex items-center gap-2">
                 <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                 >
                    Previous
                 </button>

                 <div className="flex items-center gap-1 px-2">
                    {renderPaginationNumbers()}
                 </div>

                 <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={!hasNextPage || loading}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                 >
                    Next
                 </button>
               </div>
            </div>
        )}
      </div>
    </div>
  );
};