import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import { load, dump } from 'js-yaml'
import { pickSavable } from './src/debug/captureSettings'

// ============================================================
// 常量
// ============================================================

const YAML_PATH = resolve(__dirname, 'src/debug/lighthouse-capture.yaml')

// ============================================================
// YAML 辅助函数
// ============================================================

function readYamlConfig(): Record<string, string | number> | null {
  if (!existsSync(YAML_PATH)) return null
  const raw = readFileSync(YAML_PATH, 'utf-8')
  return pickSavable(load(raw))
}

function writeYamlConfig(raw: Record<string, unknown>): void {
  const config = pickSavable(raw)
  const yaml = dump(config, { indent: 2, lineWidth: 120 })
  writeFileSync(YAML_PATH, yaml, 'utf-8')
}

// ============================================================
// urlPattern — 简易路径匹配
// ============================================================

function matchPath(url: string | undefined, pattern: string): boolean {
  const u = url ?? ''
  const idx = u.indexOf('?')
  const path = idx === -1 ? u : u.slice(0, idx)
  return path === pattern
}

// ============================================================
// debugOnlyPlugin — Vite 插件
// ============================================================

function debugOnlyPlugin(): Plugin {
  const IS_DEBUG = !!process.env.VITE_DEBUG_ONLY

  return {
    name: 'debug-only',
    configureServer(server) {
      const { logger } = server.config
      const G = (s: string) => `\x1b[32m${s}\x1b[39m`
      const B = (s: string) => `\x1b[1m${s}\x1b[22m`

      // 仅主入口监听此事件；Vite 的 /index.html full-reload 会重载所有页面。
      server.watcher.add(YAML_PATH)
      server.watcher.on('all', (_event, file) => {
        if (file === YAML_PATH) {
          server.ws.send({ type: 'custom', event: 'lighthouse-config-updated', data: {} })
        }
      })

      // ---- YAML 配置端点（dev / debug 均可用） ----

      server.middlewares.use((req, res, next) => {
        // GET /__debug/config → 读取 YAML → 返回 JSON
        if (req.method === 'GET' && matchPath(req.url, '/__debug/config')) {
          try {
            const cfg = readYamlConfig()
            if (cfg) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(cfg))
            } else {
              res.writeHead(204)
              res.end()
            }
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : '配置读取失败' }))
          }
          return
        }

        // POST /__debug/save-config → body JSON → 写入 YAML
        if (req.method === 'POST' && matchPath(req.url, '/__debug/save-config')) {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString()
              const cfg = JSON.parse(body)
              writeYamlConfig(cfg)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true }))
            } catch (error) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Invalid config' }))
            }
          })
          return
        }

        // DELETE /__debug/config → 删除 YAML 文件，恢复默认值
        if (req.method === 'DELETE' && matchPath(req.url, '/__debug/config')) {
          try {
            if (existsSync(YAML_PATH)) unlinkSync(YAML_PATH)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
          } catch {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false }))
          }
          return
        }

        next()
      })

      // ---- debug-only：302 重定向 + 覆盖 printUrls ----
      if (IS_DEBUG) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? ''
          if (url === '/' || url === '/index.html' || url.startsWith('/index.html?')) {
            res.writeHead(302, { Location: '/debug.html' })
            res.end()
            return
          }
          next()
        })

        server.printUrls = () => {
          const port = server.config.server.port
          logger.info(`\n  ${G('➜')}  ${B('Debug:')}   http://localhost:${port}/debug.html`)
        }
      } else {
        const original = server.printUrls.bind(server)
        server.printUrls = () => {
          original()
          const port = server.config.server.port
          logger.info(`  ${G('➜')}  ${B('Debug:')}   http://localhost:${port}/debug.html`)
        }
      }
    },
  }
}

// 启动时读取 YAML 配置（无文件则为空对象），注入为编译时常量
const _buildTimeConfig = readYamlConfig() ?? {}

export default defineConfig({
  plugins: [react(), debugOnlyPlugin()],
  define: {
    __LIGHTHOUSE_CONFIG__: JSON.stringify(_buildTimeConfig),
  },
  test: {
    environment: 'jsdom',
    setupFiles: [],
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['yequdesu.top', 'localhost', '10.0.0.2'],
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9999',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
