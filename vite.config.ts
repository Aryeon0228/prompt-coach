import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH is set by the GitHub Pages workflow (/<repo>/); locally the app runs at /
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'templates/*.json'],
      manifest: {
        name: '프롬프트 코치',
        short_name: '프롬프트 코치',
        description: '첫 프롬프트를 만들고, 결과를 보며 고치는 법을 익히는 수업 도구',
        lang: 'ko',
        display: 'standalone',
        background_color: '#f4f1e9',
        theme_color: '#285b47',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,json}'] },
    }),
  ],
})
