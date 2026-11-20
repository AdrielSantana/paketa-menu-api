import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, inject, it } from 'vitest'

// Sobe o ponto de entrada do servidor (src/index.ts) em um processo de
// verdade: é o único jeito de testar ordem de carga do .env, falha no listen
// e encerramento por sinal.

const ROOT = path.resolve(__dirname, '../..')
const TSX = path.join(ROOT, 'node_modules/.bin/tsx')
const ENTRY = path.join(ROOT, 'src/index.ts')
const TIMEOUT = 20_000

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

const occupyPort = () =>
  new Promise<number>(resolve => {
    const server = net.createServer()
    cleanups.push(() => server.close())
    server.listen(0, () => resolve((server.address() as net.AddressInfo).port))
  })

const freePort = async () => {
  const port = await occupyPort()
  cleanups.pop()!()
  return port
}

const boot = (env: Record<string, string>, dotenv = '') => {
  // Diretório próprio: o .env lido é o do teste, não o do desenvolvedor.
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'menu-boot-'))
  writeFileSync(path.join(cwd, '.env'), dotenv)
  const child = spawn(TSX, [ENTRY], {
    cwd,
    env: {
      PATH: process.env.PATH,
      MONGO_URL: inject('mongoUri'),
      LOG_LEVEL: 'info',
      ...env,
    },
  })
  cleanups.push(() => {
    child.kill('SIGKILL')
    rmSync(cwd, { recursive: true, force: true })
  })

  let output = ''
  const waiters: (() => void)[] = []
  const onData = (chunk: Buffer) => {
    output += chunk.toString()
    for (const check of waiters) check()
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const exited = new Promise<number | null>(resolve => child.on('exit', resolve))
  void exited.then(() => waiters.forEach(check => check()))

  return {
    child,
    exited,
    output: () => output,
    // Resolve quando a saída casar com o padrão ou o processo terminar.
    seen: (pattern: RegExp) =>
      new Promise<void>(resolve => {
        const check = () => {
          if (pattern.test(output) || child.exitCode !== null) resolve()
        }
        waiters.push(check)
        check()
      }),
  }
}

describe('ponto de entrada do servidor', () => {
  it(
    'sobe, responde ao health e encerra limpo com SIGTERM',
    async () => {
      const port = await freePort()
      const server = boot({ PORT: String(port) })
      await server.seen(/server listening/)

      const health = await fetch(`http://127.0.0.1:${port}/health`)
      expect(health.status).toBe(200)

      server.child.kill('SIGTERM')
      expect(await server.exited).toBe(0)
      expect(server.output()).toContain('"message":"shutting down"')
    },
    TIMEOUT,
  )

  it(
    'lê o .env antes de validar a configuração: valor inválido derruba o boot',
    async () => {
      const port = await freePort()
      const server = boot({ PORT: String(port) }, 'MENU_MAX_ITEMS=abc\n')
      await server.seen(/server listening|MENU_MAX_ITEMS/)

      expect(server.output()).toContain(
        'MENU_MAX_ITEMS must be a positive integer, got "abc"',
      )
      expect(server.output()).not.toContain('server listening')
      expect(await server.exited).not.toBe(0)
    },
    TIMEOUT,
  )

  it(
    'porta ocupada derruba o boot com erro, em vez de registrar que está ouvindo',
    async () => {
      const port = await occupyPort()
      const server = boot({ PORT: String(port) })
      await server.seen(/server listening|failed to start/)

      expect(server.output()).toContain('"message":"failed to start"')
      expect(server.output()).toContain('EADDRINUSE')
      expect(server.output()).not.toContain('server listening')
      expect(await server.exited).toBe(1)
    },
    TIMEOUT,
  )
})
