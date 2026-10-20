import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the site from /<repo>/, so the base must match.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES ? '/wheel-strategy-analyzer/' : '/',
})
