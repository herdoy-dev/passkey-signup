import axios from 'axios';

export default axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'x-api-token': process.env.NEXT_PUBLIC_API_TOKEN,
  },
});