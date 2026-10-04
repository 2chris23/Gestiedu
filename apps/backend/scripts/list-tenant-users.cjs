const { Client } = require('pg');
const client = new Client({ connectionString: process.env.TEST_DB_URL });

async function run() {
  await client.connect();
  const res = await client.query('SELECT id, email, role, "firstName", "lastName", "isActive" FROM users ORDER BY role, email ASC;');
  console.log('Users in tenant_instituto_testing:');
  console.table(res.rows);
  await client.end();
}

run();
