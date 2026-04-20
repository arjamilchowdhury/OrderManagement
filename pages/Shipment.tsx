
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../src/services/api';

declare const XLSX: any;

export const Shipment: React.FC = () => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const isViewer = userProfile?.role === 'viewer';

  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{ fileName: string; bdNumber: string; updatedCount: number; notFoundCount: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const normalizeHeader = (header: string): string => {
    return header.toString().trim().toLowerCase().replace(/[\s/]/g, '');
  };

  const extractBDNumber = (filename: string): string => {
    // Looks for patterns like BD followed by digits
    const match = filename.match(/BD\d+/i);
    return match ? match[0].toUpperCase() : 'UNKNOWN_BD';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (typeof XLSX === 'undefined') {
      setError("XLSX library not loaded. Refresh the page.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    const uploadedFiles = Array.from(e.target.files) as File[];
    const processingResults = [];

    try {
      for (const file of uploadedFiles) {
        const bdNumber = extractBDNumber(file.name);
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Look for the "run" tab
        const runSheetName = workbook.SheetNames.find((name: string) => name.toLowerCase() === 'run');
        if (!runSheetName) {
          processingResults.push({ fileName: file.name, bdNumber, updatedCount: 0, notFoundCount: 0, error: 'No "run" tab found' });
          continue;
        }

        const worksheet = workbook.Sheets[runSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet);

        const updates: Record<string, any> = {};
        let updatedCount = 0;
        let notFoundCount = 0;

        // Fetch current master_recon_file to check existence
        const masterData = await api.getMasterReconKeys();

        rawJson.forEach((row: any) => {
          let po = '';
          let sku = '';

          Object.keys(row).forEach(key => {
            const normKey = normalizeHeader(key);
            if (normKey === 'po') po = String(row[key]).trim();
            else if (normKey === 'skuitem') sku = String(row[key]).trim();
          });

          if (po && sku) {
            const compositeKey = `${po}${sku}`;
            if (masterData[compositeKey]) {
              updates[`order_management/master_recon_file/${compositeKey}/Status`] = `Order shared under ${bdNumber}`;
              updatedCount++;
            } else {
              notFoundCount++;
            }
          }
        });

        if (Object.keys(updates).length > 0) {
          await api.updateMasterReconStatus(updates);
        }

        processingResults.push({
          fileName: file.name,
          bdNumber,
          updatedCount,
          notFoundCount
        });
      }
      setResults(prev => [...prev, ...processingResults]);
    } catch (err: any) {
      console.error(err);
      setError("Error processing Shipment files. Ensure the 'run' tab exists and columns 'PO' and 'SKU/ ITEM #' are present.");
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-8 pb-20 max-w-4xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Shipment Processing</h1>
        <p className="text-slate-500 text-sm">Upload ACP Reports to update order status in the Master File.</p>
      </div>

      <div className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${isAdmin ? 'border-brand-300 bg-brand-50/50 hover:bg-brand-50 cursor-pointer shadow-inner' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
        <input 
          type="file" 
          multiple 
          accept=".xlsx,.xls" 
          onChange={handleFileUpload} 
          disabled={!isAdmin || isProcessing} 
          className="hidden" 
          id="shipment-upload" 
        />
        <label htmlFor="shipment-upload" className="flex flex-col items-center justify-center cursor-pointer">
          {isProcessing ? (
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mb-4"></div>
              <span className="text-brand-600 font-bold uppercase tracking-widest text-xs">Scanning & Syncing...</span>
            </div>
          ) : (
            <>
              <div className="p-5 rounded-full bg-white text-brand-600 shadow-soft mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-1">{isAdmin ? 'Upload Final ACP Reports' : 'Admin Only Access'}</h3>
              <p className="text-sm text-slate-500 font-medium">Select Excel files containing the 'run' tab</p>
            </>
          )}
        </label>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center shadow-sm">
          <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden animate-fade-in-up">
          <div className="px-8 py-6 border-b flex justify-between items-center bg-white">
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">Sync Report</h3>
              <p className="text-sm text-slate-500 font-medium">Results of latest shipment uploads</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">File Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">BD #</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Updated</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Not in Master</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-50">
                {results.map((res, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-5">
                      <div className="text-sm font-bold text-slate-900 truncate max-w-xs">{res.fileName}</div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="px-3 py-1 bg-brand-50 rounded-lg text-xs font-black text-brand-700 border border-brand-100">{res.bdNumber}</span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="text-sm font-bold text-emerald-600">{res.updatedCount}</span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="text-sm font-bold text-slate-400">{res.notFoundCount}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-soft">
        <h4 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-widest">How it works</h4>
        <ul className="space-y-3 text-sm text-slate-600">
          <li className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-[10px] font-bold mt-0.5">1</div>
            <span>File must have a tab named <b>"run"</b>.</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-[10px] font-bold mt-0.5">2</div>
            <span>Columns <b>"PO"</b> and <b>"SKU/ ITEM #"</b> are used to identify the matching record.</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-[10px] font-bold mt-0.5">3</div>
            <span>BD Number is extracted automatically from the filename (e.g., <i>Final ACP Report BD2822</i>).</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-[10px] font-bold mt-0.5">4</div>
            <span>Matching records in Master Reconciliation will have their status updated to <i>"Order shared under [BD Number]"</i>.</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
