import { readFileSync } from 'fs';
import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      // Direct folder aliases for clean imports
      components: path.resolve(__dirname, 'src/components'),
      features: path.resolve(__dirname, 'src/features'),
      hooks: path.resolve(__dirname, 'src/hooks'),
      services: path.resolve(__dirname, 'src/services'),
      utils: path.resolve(__dirname, 'src/utils'),
      types: path.resolve(__dirname, 'src/types'),
      constants: path.resolve(__dirname, 'src/constants'),
      assets: path.resolve(__dirname, 'src/assets'),
      // src alias for root-level files like config
      src: path.resolve(__dirname, 'src'),
    },
  },
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
});
