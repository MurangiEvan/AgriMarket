import axios from 'axios';

const API_BASE_URL = 'http://your-api-url.com/api/v1'; // Update with actual server URL

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Essential for session cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;
