const { initDatabase, execute, queryOne } = require('./init');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

const SPREADSHEET_PATH = '/sessions/quirky-zen-rubin/mnt/uploads/Michelle Ben Current & Prospect Accounts - 2026.xlsx';

async function seed() {
  await initDatabase();
  console.log('Seeding database...');

  const adminHash = await bcrypt.hash('admin123', 12);
  const repHash = await bcrypt.hash('rep123', 12);

  let existingAdmin = queryOne('SELECT id FROM users WHERE email = ?', ['adam@chcpaint.com']);
  if (!existingAdmin) {
    execute('INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
      ['adam@chcpaint.com', adminHash, 'Adam', 'Berube', 'admin']);
    console.log('Created admin: adam@chcpaint.com / admin123');
  }

  let existingMichelle = queryOne('SELECT id FROM users WHERE email = ?', ['michelle@chcpaint.com']);
  let michelleId;
  if (!existingMichelle) {
    const { lastId } = execute('INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
      ['michelle@chcpaint.com', repHash, 'Michelle', 'Rep', 'rep']);
    michelleId = lastId;
    console.log('Created rep: michelle@chcpaint.com / rep123');
  } else {
    michelleId = existingMichelle.id;
  }

  let existingBen = queryOne('SELECT id FROM users WHERE email = ?', ['ben@chcpaint.com']);
  let benId;
  if (!existingBen) {
    const { lastId } = execute('INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
      ['ben@chcpaint.com', repHash, 'Ben', 'Halliday', 'rep']);
    benId = lastId;
    console.log('Created rep: ben@chcpaint.com / rep123');
  } else {
    benId = existingBen.id;
  }

  const accountCount = queryOne('SELECT COUNT(*) as count FROM accounts');
  if (accountCount && accountCount.count > 0) {
    console.log(`Already have ${accountCount.count} accounts. Skipping import.`);
    return;
  }

  console.log('Reading spreadsheet...');
  const workbook = XLSX.readFile(SPREADSHEET_PATH);
  let totalImported = 0;

  // Michelle's Accounts
  const michelleSheet = workbook.Sheets['Michelles Accounts'];
  if (michelleSheet) {
    const rows = XLSX.utils.sheet_to_json(michelleSheet, { defval: null });
    for (const row of rows) {
      const shopName = row['Shop Name'];
      if (!shopName) continue;
      const { lastId } = execute(
        `INSERT INTO accounts (shop_name, city, assigned_rep_id, status, former_sherwin_client, tags) VALUES (?, ?, ?, 'prospect', ?, '[]')`,
        [shopName, row['City/Area'] || null, michelleId, row['Former Sherwin Client? Y/N'] === 'Y' ? 1 : 0]
      );
      if (row['Notes']) {
        execute('INSERT INTO notes (account_id, created_by_id, content) VALUES (?, ?, ?)',
          [lastId, michelleId, `[Imported] ${row['Notes']}`]);
      }
      totalImported++;
    }
    console.log(`Michelle's Accounts: ${totalImported} imported`);
  }

  // Ben's Accounts
  const benSheet = workbook.Sheets['Bens Accounts'];
  let benCount = 0;
  if (benSheet) {
    const rows = XLSX.utils.sheet_to_json(benSheet, { defval: null });
    for (const row of rows) {
      const shopName = row['Shop Name'];
      if (!shopName) continue;
      execute(`INSERT INTO accounts (shop_name, city, assigned_rep_id, status, tags) VALUES (?, ?, ?, 'prospect', '[]')`,
        [shopName, row['City/Area'] || null, benId]);
      totalImported++; benCount++;
    }
    console.log(`Ben's Accounts: ${benCount} imported`);
  }

  // Joint Accounts
  const jointSheet = workbook.Sheets['Joint Accounts'];
  let jointCount = 0;
  if (jointSheet) {
    const rows = XLSX.utils.sheet_to_json(jointSheet, { defval: null });
    for (const row of rows) {
      const shopName = row['Shop Name'];
      if (!shopName) continue;
      execute(
        `INSERT INTO accounts (shop_name, address, city, contact_names, suppliers, paint_line, sundries, has_contract, mpo, num_techs, sq_footage, status, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', '[]')`,
        [shopName, row['Address'] || null, row['City/Area'] || null, row['Contact(s)'] || null,
         row['Supplier(s)'] || null, row['Paint'] || null, row['Sundries'] || null,
         row['Contract? Y/N'] === 'Y' ? 1 : 0, row['MPO'] || null,
         row['# of Techs'] || null, row['Shop Sq. Footage'] || null]);
      totalImported++; jointCount++;
    }
    console.log(`Joint Accounts: ${jointCount} imported`);
  }

  // Cold accounts
  const coldSheet = workbook.Sheets['Cold'];
  let coldCount = 0;
  if (coldSheet) {
    const rows = XLSX.utils.sheet_to_json(coldSheet, { defval: null });
    for (const row of rows) {
      const shopName = row['Shop Name'];
      if (!shopName) continue;
      const { lastId } = execute(
        `INSERT INTO accounts (shop_name, address, city, status, tags) VALUES (?, ?, ?, 'cold', '[]')`,
        [shopName, row['Address'] || null, row['City'] || null]);
      if (row['Reason']) {
        execute('INSERT INTO notes (account_id, created_by_id, content) VALUES (?, ?, ?)',
          [lastId, benId, `[Cold - Reason] ${row['Reason']}`]);
      }
      totalImported++; coldCount++;
    }
    console.log(`Cold Accounts: ${coldCount} imported`);
  }

  // DNC Request
  const dncSheet = workbook.Sheets['DNC Request'];
  let dncCount = 0;
  if (dncSheet) {
    const rows = XLSX.utils.sheet_to_json(dncSheet, { defval: null });
    for (const row of rows) {
      const shopName = row['Shop Name'];
      if (!shopName) continue;
      const repPursuing = row['Rep Pursuing'] || '';
      const assignedId = repPursuing.toLowerCase().includes('michelle') ? michelleId : benId;
      const { lastId } = execute(
        `INSERT INTO accounts (shop_name, city, assigned_rep_id, status, tags) VALUES (?, ?, ?, 'dnc', '[]')`,
        [shopName, row['City/Area'] || null, assignedId]);
      if (row['Notes']) {
        execute('INSERT INTO notes (account_id, created_by_id, content) VALUES (?, ?, ?)',
          [lastId, assignedId, `[DNC - Reason] ${row['Notes']}`]);
      }
      totalImported++; dncCount++;
    }
    console.log(`DNC Requests: ${dncCount} imported`);
  }

  console.log(`\nTotal accounts imported: ${totalImported}`);
  console.log('Seed complete!');
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
