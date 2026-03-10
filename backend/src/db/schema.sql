-- Refinish AI CRM Database Schema
-- CHC Paint & Auto Body Supplies

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'rep' CHECK(role IN ('rep', 'manager', 'admin')),
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  area TEXT,
  province TEXT DEFAULT 'ON',
  contact_names TEXT,
  phone TEXT,
  email TEXT,
  account_type TEXT DEFAULT 'collision',
  assigned_rep_id INTEGER,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK(status IN ('prospect', 'active', 'cold', 'dnc', 'churned')),
  suppliers TEXT,
  paint_line TEXT,
  allied_products TEXT,
  sundries TEXT,
  has_contract INTEGER DEFAULT 0,
  mpo TEXT,
  num_techs INTEGER,
  sq_footage TEXT,
  annual_revenue REAL,
  former_sherwin_client INTEGER DEFAULT 0,
  follow_up_date TEXT,
  last_contacted_at TEXT,
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (assigned_rep_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  created_by_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_voice_transcribed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  rep_id INTEGER NOT NULL,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('call', 'email', 'meeting', 'visit', 'other')),
  description TEXT,
  scheduled_date TEXT,
  completed_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (rep_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sales_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  rep_id INTEGER,
  sale_amount REAL NOT NULL,
  sale_date TEXT NOT NULL,
  month TEXT NOT NULL,
  memo TEXT,
  customer_name TEXT,
  imported_from_accountedge INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (rep_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete', 'import', 'login', 'logout')),
  changes TEXT DEFAULT '{}',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS duplicate_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_1_id INTEGER NOT NULL,
  account_2_id INTEGER NOT NULL,
  similarity_score REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'merged', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (account_1_id) REFERENCES accounts(id),
  FOREIGN KEY (account_2_id) REFERENCES accounts(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_shop_name ON accounts(shop_name);
CREATE INDEX IF NOT EXISTS idx_accounts_city ON accounts(city);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_assigned_rep ON accounts(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_accounts_last_contacted ON accounts(last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_notes_account ON notes(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_account ON activities(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_account ON sales_data(account_id);
CREATE INDEX IF NOT EXISTS idx_sales_month ON sales_data(month);
CREATE INDEX IF NOT EXISTS idx_sales_rep ON sales_data(rep_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);
