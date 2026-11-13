import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Đường dẫn gốc: '/' cho Vercel, '/nhi_dong_1/' cho GitHub Pages (đặt qua biến VITE_BASE khi build)
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  css: {
    postcss: {},
  },
})


