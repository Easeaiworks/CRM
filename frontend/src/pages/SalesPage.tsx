import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { User, SalesData } from '../types';
import Papa from 'papaparse';

interface Props { user: User }

export default function SalesPage({ user }: Props) {
  const [sales, setSales] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSales(); }, []);

  const loadSales = async () => {
    try {
      const data = await api.get('/sales', { limit: '100' });
      setSales(data.sales);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const data = await api.post('/sales/import', { records: results.data });
          setImportResult(data);
          loadSales();
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Sales Tracking</h1>
          <p className="text-navy-500 text-sm mt-1">Import from AccountEdge or log sales manually</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(!showImport)} className="btn-primary">
            Import from AccountEdge
          </button>
        </div>
      </div>

      {/* Import section */}
      {showImport && (
        <div className="card mb-6">
          <h3 className="font-bold text-navy-900 mb-3">Import AccountEdge CSV</h3>
          <p className="text-sm text-navy-500 mb-4">
            Export a CSV from AccountEdge with columns like: Customer Name, Amount, Date, Memo.
            The system will automatically match customers to existing accounts.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="input-field"
          />
          {importResult && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-medium">
                Import complete: {importResult.imported} records imported
              </p>
              {importResult.unmatched?.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-yellow-700 font-medium">
                    {importResult.unmatched.length} records could not be matched to existing accounts:
                  </p>
                  {importResult.unmatched.map((u: any, i: number) => (
                    <div key={i} className="text-sm text-yellow-600 mt-1">
                      {u.customer_name} — ${u.amount} on {u.date}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sales list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sales.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-navy-500">No sales data yet.</p>
          <p className="text-sm text-navy-400 mt-2">Import a CSV from AccountEdge to get started.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-navy-100">
                <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Date</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Customer</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-navy-500 uppercase">Amount</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Memo</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Source</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-b border-navy-50 hover:bg-navy-50">
                  <td className="py-3 px-4 text-sm text-navy-600">{sale.sale_date}</td>
                  <td className="py-3 px-4 text-sm font-medium text-navy-900">
                    {sale.shop_name || sale.customer_name || 'Unmatched'}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-green-600">
                    ${sale.sale_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-sm text-navy-500">{sale.memo || '-'}</td>
                  <td className="py-3 px-4">
                    <span className={`badge ${sale.imported_from_accountedge ? 'bg-purple-100 text-purple-800' : 'bg-navy-100 text-navy-700'}`}>
                      {sale.imported_from_accountedge ? 'AccountEdge' : 'Manual'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
