const { Client } = require('pg');
const client = new Client({ connectionString: process.env.TEST_DB_URL });

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
