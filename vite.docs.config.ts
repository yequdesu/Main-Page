import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 独立文档构建，不改变主应用或 Debug Studio 的生产入口。
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), {
    name: 'supporting-documents',
    generateBundle() {
      for (const fileName of ['docs/actors/pbd-layout-formal.md', 'docs/stellar-plasma-model.md']) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(resolve(__dirname, fileName), 'utf8') })
      }
    },
  }],
  build: {
    outDir: 'dist-docs',
    rollupOptions: {
      input: {
        pbd: resolve(__dirname, 'docs/actors/pbd-layout-explainer.html'),
        stellar: resolve(__dirname, 'docs/actors/stellar-morphology-explainer.html'),
      },
    },
  },
})
