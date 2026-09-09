import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 独立文档构建，不改变主应用或 Debug Studio 的生产入口。
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), {
    name: 'pbd-formal-document',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'docs/actors/pbd-layout-formal.md',
        source: readFileSync(resolve(__dirname, 'docs/actors/pbd-layout-formal.md'), 'utf8'),
      })
    },
  }],
  build: {
    outDir: 'dist-docs',
    rollupOptions: {
      input: resolve(__dirname, 'docs/actors/pbd-layout-explainer.html'),
    },
  },
})
