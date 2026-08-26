
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../src/utils/prisma-enums';
import { API_URL } from '../src/config/env'; // Assuming env config is here, wait, usually in backend scripts we can just fetch localhost
// import fetch from 'node-fetch'; // Use global fetch

const ADMIN_EMAIL = 'admin@institutodemo.edu';
const ADMIN_PASS = '123456';
const BASE_URL = 'http://localhost:3002'; // Adjust if needed

async function testAuth() {
    console.log('1. Logging in as Admin...');

    // Login
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
    console.log('Login successful. Token:', token.substring(0, 20) + '...');

    // Find a student ID to test
    const prisma = new PrismaClient();
    const student = await prisma.user.findFirst({ where: { role: UserRole.STUDENT } });
    if (!student) {
        console.error('No student found in DB');
        return;
    }

    const studentId = student.id;
    console.log(`2. Testing Dashboard Access for Student ID: ${studentId}`);

    // Call Dashboard
    const dashRes = await fetch(`${BASE_URL}/api/students/${studentId}/dashboard`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    console.log(`Response Status: ${dashRes.status}`);
    if (dashRes.ok) {
        console.log('SUCCESS: Admin can access student dashboard.');
        const data = await dashRes.json();
        console.log('Data keys:', Object.keys(data));
    } else {
        console.error('FAILURE: Request failed.');
        console.error(await dashRes.text());
    }

    await prisma.$disconnect();
}

testAuth();
