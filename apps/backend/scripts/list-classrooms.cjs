const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/tenant_instituto_testing' });

async function run() {
  await client.connect();
  const classrooms = await client.query('SELECT id, name, slug, grade, section, "academicYearId" FROM classrooms;');
  console.log('Classrooms in tenant:');
  console.table(classrooms.rows);

  const years = await client.query('SELECT id, name, status FROM academic_years;');
  console.log('Academic Years in tenant:');
  console.table(years.rows);

  await client.end();
}

run();
