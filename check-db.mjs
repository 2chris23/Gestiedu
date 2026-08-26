import pg from 'pg';
import bcrypt from 'bcrypt';
const { Client } = pg;

const t = new Client({
    host: 'localhost', port: 5432, user: 'postgres',
    password: 'megustaelcoco2003', database: 'tenant_test_load_5k'
});
await t.connect();

// Buscar el admin
const res = await t.query(
    `SELECT id, email, password, role, "isActive" FROM users WHERE role = 'ADMIN' LIMIT 5`
);

console.log('\n=== Admins en tenant_test_load_5k ===');
res.rows.forEach(u => {
    console.log(`  email: ${u.email}  role: ${u.role}  active: ${u.isActive}`);
    console.log(`  id: ${u.id}`);
    console.log(`  hash: ${u.password.slice(0, 30)}...`);
});

// Verificar si la contraseña Test123! coincide
if (res.rows.length > 0) {
    const match = await bcrypt.compare('Test123!', res.rows[0].password);
    console.log(`\n  ¿'Test123!' coincide con el hash? ${match ? '✅ SÍ' : '❌ NO'}`);

    if (!match) {
        // Actualizar el password del admin a Test123!
        console.log('\n🔧 Actualizando password del admin a Test123!...');
        const newHash = await bcrypt.hash('Test123!', 12);
        await t.query(`UPDATE users SET password = $1 WHERE role = 'ADMIN'`, [newHash]);
        console.log(`✅ Password actualizado para todos los admins`);

        // Verificar
        const verify = await bcrypt.compare('Test123!', newHash);
        console.log(`✅ Verificación: ${verify ? 'OK' : 'FALLO'}`);
    }
}

await t.end();
