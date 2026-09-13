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
      // 根目录提供静态入口；相对跳转同样适用于普通静态服务器与子路径部署。
      this.emitFile({
        type: 'asset', fileName: 'index.html',
        source: '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./docs/index.html"><title>YeQuDesu · 交互实验目录</title></head><body><a href="./docs/index.html">进入交互实验目录</a></body></html>',
      })
      for (const fileName of ['docs/actors/pbd-layout-formal.md', 'docs/stellar-plasma-model.md']) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(resolve(__dirname, fileName), 'utf8') })
      }
    },
  }],
  build: {
    outDir: 'dist-docs',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'docs/index.html'),
        pbd: resolve(__dirname, 'docs/actors/pbd-layout-explainer.html'),
        stellar: resolve(__dirname, 'docs/actors/stellar-morphology-explainer.html'),
        cme: resolve(__dirname, 'docs/actors/cme-dissolution-explainer.html'),
      },
    },
  },
})
