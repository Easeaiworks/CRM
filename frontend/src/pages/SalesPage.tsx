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
  lineItems: ParsedSale[];
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
          lineItems: [...customerLines],
        });
        customerLines = [];
      }
      continue;
    }

    // Check if this is a customer name row
    if (!line.startsWith(',') && !line.startsWith('"') && !line.match(/^\d/)) {
      const parts = line.split(',');
      if (parts.length <= 3 && !line.includes('$')) {
        currentCustomer = line.trim();
        customerLines = [];
        continue;
      }
    }

    // Parse line item rows (start with comma = indented under customer)
    if (line.startsWith(',') && currentCustomer) {
      const rawLine = line.substring(1);
      const parts = parseCSVLine(rawLine);

      if (parts.length >= 6) {
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

  // Catch last customer
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
      lineItems: [...customerLines],
    });
  }

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
  const [expandedPreview, setExpandedPreview] = useState<Set<number>>(new Set());
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  // Keep last imported line items for drill-down on main table
  const [lastImportedLines, setLastImportedLines] = useState<ParsedSale[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSales(); }, []);

  const loadSales = async () => {
    try {
      const data = await api.get('/sales', { limit: '500' });
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
      setExpandedPreview(new Set());
    };
    reader.readAsText(file);
  };

  const togglePreviewRow = (index: number) => {
    setExpandedPreview(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const confirmImport = async (mode: 'summary' | 'detailed') => {
    if (!parsePreview) return;
    setImporting(true);

    try {
      let records;
      if (mode === 'summary') {
        records = parsePreview.summaries.map(s => ({
          customer_name: s.customer_name,
          amount: s.total_amount,
          date: s.date_range.split(' - ')[1] || s.date_range.split(' - ')[0] || new Date().toISOString().split('T')[0],
          memo: `${s.line_count} line items, Profit: $${s.total_profit.toFixed(2)}${s.salesperson ? ', Rep: ' + s.salesperson : ''}`,
        }));
      } else {
        records = parsePreview.records.map(r => ({
          customer_name: r.customer_name,
          amount: r.amount,
          date: r.date,
          memo: `${r.item} (Qty: ${r.quantity})${r.category ? ' [' + r.category + ']' : ''}${r.salesperson ? ' - ' + r.salesperson : ''}`,
        }));
      }

      // Store line items for drill-down on main table
      setLastImportedLines(parsePreview.records);

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

  // Group sales by customer for the main table
  const groupedSales = sales.reduce<Record<string, SalesData[]>>((acc, sale) => {
    const key = sale.customer_name || sale.shop_name || 'Unmatched';
    if (!acc[key]) acc[key] = [];
    acc[key].push(sale);
    return acc;
  }, {});

  const customerTotals = Object.entries(groupedSales).map(([name, items]) => ({
    name,
    total: items.reduce((s, i) => s + (i.sale_amount || 0), 0),
    count: items.length,
    shop_name: items[0]?.shop_name || null,
    dates: items.map(i => i.sale_date).filter(Boolean).sort(),
    items,
  })).sort((a, b) => b.total - a.total);

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
            <span className="text-xs text-brand-600">{sales.length} records &middot; {customerTotals.length} customers</span>
          </div>
        );
      })()}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Sales Tracking</h1>
          <p className="text-navy-500 text-sm mt-1">Import from AccountEdge or log sales manually. Click any customer to see transactions.</p>
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

          {/* Parse Preview with expandable rows */}
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
                <p className="text-xs text-blue-500 mt-1">Click any customer row to see their line-item transactions</p>
              </div>

              {/* Customer summary table with expandable rows */}
              <div className="max-h-96 overflow-y-auto border border-navy-100 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-navy-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left py-2 px-3 text-xs font-medium text-navy-500 w-6"></th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-navy-500">Customer</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-navy-500">Revenue</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-navy-500">Profit</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-navy-500">Items</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-navy-500">Rep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsePreview.summaries.map((s, i) => (
                      <>
                        <tr
                          key={`summary-${i}`}
                          onClick={() => togglePreviewRow(i)}
                          className="border-t border-navy-50 cursor-pointer hover:bg-brand-50 transition-colors"
                        >
                          <td className="py-2 px-3 text-navy-400">
                            <span className={`inline-block transition-transform ${expandedPreview.has(i) ? 'rotate-90' : ''}`}>&#9654;</span>
                          </td>
                          <td className="py-2 px-3 font-medium text-brand-700">{s.customer_name}</td>
                          <td className="py-2 px-3 text-right text-green-600 font-medium">${s.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right text-navy-600">${s.total_profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right text-navy-500">{s.line_count}</td>
                          <td className="py-2 px-3 text-navy-500">{s.salesperson || '-'}</td>
                        </tr>
                        {expandedPreview.has(i) && (
                          <tr key={`detail-${i}`}>
                            <td colSpan={6} className="p-0">
                              <div className="bg-navy-50 border-y border-navy-100">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-navy-400">
                                      <th className="text-left py-1.5 px-3 pl-10">Date</th>
                                      <th className="text-left py-1.5 px-3">Item</th>
                                      <th className="text-right py-1.5 px-3">Qty</th>
                                      <th className="text-right py-1.5 px-3">Amount</th>
                                      <th className="text-right py-1.5 px-3">COGS</th>
                                      <th className="text-right py-1.5 px-3">Profit</th>
                                      <th className="text-left py-1.5 px-3">Category</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.lineItems.map((item, j) => (
                                      <tr key={j} className="border-t border-navy-100/50 hover:bg-white/50">
                                        <td className="py-1.5 px-3 pl-10 text-navy-600">{item.date}</td>
                                        <td className="py-1.5 px-3 font-medium text-navy-800">{item.item}</td>
                                        <td className="py-1.5 px-3 text-right text-navy-600">{item.quantity}</td>
                                        <td className="py-1.5 px-3 text-right text-green-600">${item.amount.toFixed(2)}</td>
                                        <td className="py-1.5 px-3 text-right text-navy-500">${item.cogs.toFixed(2)}</td>
                                        <td className={`py-1.5 px-3 text-right ${item.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                          ${item.profit.toFixed(2)}
                                        </td>
                                        <td className="py-1.5 px-3 text-navy-500">{item.category || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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

      {/* Main Sales Table - grouped by customer with expandable rows */}
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
                <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase w-6"></th>
                <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Customer</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-navy-500 uppercase">Revenue</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-navy-500 uppercase">Transactions</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Date Range</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-navy-500 uppercase">Source</th>
              </tr>
            </thead>
            <tbody>
              {customerTotals.map((ct) => {
                const isExpanded = expandedSale === ct.name;
                const lineItems = lastImportedLines.filter(l =>
                  l.customer_name === ct.name ||
                  (ct.shop_name && l.customer_name === ct.shop_name)
                );
                return (
                  <>
                    <tr
                      key={ct.name}
                      onClick={() => setExpandedSale(isExpanded ? null : ct.name)}
                      className="border-b border-navy-50 cursor-pointer hover:bg-brand-50 transition-colors"
                    >
                      <td className="py-3 px-4 text-navy-400">
                        <span className={`inline-block transition-transform text-xs ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-brand-700">
                        {ct.shop_name || ct.name}
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-bold text-green-600">
                        ${ct.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-navy-500">
                        {ct.count}
                      </td>
                      <td className="py-3 px-4 text-sm text-navy-500">
                        {ct.dates.length > 0 && (
                          <>
                            {new Date(ct.dates[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {ct.dates.length > 1 && (
                              <> &ndash; {new Date(ct.dates[ct.dates.length - 1] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                            )}
                          </>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="badge bg-purple-100 text-purple-800">AccountEdge</span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${ct.name}-detail`}>
                        <td colSpan={6} className="p-0">
                          <div className="bg-navy-50 border-y border-navy-100">
                            {/* Show line items from last import if available */}
                            {lineItems.length > 0 ? (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-navy-400">
                                    <th className="text-left py-1.5 px-4 pl-10">Date</th>
                                    <th className="text-left py-1.5 px-3">Item</th>
                                    <th className="text-right py-1.5 px-3">Qty</th>
                                    <th className="text-right py-1.5 px-3">Amount</th>
                                    <th className="text-right py-1.5 px-3">COGS</th>
                                    <th className="text-right py-1.5 px-3">Profit</th>
                                    <th className="text-left py-1.5 px-3">Category</th>
                                    <th className="text-left py-1.5 px-3">Product Line</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lineItems.map((item, j) => (
                                    <tr key={j} className="border-t border-navy-100/50 hover:bg-white/50">
                                      <td className="py-1.5 px-4 pl-10 text-navy-600">{item.date}</td>
                                      <td className="py-1.5 px-3 font-medium text-navy-800">{item.item}</td>
                                      <td className="py-1.5 px-3 text-right text-navy-600">{item.quantity}</td>
                                      <td className="py-1.5 px-3 text-right text-green-600">${item.amount.toFixed(2)}</td>
                                      <td className="py-1.5 px-3 text-right text-navy-500">${item.cogs.toFixed(2)}</td>
                                      <td className={`py-1.5 px-3 text-right ${item.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        ${item.profit.toFixed(2)}
                                      </td>
                                      <td className="py-1.5 px-3 text-navy-500">{item.category || '-'}</td>
                                      <td className="py-1.5 px-3 text-navy-500">{item.product_line || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              /* Fall back to showing individual DB records */
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-navy-400">
                                    <th className="text-left py-1.5 px-4 pl-10">Date</th>
                                    <th className="text-right py-1.5 px-3">Amount</th>
                                    <th className="text-left py-1.5 px-3">Details</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ct.items.map((sale, j) => (
                                    <tr key={j} className="border-t border-navy-100/50 hover:bg-white/50">
                                      <td className="py-1.5 px-4 pl-10 text-navy-600">{sale.sale_date}</td>
                                      <td className="py-1.5 px-3 text-right text-green-600">${sale.sale_amount?.toFixed(2)}</td>
                                      <td className="py-1.5 px-3 text-navy-600">{sale.memo || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
