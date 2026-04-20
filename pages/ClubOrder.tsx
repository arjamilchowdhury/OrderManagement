import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import * as xlsx from 'xlsx';

interface DuplicateOrder {
  orderId: string;
  clubName: string;
  fileName: string;
}

interface ClubOrderMetrics {
  totalOrder: number;
  totalQty: number;
  totalRushOrders: number;
  totalMTOOrders: number;
  totalMultipleSportsOrders: number;
  totalDuplicateOrders: number;
}

interface FileData {
  orderIds: string[];
  totalOrder: number;
  totalQty: number;
  materials: string[];
  salesDocs: string[];
  assigned: string;
  clubStatus: string;
  batch: string;
}

export const ClubOrder: React.FC = () => {
  const { userProfile } = useAuth();
  const isViewer = userProfile?.role === 'viewer';
  const [batchNumber, setBatchNumber] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    clubOrderId?: string;
    batch?: string;
    duplicates: DuplicateOrder[];
    nonDuplicatesCount: number;
    metrics: ClubOrderMetrics;
    files: Record<string, FileData>;
  } | null>(null);
  
  const [users, setUsers] = useState<any[]>([]);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchLatestClubOrder();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users', error);
    }
  };

  const fetchLatestClubOrder = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/club-order/latest`);
      if (res.ok) {
        const data: any = await res.json();
        if (data) {
          setUploadResult({
            success: true,
            clubOrderId: data._id,
            batch: data.batch,
            duplicates: [],
            nonDuplicatesCount: data.totalOrder,
            metrics: {
              totalOrder: data.metrics?.totalOrder || data.totalOrder || 0,
              totalQty: data.metrics?.totalQty || data.totalQty || 0,
              totalRushOrders: data.metrics?.totalRushOrders || 0,
              totalMTOOrders: data.metrics?.totalMTOOrders || 0,
              totalMultipleSportsOrders: data.metrics?.totalMultipleSportsOrders || 0,
              totalDuplicateOrders: data.metrics?.totalDuplicateOrders || 0
            },
            files: data.files || {}
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch latest club order', error);
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files as Iterable<File> | ArrayLike<File>).filter((f: File) => 
        f.name.endsWith('.xls') || f.name.endsWith('.xlsx')
      );
      setFiles(prev => [...prev, ...droppedFiles]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files as Iterable<File> | ArrayLike<File>).filter((f: File) => 
        f.name.endsWith('.xls') || f.name.endsWith('.xlsx')
      );
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!batchNumber) {
      alert('Please enter a batch number.');
      return;
    }
    if (files.length === 0) {
      alert('Please select at least one Excel file.');
      return;
    }

    setIsUploading(true);

    try {
      // Parse files locally before sending to bypass multipart/form-data issues on Netlify
      const parsedFiles = [];
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        // { raw: false } ensures cells are parsed using their formatted text instead of raw numerical serials (which fixes date numbers like 46126)
        const rows = xlsx.utils.sheet_to_json(sheet, { raw: false, dateNF: 'm/d/yyyy' });
        
        parsedFiles.push({
          fileName: file.name,
          data: rows
        });
      }

      const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/club-order/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          batchNumber,
          files: parsedFiles
        })
      });
      
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        if (!res.ok) {
          throw new Error(`Server returned ${res.status} ${res.statusText}`);
        }
        throw new Error('Invalid JSON response from server');
      }

      if (res.ok) {
        setUploadResult({
           ...data,
           batch: data.batch || batchNumber 
        });
        setFiles([]);
        setBatchNumber('');
        if (data.duplicates && data.duplicates.length > 0) {
          setShowDuplicatesModal(true);
        }
      } else {
        alert(data.error || `Upload failed: ${res.statusText}`);
      }
    } catch (error: any) {
      console.error('Upload error', error);
      alert(`An error occurred during upload: ${error.message || 'Network or server error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAssignmentChange = async (fileName: string, assignedUserId: string) => {
    if (!uploadResult?.clubOrderId) return;
    
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/club-order/update-assignment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubOrderId: uploadResult.clubOrderId,
          fileName,
          assigned: assignedUserId
        })
      });
      
      if (res.ok) {
        setUploadResult(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            files: {
              ...prev.files,
              [fileName]: {
                ...prev.files[fileName],
                assigned: assignedUserId
              }
            }
          };
        });
      }
    } catch (error) {
      console.error('Failed to update assignment', error);
    }
  };

  const handleStatusChange = async (fileName: string, status: string) => {
    if (!uploadResult?.clubOrderId) return;
    
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/club-order/update-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubOrderId: uploadResult.clubOrderId,
          fileName,
          status
        })
      });
      
      if (res.ok) {
        setUploadResult(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            files: {
              ...prev.files,
              [fileName]: {
                ...prev.files[fileName],
                clubStatus: status
              }
            }
          };
        });
      }
    } catch (error) {
      console.error('Failed to update status', error);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full p-6 bg-slate-50 overflow-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">Smart Club Order Processor</h1>
            {uploadResult?.batch && (
              <span className="px-2.5 py-1 bg-brand-100 text-brand-700 text-xs font-bold uppercase tracking-wider rounded-md border border-brand-200">
                Active Batches: {uploadResult.batch}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Current Date: {new Date().toLocaleDateString()} | Upload Excel files to process orders and check for duplicates.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-xs font-bold text-slate-500 uppercase">Batch Number <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="Enter Batch #"
              disabled={isViewer}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:opacity-50"
            />
          </div>
          <button 
            onClick={handleUpload}
            disabled={isUploading || files.length === 0 || !batchNumber || isViewer}
            className="mt-4 px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-medium rounded-lg shadow-sm transition-colors"
          >
            {isUploading ? 'Processing...' : 'Upload & Process'}
          </button>
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div 
        onDragOver={isViewer ? undefined : onDragOver}
        onDragLeave={isViewer ? undefined : onDragLeave}
        onDrop={isViewer ? undefined : onDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${isViewer ? 'opacity-50 pointer-events-none' : ''} ${isDragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
      >
        <div className="flex flex-col items-center justify-center">
          <svg className="w-12 h-12 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-lg font-medium text-slate-700 mb-1">Drag & drop Excel files here</p>
          <p className="text-sm text-slate-500 mb-4">or click to browse (.xls, .xlsx)</p>
          <label className="cursor-pointer px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm">
            Browse Files
            <input type="file" disabled={isViewer} multiple accept=".xls,.xlsx" className="hidden" onChange={handleFileSelect} />
          </label>
        </div>
      </div>

      {/* Selected Files List */}
      {files.length > 0 && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Selected Files ({files.length})</h3>
          <div className="flex flex-wrap gap-2">
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-sm border border-slate-200">
                <span className="text-slate-700 truncate max-w-[200px]">{file.name}</span>
                <button onClick={() => removeFile(idx)} className="text-slate-400 hover:text-red-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dashboard Metrics */}
      {uploadResult && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-brand-500">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Orders</p>
              <p className="text-3xl font-bold text-slate-800">{uploadResult.metrics.totalOrder}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-amber-500">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Rush Orders</p>
              <p className="text-3xl font-bold text-slate-800">{uploadResult.metrics.totalRushOrders}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-purple-500">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total MTO Orders</p>
              <p className="text-3xl font-bold text-slate-800">{uploadResult.metrics.totalMTOOrders}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Multiple Sports</p>
              <p className="text-3xl font-bold text-slate-800">{uploadResult.metrics.totalMultipleSportsOrders}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-rose-500 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => uploadResult.duplicates.length > 0 && setShowDuplicatesModal(true)}>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Duplicates Found</p>
              <p className="text-3xl font-bold text-rose-600">{uploadResult.metrics.totalDuplicateOrders}</p>
              {uploadResult.duplicates.length > 0 && <p className="text-xs text-rose-500 mt-1">Click to view</p>}
            </div>
          </div>

          {/* Per-File Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800">Processed Files</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                    <th className="p-4 font-semibold">File Name</th>
                    <th className="p-4 font-semibold">Total Orders</th>
                    <th className="p-4 font-semibold">Total Qty</th>
                    <th className="p-4 font-semibold">Assigned To</th>
                    <th className="p-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(uploadResult.files).map(([fileName, data]: [string, any]) => (
                    <tr key={fileName} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-sm font-medium text-slate-800">{data.originalName || fileName.replace(/_DOT_/g, '.')}</td>
                      <td className="p-4 text-sm text-slate-600">{data.totalOrder}</td>
                      <td className="p-4 text-sm text-slate-600">{data.totalQty}</td>
                      <td className="p-4">
                        <select 
                          value={data.assigned || ''}
                          onChange={(e) => handleAssignmentChange(fileName, e.target.value)}
                          disabled={isViewer}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:opacity-50"
                        >
                          <option value="">-- Unassigned --</option>
                          {users.map(u => (
                            <option key={u.uid} value={u.name || u.email}>{u.name || u.email}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4">
                        <select
                          value={data.clubStatus?.startsWith('Order shared on') ? 'shared' : 'Not shared'}
                          onChange={(e) => {
                            const todayStr = new Date().toLocaleDateString('en-US');
                            const newStatus = e.target.value === 'shared' ? `Order shared on ${todayStr}` : 'Not shared';
                            handleStatusChange(fileName, newStatus);
                          }}
                          disabled={isViewer}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:opacity-50"
                        >
                          <option value="Not shared">Not shared</option>
                          <option value="shared">
                            {data.clubStatus?.startsWith('Order shared on') ? data.clubStatus : `Order shared on ${new Date().toLocaleDateString('en-US')}`}
                          </option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Duplicates Modal */}
      {showDuplicatesModal && uploadResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-rose-50">
              <h2 className="text-lg font-bold text-rose-800 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Duplicate Orders Found
              </h2>
              <button onClick={() => setShowDuplicatesModal(false)} className="text-rose-500 hover:text-rose-700">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 overflow-auto">
              <p className="text-sm text-slate-600 mb-4">
                The following orders were ignored because they already exist in the database.
              </p>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                    <th className="p-3 font-semibold">Order ID</th>
                    <th className="p-3 font-semibold">Club Name</th>
                    <th className="p-3 font-semibold">File Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {uploadResult.duplicates.map((dup, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 text-sm font-medium text-slate-800">{dup.orderId}</td>
                      <td className="p-3 text-sm text-slate-600">{dup.clubName}</td>
                      <td className="p-3 text-sm text-slate-500 truncate max-w-[200px]">{dup.fileName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setShowDuplicatesModal(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-medium rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
