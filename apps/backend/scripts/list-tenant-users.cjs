const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/tenant_instituto_testing' });

async function run() {
  await client.connect();
  const res = await client.query('SELECT id, email, role, "firstName", "lastName", "isActive" FROM users ORDER BY role, email ASC;');
  console.log('Users in tenant_instituto_testing:');
  console.table(res.rows);
  await client.end();
}

run();
