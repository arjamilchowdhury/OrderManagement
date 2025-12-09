import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { ref, get, update } from 'firebase/database';
import type { OrderRecord } from '../types';
import { useAuth } from '../context/AuthContext';

interface EditOrderProps {
  orderId: string;
  onBack: () => void;
}

export const EditOrder: React.FC<EditOrderProps> = ({ orderId, onBack }) => {
  const { userProfile } = useAuth();
  const [formData, setFormData] = useState<Partial<OrderRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Protect route
  if (userProfile?.role !== 'admin') {
     return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8 bg-white rounded-2xl shadow-soft border border-slate-100 max-w-2xl mx-auto mt-10">
          <div className="bg-red-50 p-6 rounded-full mb-6">
            <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-slate-500 max-w-sm mb-6">You do not have administrative permissions to edit orders.</p>
          <button 
            onClick={onBack}
            className="px-6 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
     );
  }

  useEffect(() => {
    const fetchOrder = async () => {
      setLoading(true);
      setError('');
      try {
        const snapshot = await get(ref(db, `order_management/master_recon_file/${orderId}`));
        if (snapshot.exists()) {
          setFormData(snapshot.val());
        } else {
          setError('Order not found.');
        }
      } catch (err) {
        console.error("Error fetching order:", err);
        setError('Failed to fetch order details.');
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await update(ref(db, `order_management/master_recon_file/${orderId}`), formData);
      onBack();
    } catch (err) {
      console.error("Error updating order:", err);
      alert('Failed to update order.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8 text-red-600">
        <h3 className="text-lg font-bold">Error</h3>
        <p>{error}</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-slate-200 rounded-md">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-card border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Edit Order</h2>
            <p className="text-sm text-slate-500 mt-1">Order ID: {orderId}</p>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Order #</label>
              <input
                type="text"
                name="OrderNumber"
                value={formData.OrderNumber || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sales Document</label>
              <input
                type="text"
                name="SalesDocument"
                value={formData.SalesDocument || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Order Date</label>
              <input
                type="text"
                name="OrderDate"
                value={formData.OrderDate || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                placeholder="YYYY-MM-DD"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Batch</label>
              <input
                type="text"
                name="BatchNumber"
                value={formData.BatchNumber || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
              <input
                type="text"
                name="Year"
                value={formData.Year || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Material</label>
              <input
                type="text"
                name="Material Number"
                value={formData["Material Number"] || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Club</label>
              <input
                type="text"
                name="ClubName"
                value={formData.ClubName || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <input
                type="text"
                name="OrderType"
                value={formData.OrderType || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <input
                type="text"
                name="Status"
                value={formData.Status || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">CDD</label>
              <input
                type="text"
                name="CDD"
                value={formData.CDD || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">UPS Tracking</label>
              <input
                type="text"
                name="UPSTrackingNumber"
                value={formData.UPSTrackingNumber || ''}
                onChange={handleChange}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
            <button
              onClick={onBack}
              disabled={saving}
              className="px-6 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={saving}
              className="px-6 py-2 bg-brand-600 rounded-lg text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-all flex items-center"
            >
              {saving && (
                 <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
              )}
              {saving ? 'Updating...' : 'Update'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};