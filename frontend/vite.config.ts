import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],
  css: {
    modules: {
      // Generate scoped class names
      localsConvention: 'camelCase',
      // Pattern for class name generation
      generateScopedName: '[name]__[local]--[hash:base64:5]',
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
})
