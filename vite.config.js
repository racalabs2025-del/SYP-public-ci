import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          if (
            id.includes('node_modules/recharts') ||
            id.includes('node_modules/d3-') ||
            id.includes('node_modules/victory-vendor')
          ) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/firebase')) {
            return 'vendor-firebase';
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router-dom')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@heroicons')) {
            return 'vendor-icons';
          }
          if (id.includes('istanbulGeoJsonPathsAnadolu')) {
            return 'data-geo-anadolu';
          }
          if (id.includes('istanbulGeoJsonPathsAvrupa')) {
            return 'data-geo-avrupa';
          }
          if (id.includes('canonicalMeydanData')) {
            return 'data-meydanlar';
          }
          if (id.includes('istanbulNeighborhoodsData')) {
            return 'data-mahalleler';
          }
          return undefined;
        },
      },
    },
  },
})
