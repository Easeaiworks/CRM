const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { initDatabase, queryAll, queryOne, execute } = require('./src/db/init');

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'refinish-ai-dev-secret-change-in-production';

// ─── Auth helpers ───
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}

function logAudit(req, entityType, entityId, action, changes = {}) {
  try {
    execute('INSERT INTO audit_log (user_id, entity_type, entity_id, action, changes, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user?.userId || null, entityType, entityId, action, JSON.stringify(changes), req.ip || 'unknown']);
  } catch (e) { console.error('Audit error:', e.message); }
}

// ─── Duplicate detection ───
function levenshtein(a, b) {
  const m = []; const al = a.length; const bl = b.length;
  if (!al) return bl; if (!bl) return al;
  for (let i = 0; i <= bl; i++) m[i] = [i];
  for (let j = 0; j <= al; j++) m[0][j] = j;
  for (let i = 1; i <= bl; i++)
    for (let j = 1; j <= al; j++)
      m[i][j] = b[i-1] === a[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
  return m[bl][al];
}

function similarity(a, b) {
  const al = a.toLowerCase().trim(); const bl = b.toLowerCase().trim();
  if (al === bl) return 1; const max = Math.max(al.length, bl.length);
  return max === 0 ? 1 : 1 - levenshtein(al, bl) / max;
}

function findDuplicates(shopName, city, threshold = 0.85, excludeId) {
  const all = queryAll('SELECT * FROM accounts WHERE deleted_at IS NULL' + (excludeId ? ' AND id != ?' : ''), excludeId ? [excludeId] : []);
  const matches = [];
  for (const a of all) {
    let score = similarity(shopName, a.shop_name);
    if (city && a.city && similarity(city, a.city) > 0.8) score = Math.min(score + 0.05, 1);
    if (score >= threshold) matches.push({ account: a, score });
  }
  return matches.sort((a, b) => b.score - a.score);
}

async function startServer() {
  await initDatabase();
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());
  // In production, allow same-origin (frontend served from same server)
  const corsOrigin = process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGIN || true)
    : 'http://localhost:5173';
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));

  const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: 'Too many attempts' } });
  app.use('/api/auth/login', authLimiter);

  // ─── AUTH ROUTES ───
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, first_name, last_name, role } = req.body;
      if (!email || !password || !first_name || !last_name) return res.status(400).json({ error: 'All fields required' });
      if (queryOne('SELECT id FROM users WHERE email = ?', [email])) return res.status(409).json({ error: 'Email exists' });
      const hash = await bcrypt.hash(password, 12);
      const { lastId } = execute('INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?,?,?,?,?)',
        [email, hash, first_name, last_name, role || 'rep']);
      res.status(201).json({ token: generateToken({ userId: lastId, email, role: role || 'rep' }),
        user: { id: lastId, email, first_name, last_name, role: role || 'rep' } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = queryOne('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
      if (!user || !(await bcrypt.compare(password, user.password_hash)))
        return res.status(401).json({ error: 'Invalid credentials' });
      execute('UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);
      logAudit(req, 'user', user.id, 'login', {});
      res.json({ token: generateToken({ userId: user.id, email: user.email, role: user.role }),
        user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/auth/me', authenticate, (req, res) => {
    const u = queryOne('SELECT id,email,first_name,last_name,role FROM users WHERE id=?', [req.user.userId]);
    res.json({ user: u });
  });

  app.get('/api/auth/users', authenticate, (req, res) => {
    res.json({ users: queryAll('SELECT id,email,first_name,last_name,role,is_active,last_login,created_at FROM users ORDER BY first_name') });
  });

  // ─── ACCOUNTS ROUTES ───
  app.get('/api/accounts', authenticate, (req, res) => {
    try {
      const { status, assigned_rep_id, city, search, page = '1', limit = '50' } = req.query;
      const pg = parseInt(page); const lim = parseInt(limit); const off = (pg-1)*lim;
      let where = ['a.deleted_at IS NULL']; let params = [];
      if (status) { where.push('a.status = ?'); params.push(status); }
      if (assigned_rep_id) { where.push('a.assigned_rep_id = ?'); params.push(assigned_rep_id); }
      if (city) { where.push('a.city LIKE ?'); params.push(`%${city}%`); }
      if (search) {
        where.push('(a.shop_name LIKE ? OR a.contact_names LIKE ? OR a.city LIKE ? OR a.email LIKE ? OR a.phone LIKE ?)');
        const s = `%${search}%`; params.push(s,s,s,s,s);
      }
      const w = 'WHERE ' + where.join(' AND ');
      const total = queryOne(`SELECT COUNT(*) as total FROM accounts a ${w}`, params);
      const accounts = queryAll(
        `SELECT a.*, u.first_name as rep_first_name, u.last_name as rep_last_name FROM accounts a LEFT JOIN users u ON a.assigned_rep_id=u.id ${w} ORDER BY a.shop_name LIMIT ? OFFSET ?`,
        [...params, lim, off]);
      res.json({ accounts, pagination: { page: pg, limit: lim, total: total?.total || 0, totalPages: Math.ceil((total?.total||0)/lim) } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/accounts/export/csv', authenticate, (req, res) => {
    const accounts = queryAll('SELECT a.*, u.first_name as rfn, u.last_name as rln FROM accounts a LEFT JOIN users u ON a.assigned_rep_id=u.id WHERE a.deleted_at IS NULL ORDER BY a.shop_name');
    const hdr = 'Shop Name,City,Contact,Phone,Email,Status,Rep\n';
    const rows = accounts.map(a => `"${a.shop_name}","${a.city||''}","${a.contact_names||''}","${a.phone||''}","${a.email||''}","${a.status}","${a.rfn||''} ${a.rln||''}"`).join('\n');
    res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename=accounts.csv');
    res.send(hdr + rows);
  });

  app.get('/api/accounts/:id', authenticate, (req, res) => {
    try {
      const account = queryOne('SELECT a.*, u.first_name as rep_first_name, u.last_name as rep_last_name FROM accounts a LEFT JOIN users u ON a.assigned_rep_id=u.id WHERE a.id=? AND a.deleted_at IS NULL', [req.params.id]);
      if (!account) return res.status(404).json({ error: 'Not found' });
      const notes = queryAll('SELECT n.*, u.first_name, u.last_name FROM notes n JOIN users u ON n.created_by_id=u.id WHERE n.account_id=? ORDER BY n.created_at DESC', [req.params.id]);
      const activities = queryAll('SELECT act.*, u.first_name, u.last_name FROM activities act JOIN users u ON act.rep_id=u.id WHERE act.account_id=? ORDER BY act.created_at DESC LIMIT 20', [req.params.id]);
      res.json({ account, notes, activities });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/accounts/check-duplicate', authenticate, (req, res) => {
    const dupes = findDuplicates(req.body.shop_name, req.body.city, 0.80, req.body.exclude_id);
    res.json({ hasDuplicates: dupes.length > 0, duplicates: dupes.map(d => ({
      id: d.account.id, shop_name: d.account.shop_name, city: d.account.city, status: d.account.status, score: d.score
    }))});
  });

  app.post('/api/accounts', authenticate, (req, res) => {
    try {
      const b = req.body;
      if (!b.shop_name) return res.status(400).json({ error: 'shop_name required' });
      if (!b.skip_duplicate_check) {
        const dupes = findDuplicates(b.shop_name, b.city);
        if (dupes.length > 0) return res.status(409).json({ error: 'Potential duplicate', duplicates: dupes.map(d => ({
          id: d.account.id, shop_name: d.account.shop_name, city: d.account.city, status: d.account.status, score: d.score }))});
      }
      const { lastId } = execute(
        `INSERT INTO accounts (shop_name,address,city,area,province,contact_names,phone,email,account_type,assigned_rep_id,status,suppliers,paint_line,allied_products,sundries,has_contract,mpo,num_techs,sq_footage,annual_revenue,former_sherwin_client,follow_up_date,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [b.shop_name,b.address||null,b.city||null,b.area||null,b.province||'ON',b.contact_names||null,b.phone||null,b.email||null,b.account_type||'collision',b.assigned_rep_id||null,b.status||'prospect',b.suppliers||null,b.paint_line||null,b.allied_products||null,b.sundries||null,b.has_contract?1:0,b.mpo||null,b.num_techs||null,b.sq_footage||null,b.annual_revenue||null,b.former_sherwin_client?1:0,b.follow_up_date||null,JSON.stringify(b.tags||[])]);
      logAudit(req, 'account', lastId, 'create', { shop_name: b.shop_name });
      res.status(201).json({ account: queryOne('SELECT * FROM accounts WHERE id=?', [lastId]) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/accounts/:id', authenticate, (req, res) => {
    try {
      const existing = queryOne('SELECT * FROM accounts WHERE id=? AND deleted_at IS NULL', [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const fields = ['shop_name','address','city','area','province','contact_names','phone','email','account_type','assigned_rep_id','status','suppliers','paint_line','allied_products','sundries','has_contract','mpo','num_techs','sq_footage','annual_revenue','former_sherwin_client','follow_up_date','tags'];
      const updates = ['updated_at = datetime("now")']; const params = []; const changes = {};
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          let v = req.body[f];
          if (f === 'tags' && Array.isArray(v)) v = JSON.stringify(v);
          if (f === 'has_contract' || f === 'former_sherwin_client') v = v ? 1 : 0;
          updates.push(`${f} = ?`); params.push(v); changes[f] = { from: existing[f], to: v };
        }
      }
      params.push(req.params.id);
      execute(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`, params);
      logAudit(req, 'account', parseInt(req.params.id), 'update', changes);
      res.json({ account: queryOne('SELECT * FROM accounts WHERE id=?', [req.params.id]) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/accounts/:id', authenticate, (req, res) => {
    execute('UPDATE accounts SET deleted_at = datetime("now") WHERE id = ?', [req.params.id]);
    logAudit(req, 'account', parseInt(req.params.id), 'delete', {});
    res.json({ message: 'Deleted' });
  });

  app.post('/api/accounts/import', authenticate, (req, res) => {
    try {
      const { accounts: data, skip_duplicates } = req.body;
      if (!Array.isArray(data)) return res.status(400).json({ error: 'accounts array required' });
      let imported = 0, skipped = 0, dupesList = [];
      for (const r of data) {
        if (!r.shop_name) { skipped++; continue; }
        const dupes = findDuplicates(r.shop_name, r.city, 0.85);
        if (dupes.length > 0 && !skip_duplicates) { dupesList.push({ shop_name: r.shop_name, matchedWith: dupes[0].account.shop_name }); skipped++; continue; }
        execute(`INSERT INTO accounts (shop_name,address,city,contact_names,phone,email,status,tags) VALUES (?,?,?,?,?,?,?,?)`,
          [r.shop_name,r.address||null,r.city||null,r.contact_names||null,r.phone||null,r.email||null,r.status||'prospect','[]']);
        imported++;
      }
      logAudit(req, 'account', null, 'import', { imported, skipped });
      res.json({ imported, skipped, duplicates: dupesList, total: data.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── NOTES ROUTES ───
  app.get('/api/accounts/:id/notes', authenticate, (req, res) => {
    res.json({ notes: queryAll('SELECT n.*, u.first_name, u.last_name FROM notes n JOIN users u ON n.created_by_id=u.id WHERE n.account_id=? ORDER BY n.created_at DESC', [req.params.id]) });
  });

  app.post('/api/accounts/:id/notes', authenticate, (req, res) => {
    try {
      if (!req.body.content?.trim()) return res.status(400).json({ error: 'Content required' });
      const { lastId } = execute('INSERT INTO notes (account_id, created_by_id, content, is_voice_transcribed) VALUES (?,?,?,?)',
        [req.params.id, req.user.userId, req.body.content.trim(), req.body.is_voice_transcribed ? 1 : 0]);
      execute('UPDATE accounts SET last_contacted_at=datetime("now"), updated_at=datetime("now") WHERE id=?', [req.params.id]);
      logAudit(req, 'note', lastId, 'create', { account_id: req.params.id });
      res.status(201).json({ note: queryOne('SELECT n.*, u.first_name, u.last_name FROM notes n JOIN users u ON n.created_by_id=u.id WHERE n.id=?', [lastId]) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── ACTIVITIES ROUTES ───
  app.post('/api/accounts/:id/activities', authenticate, (req, res) => {
    try {
      const { lastId } = execute('INSERT INTO activities (account_id, rep_id, activity_type, description, completed_date) VALUES (?,?,?,?,datetime("now"))',
        [req.params.id, req.user.userId, req.body.activity_type, req.body.description || null]);
      execute('UPDATE accounts SET last_contacted_at=datetime("now"), updated_at=datetime("now") WHERE id=?', [req.params.id]);
      logAudit(req, 'activity', lastId, 'create', { account_id: req.params.id });
      res.status(201).json({ activity: queryOne('SELECT act.*, u.first_name, u.last_name FROM activities act JOIN users u ON act.rep_id=u.id WHERE act.id=?', [lastId]) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/activities/reminders', authenticate, (req, res) => {
    const days = parseInt(req.query.days) || 14;
    const repFilter = req.user.role === 'rep' ? 'AND a.assigned_rep_id = ?' : '';
    const params = [days]; if (req.user.role === 'rep') params.push(req.user.userId);
    res.json({ dormant: queryAll(
      `SELECT a.*, u.first_name as rep_first_name, u.last_name as rep_last_name FROM accounts a LEFT JOIN users u ON a.assigned_rep_id=u.id WHERE a.deleted_at IS NULL AND a.status IN ('prospect','active') AND (a.last_contacted_at IS NULL OR a.last_contacted_at < datetime('now', '-' || ? || ' days')) ${repFilter} ORDER BY a.last_contacted_at ASC LIMIT 50`, params) });
  });

  // ─── SALES ROUTES ───
  app.get('/api/sales', authenticate, (req, res) => {
    try {
      const { month, rep_id, account_id, page = '1', limit = '50' } = req.query;
      let where = []; let params = [];
      if (month) { where.push('s.month=?'); params.push(month); }
      if (rep_id) { where.push('s.rep_id=?'); params.push(rep_id); }
      if (account_id) { where.push('s.account_id=?'); params.push(account_id); }
      const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const pg = parseInt(page); const lim = parseInt(limit);
      const sales = queryAll(`SELECT s.*, a.shop_name, u.first_name as rep_first_name, u.last_name as rep_last_name FROM sales_data s LEFT JOIN accounts a ON s.account_id=a.id LEFT JOIN users u ON s.rep_id=u.id ${w} ORDER BY s.sale_date DESC LIMIT ? OFFSET ?`,
        [...params, lim, (pg-1)*lim]);
      const tot = queryOne(`SELECT COUNT(*) as total FROM sales_data s ${w}`, params);
      res.json({ sales, pagination: { page: pg, limit: lim, total: tot?.total || 0 } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/sales/import', authenticate, (req, res) => {
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ error: 'records array required' });
      const allAccounts = queryAll('SELECT id, shop_name FROM accounts WHERE deleted_at IS NULL');
      let imported = 0; const unmatched = [];
      for (const r of records) {
        const name = r.customer_name || r['Customer Name'] || r['Name'] || '';
        const amt = parseFloat(r.amount || r['Amount'] || r['Total'] || 0);
        const date = r.date || r['Invoice Date'] || r['Date'] || '';
        const memo = r.memo || r['Memo'] || r['Description'] || '';
        if (!name || !amt || !date) continue;
        let matchId = null, best = 0;
        for (const a of allAccounts) {
          const s = similarity(name, a.shop_name);
          if (s > best && s >= 0.80) { best = s; matchId = a.id; }
        }
        const month = date.substring(0, 7);
        execute('INSERT INTO sales_data (account_id,rep_id,sale_amount,sale_date,month,memo,customer_name,imported_from_accountedge) VALUES (?,?,?,?,?,?,?,1)',
          [matchId, req.user.userId, amt, date, month, memo, name]);
        if (!matchId) unmatched.push({ customer_name: name, amount: amt, date });
        imported++;
      }
      logAudit(req, 'sale', null, 'import', { imported, unmatched: unmatched.length });
      res.json({ imported, unmatched, total: records.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── DASHBOARD ───
  app.get('/api/sales/dashboard/metrics', authenticate, (req, res) => {
    try {
      const isRep = req.user.role === 'rep';
      const uid = req.user.userId;
      const rf = isRep ? 'AND assigned_rep_id = ?' : '';
      const rfs = isRep ? 'WHERE rep_id = ?' : '';
      const rfp = isRep ? [uid] : [];

      const statusCounts = queryAll(`SELECT status, COUNT(*) as count FROM accounts WHERE deleted_at IS NULL ${rf} GROUP BY status`, rfp);
      const monthlyRevenue = queryAll(`SELECT month, SUM(sale_amount) as total, COUNT(*) as count FROM sales_data ${rfs} GROUP BY month ORDER BY month DESC LIMIT 12`, rfp).reverse();
      const topAccounts = queryAll(`SELECT a.shop_name, a.city, SUM(s.sale_amount) as total_revenue, COUNT(s.id) as sale_count FROM sales_data s JOIN accounts a ON s.account_id=a.id ${rfs ? rfs.replace('WHERE', 'WHERE') + ' AND' : 'WHERE'} s.account_id IS NOT NULL GROUP BY s.account_id ORDER BY total_revenue DESC LIMIT 10`.replace('WHERE  AND', 'WHERE'), rfp);
      const recentActivities = queryAll(`SELECT act.*, a.shop_name, u.first_name, u.last_name FROM activities act JOIN accounts a ON act.account_id=a.id JOIN users u ON act.rep_id=u.id ${isRep ? 'WHERE act.rep_id=?' : ''} ORDER BY act.created_at DESC LIMIT 10`, rfp);
      const dormantCount = queryOne(`SELECT COUNT(*) as count FROM accounts WHERE deleted_at IS NULL AND status IN ('prospect','active') AND (last_contacted_at IS NULL OR last_contacted_at < datetime('now','-14 days')) ${rf}`, rfp);

      res.json({ statusCounts, monthlyRevenue, topAccounts, recentActivities, dormantCount: dormantCount?.count || 0,
        totalAccounts: statusCounts.reduce((s, c) => s + c.count, 0) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── SEARCH ───
  app.post('/api/search', authenticate, (req, res) => {
    try {
      const q = (req.body.query || '').toLowerCase().trim();
      if (!q) return res.status(400).json({ error: 'Query required' });

      let where = ['a.deleted_at IS NULL']; let params = [];
      const repMatch = q.match(/(?:michelle|ben|adam)(?:'s)?/i);
      if (repMatch) { where.push('u.first_name LIKE ?'); params.push(`%${repMatch[0].replace("'s",'')}%`); }

      const statusMap = { prospect:'prospect', prospects:'prospect', active:'active', customers:'active', clients:'active', cold:'cold', dnc:'dnc', 'do not contact':'dnc', churned:'churned' };
      for (const [kw, st] of Object.entries(statusMap)) { if (q.includes(kw)) { where.push('a.status=?'); params.push(st); break; } }

      const cityMatch = q.match(/(?:in|from|near)\s+([a-z\s]+?)(?:\s|$)/i);
      if (cityMatch) { where.push('a.city LIKE ?'); params.push(`%${cityMatch[1].trim()}%`); }

      if (q.includes('sherwin')) where.push('a.former_sherwin_client = 1');
      if (q.includes('dormant') || q.includes("haven't contacted") || q.includes('overdue')) {
        where.push("(a.last_contacted_at IS NULL OR a.last_contacted_at < datetime('now','-14 days'))");
        where.push("a.status IN ('prospect','active')");
      }

      if (q.includes('notes') || q.includes('note')) {
        const ns = q.replace(/notes?|on|about|for|show|me|find|get|what/gi, '').trim();
        const results = queryAll('SELECT n.*, a.shop_name, u.first_name, u.last_name FROM notes n JOIN accounts a ON n.account_id=a.id JOIN users u ON n.created_by_id=u.id WHERE a.shop_name LIKE ? OR n.content LIKE ? ORDER BY n.created_at DESC LIMIT 20',
          [`%${ns}%`, `%${ns}%`]);
        return res.json({ type: 'notes', results, query: q });
      }

      if (where.length === 1) {
        const terms = q.replace(/show|me|find|all|the|get|list|search|for|who|what|which|where/gi, '').trim();
        if (terms) { where.push('(a.shop_name LIKE ? OR a.contact_names LIKE ? OR a.city LIKE ?)'); const t = `%${terms}%`; params.push(t,t,t); }
      }

      const results = queryAll(`SELECT a.*, u.first_name as rep_first_name, u.last_name as rep_last_name FROM accounts a LEFT JOIN users u ON a.assigned_rep_id=u.id WHERE ${where.join(' AND ')} ORDER BY a.shop_name LIMIT 50`, params);
      res.json({ type: 'accounts', results, query: q });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── HEALTH ───
  app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'Refinish AI CRM', version: '1.0.0' }));

  // Serve frontend
  const frontendPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => { if (!req.path.startsWith('/api')) res.sendFile(path.join(frontendPath, 'index.html')); });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Refinish AI CRM - CHC Paint & Auto Body Supplies`);
    console.log(`  Server running on http://localhost:${PORT}\n`);
  });
}

startServer().catch(err => { console.error('Failed:', err); process.exit(1); });
