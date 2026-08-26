// Single source of truth for API URLs
// All frontend files should import from here instead of hardcoding localhost

// API URL with /api suffix — for API calls
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Backend base URL without /api — for static assets (uploads, logos, favicons)
export const BACKEND_URL = API_URL.replace(/\/api\/?$/, '');
