// Test authentication and slug lookup via HTTP
const testUrl = 'http://localhost:3001/api/subjects/ciencias-naturales';

console.log('Testing URL:', testUrl);
console.log('\nAttempting request WITHOUT authentication...\n');

fetch(testUrl)
    .then(res => {
        console.log('Status:', res.status, res.statusText);
        return res.json();
    })
    .then(data => {
        console.log('Response:', JSON.stringify(data, null, 2));
    })
    .catch(err => {
        console.error('Error:', err.message);
    });
