import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { User, SalesData } from '../types';

interface Props { user: User }

interface ParsedSale {
  customer_name: string;
  date: string;
  amount: number;
  item: string;
  quantity: number;
  cogs: number;
  profit: number;
  profit_pct: string;
  category: string;
  product_line: string;
  salesperson: string;
}

interface CustomerSummary {
  customer_name: string;
  total_amount: number;
  total_profit: number;
  line_count: number;
  date_range: string;
  salesperson: string;
}

function parseAccountEdgeCSV(text: string): { records: ParsedSale[]; summaries: CustomerSummary[]; reportPeriod: string } {
  const lines = text.split('\n');
  const records: ParsedSale[] = [];
  const summaries: CustomerSummary[] = [];
  let currentCustomer = '';
  let customerLines: ParsedSale[] = [];
  let headerPassed = false;
  let reportPeriod = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect report period from header (e.g. "January 2026-March 2026")
    if (!headerPassed && line.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i)) {
      reportPeriod = line.trim();
    }

    // Skip header section - detect by column header row
    if (line.includes(',ID#,Date,Quantity,Item/Activity,Amount,')) {
      headerPassed = true;
      continue;
    }
    if (!headerPassed) continue;

    // Skip grand total
    if (line.includes('Grand Total:')) continue;

    // Check for customer total row
    if (line.includes(' Total:,')) {
      // Finalize this customer
      if (currentCustomer && customerLines.length > 0) {
        const totalAmount = customerLines.reduce((s, r) => s + r.amount, 0);
        const totalProfit = customerLines.reduce((s, r) => s + r.profit, 0);
        const dates = customerLines.map(r => r.date).filter(Boolean).sort();
        const salesperson = customerLines.find(r => r.salesperson)?.salesperson || '';
        summaries.push({
          customer_name: currentCustomer,
          total_amount: totalAmount,
          total_profit: totalProfit,
          line_count: customerLines.length,
          date_range: dates.length > 0 ? `${dates[0]} - ${dates[dates.length - 1]}` : '',
          salesperson,
        });
        customerLines = [];
      }
      continue;
    }

    // Check if this is a customer name row (doesn't start with comma, no amount columns)
    if (!line.startsWith(',') && !line.startsWith('"') && !line.match(/^\d/)) {
      // Could be a customer name - check if it looks like a data row
      const parts = line.split(',');
      if (parts.length <= 3 && !line.includes('$')) {
        currentCustomer = line.trim();
        customerLines = [];
        continue;
      }
    }

    // Parse line item rows (start with comma = indented under customer)
    if (line.startsWith(',') && currentCustomer) {
      // Remove leading comma, then parse carefully handling quoted values
      const rawLine = line.substring(1);
      const parts = parseCSVLine(rawLine);

      if (parts.length >= 6) {
        const id = parts[0]?.trim() || '';
        const date = parts[1]?.trim() || '';
        const quantity = parseInt(parts[2]?.trim() || '0');
        const item = parts[3]?.trim() || '';
        const amountStr = (parts[4] || '').replace(/[\$",()]/g, '').trim();
        const amount = parseFloat(amountStr) || 0;
        const cogsStr = (parts[5] || '').replace(/[\$",()]/g, '').trim();
        const cogs = parseFloat(cogsStr) || 0;
        const profitStr = (parts[6] || '').replace(/[\$",()]/g, '').trim();
        const profit = parseFloat(profitStr) || 0;
        const profitPct = parts[7]?.trim() || '';
        const category = parts[8]?.trim() || '';
        const productLine = parts[9]?.trim() || '';
        const salesperson = parts[10]?.trim() || '';

        // Skip if no valid date or amount
        if (date && date.match(/\d+\/\d+\/\d+/) && amount !== 0) {
          const record: ParsedSale = {
            customer_name: currentCustomer,
            date: formatDate(date),
            amount,
            item,
            quantity,
            cogs,
            profit,
            profit_pct: profitPct,
            category,
            product_line: productLine,
            salesperson,
          };
          records.push(record);
          customerLines.push(record);
        }
      }
    }
  }

  // Catch last customer if no total row at end
  if (currentCustomer && customerLines.length > 0) {
    const totalAmount = customerLines.reduce((s, r) => s + r.amount, 0);
    const totalProfit = customerLines.reduce((s, r) => s + r.profit, 0);
    const dates = customerLines.map(r => r.date).filter(Boolean).sort();
    const salesperson = customerLines.find(r => r.salesperson)?.salesperson || '';
    summaries.push({
      customer_name: currentCustomer,
      total_amount: totalAmount,
      total_profit: totalProfit,
      line_count: customerLines.length,
      date_range: dates.length > 0 ? `${dates[0]} - ${dates[dates.length - 1]}` : '',
      salesperson,
    });
  }

  // Build actual date range from parsed records if no report period found
  if (!reportPeriod && records.length > 0) {
    const allDates = records.map(r => r.date).filter(Boolean).sort();
    if (allDates.length > 0) {
      const first = new Date(allDates[0]);
      const last = new Date(allDates[allDates.length - 1]);
      reportPeriod = `${first.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${last.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    }
  }

  return { records, summaries, reportPeriod };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function formatDate(dateStr: string): string {
  // Convert M/D/YYYY to YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

export default function SalesPage({ user }: Props) {
  const [sales, setSales] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [parsePreview, setParsePreview] = useState<{ records: ParsedSale[]; summaries: CustomerSummary[]; reportPeriod: string } | null>(null);
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

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const parsed = parseAccountEdgeCSV(text);
      setParsePreview(parsed);
      setImportResult(null);
    };
    reader.readAsText(file);
  };

  const confirmImport = async (mode: 'summary' | 'detailed') => {
    if (!parsePreview) return;
    setImporting(true);

    try {
      let records;
      if (mode === 'summary') {
        // Import one record per customer with their total
        records = parsePreview.summaries.map(s => ({
          customer_name: s.customer_name,
          amount: s.total_amount,
          date: s.date_range.split(' - ')[1] || s.date_range.split(' - ')[0] || new Date().toISOString().split('T')[0],
          memo: `${s.line_count} line items, Profit: $${s.total_profit.toFixed(2)}${s.salesperson ? ', Rep: ' + s.salesperson : ''}`,
        }));
      } else {
        // Import every line item
        records = parsePreview.records.map(r => ({
          customer_name: r.customer_name,
          amount: r.amount,
          date: r.date,
          memo: `${r.item} (Qty: ${r.quantity})${r.category ? ' [' + r.category + ']' : ''}${r.salesperson ? ' - ' + r.salesperson : ''}`,
        }));
      }

      const data = await api.post('/sales/import', { records });
      setImportResult(data);
      setParsePreview(null);
      loadSales();
    } catch (err) {
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      {/* Date range banner */}
      {sales.length > 0 && (() => {
        const dates = sales.map(s => s.sale_date).filter(Boolean).sort();
        if (dates.length === 0) return null;
        const first = new Date(dates[0] + 'T00:00:00');
        const last = new Date(dates[dates.length - 1] + 'T00:00:00');
        return (
          <div className="bg-brand-50 border border-brand-200 rounded-xl px-5 py-3 mb-6 flex items-center justify-between">
            <div>
              <span className="text-sm text-brand-700 font-medium">Sales data for: </span>
              <span className="text-sm text-brand-900 font-bold">
                {first.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} &ndash; {last.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <span className="text-xs text-brand-600">{sales.length} records</span>
          </div>
        );
      })()}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Sales Tracking</h1>
          <p className="text-navy-500 text-sm mt-1">Import from AccountEdge or log sales manually</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowImport(!showImport); setParsePreview(null); setImportResult(null); }} className="btn-primary">
            Import from AccountEdge
          </button>
        </div>
      </div>

      {/* Import section */}
      {showImport && (
        <div className="card mb-6">
          <h3 className="font-bold text-navy-900 mb-3">Import AccountEdge Sales Report</h3>
          <p className="text-sm text-navy-500 mb-4">
            Upload your AccountEdge "Customer Sales Detail" or "Profit Analysis" CSV export.
            The system will parse the report, match customers to your accounts, and import the sales data.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            className="input-field"
          />

          {/* Parse Preview */}
          {parsePreview && (
            <div className="mt-4 space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                {parsePreview.reportPeriod && (
                  <p className="text-blue-900 font-bold mb-1">
                    Report Period: {parsePreview.reportPeriod}
                  </p>
                )}
                <p className="text-blue-800 font-medium">
                  Parsed {parsePreview.summaries.length} customers with {parsePreview.records.length} line items
                </p>
                <p className="text-sm text-blue-600 mt-1">
                  Total revenue: ${parsePreview.summaries.reduce((s, c) => s + c.total_amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {/* Customer summary table */}
              <div className="max-h-64 overflow-y-auto border border-navy-100 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-navy-50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3 text-xs font-medium text-navy-500">Customer</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-navy-500">Revenue</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-navy-500">Profit</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-navy-500">Items</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-navy-500">Rep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsePreview.summaries.map((s, i) => (
                      <tr key={i} className="border-t border-navy-50">
                        <td className="py-2 px-3 font-medium text-navy-900">{s.customer_name}</td>
                        <td className="py-2 px-3 text-right text-green-600">${s.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 px-3 text-right text-navy-600">${s.total_profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 px-3 text-right text-navy-500">{s.line_count}</td>
                        <td className="py-2 px-3 text-navy-500">{s.salesperson || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Import buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => confirmImport('summary')}
                  disabled={importing}
                  className="btn-primary flex-1"
                >
                  {importing ? 'Importing...' : `Import Summary (${parsePreview.summaries.length} customer totals)`}
                </button>
                <button
                  onClick={() => confirmImport('detailed')}
                  disabled={importing}
                  className="btn-secondary flex-1"
                >
                  {importing ? 'Importing...' : `Import Detailed (${parsePreview.records.length} line items)`}
                </button>
              </div>
              <p className="text-xs text-navy-400">
                Summary imports one total per customer. Detailed imports every individual line item.
              </p>
            </div>
          )}

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
                  <div className="max-h-40 overflow-y-auto mt-1">
                    {importResult.unmatched.map((u: any, i: number) => (
                      <div key={i} className="text-sm text-yellow-600 mt-1">
                        {u.customer_name} — ${u.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    ))}
                  </div>
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
                    ${sale.sale_amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
