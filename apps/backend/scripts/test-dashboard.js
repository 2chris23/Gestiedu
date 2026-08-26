
const fetch = global.fetch; // Node 18+

const ADMIN_EMAIL = 'admin@institutodemo.edu';
const ADMIN_PASS = '123456';
const BASE_URL = 'http://localhost:3002';
const STUDENT_ID = '78901234'; // From logs

async function testAuth() {
    console.log('1. Logging in as Admin...');

    try {
        const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS })
        });

        if (!loginRes.ok) {
            console.error('Login failed:', await loginRes.text());
            return;
        }

        const loginData = await loginRes.json();
        const token = loginData.tokens.accessToken;
        console.log('Login successful. Token acquired.');

        console.log(`2. Testing Dashboard Access for Student ID: ${STUDENT_ID}`);

        const dashRes = await fetch(`${BASE_URL}/api/students/${STUDENT_ID}/dashboard`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(`Response Status: ${dashRes.status}`);
        if (dashRes.ok) {
            console.log('SUCCESS: Admin can access student dashboard.');
            const data = await dashRes.json();
            console.log('KPIs:', data.kpis);
        } else {
            console.error('FAILURE: Request failed.');
            console.log('Headers:', dashRes.headers);
            console.error(await dashRes.text());
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

testAuth();
