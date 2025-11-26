import React, { useEffect, useState, useRef } from 'react';
import { db } from '../services/firebase';
import { ref, query, orderByChild, limitToLast, get, update, endAt } from 'firebase/database';
import { OrderRecord, STATUS_OPTIONS } from '../types';
import { useAuth } from '../context/AuthContext';

// Safe access to XLSX from CDN
const XLSX = (window as any).XLSX;

const PAGE_SIZE = 100;

export const Reconciliation: React.FC = () => {
  const { userProfile } = useAuth();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [noMoreData, setNoMoreData] = useState(false);

  // Pagination cursor
  const [oldestLoadedKey, setOldestLoadedKey] = useState<string | null>(null);
  const [oldestLoadedDate, setOldestLoadedDate] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Data Fetching ---

  const fetchLatestOrders = async () => {
    setLoading(true);
    try {
      const ordersRef = ref(db, 'order_management/master_recon_file');
      const q = query(ordersRef, orderByChild('OrderDate'), limitToLast(PAGE_SIZE));
      
      const snapshot = await get(q);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loadedOrders: OrderRecord[] = Object.keys(data).map(key => ({
          ...data[key],
          Code: key
        }));

        loadedOrders.sort((a, b) => {
           return new Date(b.OrderDate).getTime() - new Date(a.OrderDate).getTime();
        });

        setOrders(loadedOrders);
        
        if (loadedOrders.length > 0) {
          const oldest = loadedOrders[loadedOrders.length - 1];
          setOldestLoadedKey(oldest.Code);
          setOldestLoadedDate(oldest.OrderDate);
        }
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!oldestLoadedDate || !oldestLoadedKey) return;
    setLoading(true);

    try {
      const ordersRef = ref(db, 'order_management/master_recon_file');
      const q = query(
        ordersRef, 
        orderByChild('OrderDate'), 
        endAt(oldestLoadedDate, oldestLoadedKey), 
        limitToLast(PAGE_SIZE + 1)
      );

      const snapshot = await get(q);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const newOrders: OrderRecord[] = Object.keys(data).map(key => ({
          ...data[key],
          Code: key
        }));

        const filteredNewOrders = newOrders.filter(o => o.Code !== oldestLoadedKey);

        if (filteredNewOrders.length === 0) {
          setNoMoreData(true);
        } else {
            filteredNewOrders.sort((a, b) => new Date(b.OrderDate).getTime() - new Date(a.OrderDate).getTime());
            setOrders(prev => [...prev, ...filteredNewOrders]);
            const oldest = filteredNewOrders[filteredNewOrders.length - 1];
            setOldestLoadedKey(oldest.Code);
            setOldestLoadedDate(oldest.OrderDate);
        }
      } else {
        setNoMoreData(true);
      }
    } catch (error) {
      console.error("Error loading more:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestOrders();
  }, []);

  // --- Filtering ---

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value.toLowerCase());
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status) 
        : [...prev, status]
    );
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      (order.OrderNumber || '').toLowerCase().includes(searchTerm) ||
      (order.SalesDocument || '').toLowerCase().includes(searchTerm) ||
      (order.BatchNumber || '').toLowerCase().includes(searchTerm) ||
      (order.Material || '').toLowerCase().includes(searchTerm) ||
      (order.ClubName || '').toLowerCase().includes(searchTerm);

    let matchesStatus = true;
    if (statusFilters.length > 0) {
      matchesStatus = statusFilters.some(filter => {
        const s = (order.Status || '').toLowerCase();
        if (filter === 'Shipped') return s.includes('shipped');
        if (filter === 'Canceled') return s.includes('canceled');
        if (filter === 'Not shipped') return !s.includes('shipped');
        if (filter === 'Duplicate') return s.includes('duplicate');
        if (filter === 'PA') return s.includes('pa');
        return s.includes(filter.toLowerCase());
      });
    }

    return matchesSearch && matchesStatus;
  });

  // --- Excel Upload ---

  const processFile = (file: File) => {
    if (!XLSX) {
      alert("Excel parser not loaded. Please refresh the page.");
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(sheet);

        const updates: Record<string, any> = {};
        let count = 0;

        jsonData.forEach(row => {
          if (row.Code) {
            const record: OrderRecord = {
              OrderNumber: row.OrderNumber || '',
              SalesDocument: row.SalesDocument || '',
              OrderDate: row.OrderDate || '',
              BatchNumber: row.BatchNumber || '',
              Year: row.Year || '',
              Material: row.Material || '',
              ClubName: row.ClubName || '',
              OrderType: row.OrderType || 'RECONCILIATION',
              Status: row.Status || '',
              CDD: row.CDD || '',
              UPSTrackingNumber: row.UPSTrackingNumber || '',
              Code: row.Code
            };
            updates[`/order_management/master_recon_file/${row.Code}`] = record;
            count++;
          }
        });

        if (count > 0) {
            await update(ref(db), updates);
            alert(`Successfully processed ${count} records.`);
            fetchLatestOrders();
        } else {
            alert("No valid records found (checking 'Code' column).");
        }

      } catch (err) {
        console.error("Upload error", err);
        alert("Error processing file.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (userProfile?.role !== 'admin') return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* Header & Controls Card */}
      <div className="bg-white rounded-xl shadow-soft border border-slate-100 p-5 flex flex-col md:flex-row gap-4 justify-between items-center z-20">
        
        {/* Search */}
        <div className="relative w-full md:w-96 group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-colors group-focus-within:text-brand-500">
            <svg className="h-5 w-5 text-slate-400 group-focus-within:text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm leading-5 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all shadow-inner"
            placeholder="Search orders, materials, clubs..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        {/* Filter */}
        <div className="relative w-full md:w-auto">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`w-full md:w-auto inline-flex justify-center items-center px-5 py-2.5 border rounded-lg text-sm font-medium transition-all ${isFilterOpen || statusFilters.length > 0 ? 'bg-brand-50 text-brand-700 border-brand-200 shadow-sm' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300'}`}
          >
            <svg className={`mr-2 h-4 w-4 ${statusFilters.length > 0 ? 'text-brand-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filter Status 
            {statusFilters.length > 0 && (
              <span className="ml-2 bg-brand-200 text-brand-800 text-xs py-0.5 px-2 rounded-full font-bold">
                {statusFilters.length}
              </span>
            )}
          </button>
          
          {isFilterOpen && (
            <>
              <div className="fixed inset-0 z-10 cursor-default" onClick={() => setIsFilterOpen(false)}></div>
              <div className="absolute right-0 mt-2 w-64 rounded-xl shadow-card bg-white ring-1 ring-black ring-opacity-5 z-20 overflow-hidden animate-fade-in-up">
                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filter by Status</span>
                    <button onClick={() => { setStatusFilters([]); setIsFilterOpen(false); }} className="text-xs text-brand-600 hover:underline">Clear all</button>
                </div>
                <div className="py-2" role="menu">
                  {STATUS_OPTIONS.map(option => (
                    <label key={option} className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={statusFilters.includes(option)}
                        onChange={() => toggleStatusFilter(option)}
                        className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-slate-300 rounded transition duration-150 ease-in-out"
                      />
                      <span className="ml-3 text-sm text-slate-700 font-medium">{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl shadow-card border border-slate-100 overflow-hidden flex flex-col h-[calc(100vh-280px)]">
        <div className="flex-1 overflow-auto relative scrollbar-thin">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                {['Order #', 'Sales Doc', 'Order Date', 'Batch', 'Year', 'Material', 'Club', 'Type', 'Status', 'CDD', 'UPS Tracking'].map(head => (
                  <th key={head} className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-50">
              {loading && orders.length === 0 ? (
                 <tr><td colSpan={11} className="text-center py-20 text-slate-400">Loading order data...</td></tr>
              ) : filteredOrders.length === 0 ? (
                 <tr><td colSpan={11} className="text-center py-20 text-slate-400">No orders found matching your criteria.</td></tr>
              ) : (
                filteredOrders.map((order) => {
                  const status = order.Status?.toLowerCase() || '';
                  let statusColor = 'bg-slate-100 text-slate-600';
                  if (status.includes('shipped')) statusColor = 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-600/20';
                  else if (status.includes('canceled')) statusColor = 'bg-rose-100 text-rose-700 ring-1 ring-rose-600/20';
                  else if (status.includes('duplicate')) statusColor = 'bg-orange-100 text-orange-700 ring-1 ring-orange-600/20';
                  else if (status.includes('pa')) statusColor = 'bg-violet-100 text-violet-700 ring-1 ring-violet-600/20';

                  return (
                    <tr key={order.Code} className="hover:bg-slate-50 transition-colors duration-150 group">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800 group-hover:text-brand-600">{order.OrderNumber}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{order.SalesDocument}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{order.OrderDate}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{order.BatchNumber}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{order.Year}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600" title={order.Material}>
                        <div className="max-w-[150px] truncate">{order.Material}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{order.ClubName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{order.OrderType}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-bold rounded-full ${statusColor}`}>
                          {order.Status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{order.CDD}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono text-xs">{order.UPSTrackingNumber}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          
          {!noMoreData && !loading && filteredOrders.length > 0 && (
            <div className="p-4 flex justify-center bg-white border-t border-slate-100">
              <button 
                onClick={loadMore}
                className="text-sm font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-6 py-2 rounded-full transition-colors"
              >
                Load older records
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Upload Footer (Admin Only) */}
      {userProfile?.role === 'admin' && (
        <div 
          className={`relative group rounded-xl border-2 border-dashed p-8 transition-all duration-300 ease-in-out ${uploading ? 'bg-slate-50 border-slate-300' : 'bg-white border-slate-300 hover:border-brand-400 hover:bg-brand-50/30'}`}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-brand-500'); }}
          onDragLeave={(e) => { e.currentTarget.classList.remove('border-brand-500'); }}
          onDrop={(e) => { e.currentTarget.classList.remove('border-brand-500'); handleFileDrop(e); }}
        >
          <div className="flex flex-col items-center justify-center text-center">
            <div className={`p-4 rounded-full mb-3 transition-colors ${uploading ? 'bg-slate-200' : 'bg-brand-50 text-brand-500 group-hover:bg-brand-100 group-hover:scale-110'}`}>
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              {uploading ? 'Processing Data...' : 'Upload Reconciliation File'}
            </h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Drag and drop your Excel file here, or click to browse. Supports .xlsx and .xls formats.
            </p>
            <input 
              type="file" 
              accept=".xlsx, .xls"
              className="hidden" 
              ref={fileInputRef}
              onChange={(e) => e.target.files && processFile(e.target.files[0])}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-4 px-6 py-2 bg-white border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-all"
            >
              Select File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};