
const fetch = require('node-fetch'); // Assuming node-fetch is available or using native fetch in Node 18+

async function test() {
    try {
        // 1. Login
        console.log('Logging in...');
        const loginRes = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@institutodemo.edu', password: '123456' })
        });

        const loginData = await loginRes.json();
        if (!loginRes.ok) {
            console.error('Login failed:', loginData);
            return;
        }
        console.log('Login success. Token obtained.');
        const token = loginData.tokens.accessToken;

        // 2. Create User
        console.log('Creating user...');
        const userPayload = {
            firstName: 'Test',
            lastName: 'Directo',
            email: `test.directo.${Date.now()}@demo.edu`,
            id: '' + Math.floor(Math.random() * 1000000000),
            role: 'STUDENT', // Usando el valor ENGLISH que espera el enum interno o el mapeo
            gender: 'MASCULINO',
            password: 'password123',
            // instituteId se inyecta en el controller, no hace falta enviarlo si el auth lo tiene, 
            // pero el controller lo ignora del body y lo pone hardcoded.
        };

        const createRes = await fetch('http://localhost:3001/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(userPayload)
        });

        const createData = await createRes.json();
        console.log('Status:', createRes.status);
        console.log('Response:', JSON.stringify(createData, null, 2));

    } catch (err) {
        console.error('Error:', err);
    }
}

test();
