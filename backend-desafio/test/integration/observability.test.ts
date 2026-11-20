import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

import app from '../../src/app'
import { config } from '../../src/config'
import Menu from '../../src/models/menu'
import { MENU_URL, createMenu, expectProblem } from '../support/menu'

// Logs, request id e health check do ADR 0011.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Liga o log (os testes rodam em silent) e devolve as linhas gravadas, já lidas como JSON.
const captureLogs = () => {
  config.logLevel = 'info'
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  return () =>
    write.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
}

afterEach(() => {
  config.logLevel = 'silent'
  vi.restoreAllMocks()
})

describe('GET /health', () => {
  it('devolve 200 quando o banco responde', async () => {
    const response = await request(app).get('/health').expect(200)

    expect(response.body).toStrictEqual({ status: 'ok' })
  })

  it('devolve 503 quando o banco não responde ao ping', async () => {
    vi.spyOn(Menu.db.db!, 'command').mockRejectedValueOnce(new Error('sem resposta'))

    expectProblem(await request(app).get('/health'), 503, 'SERVICE_UNAVAILABLE')
  })
})

describe('request id', () => {
  it('gera um id por requisição e devolve no cabeçalho', async () => {
    const first = await request(app).get(MENU_URL)
    const second = await request(app).get(MENU_URL)

    expect(first.headers['x-request-id']).toMatch(UUID)
    expect(second.headers['x-request-id']).not.toBe(first.headers['x-request-id'])
  })

  it('reaproveita o X-Request-Id recebido quando o formato é seguro', async () => {
    const response = await request(app)
      .get(MENU_URL)
      .set('X-Request-Id', 'pedido-2026.11_19')

    expect(response.headers['x-request-id']).toBe('pedido-2026.11_19')
  })

  it.each([
    ['curto demais', 'abc'],
    ['longo demais', 'a'.repeat(65)],
    ['com caracteres fora do permitido', 'id com espaço <script>'],
  ])('troca por um novo o X-Request-Id %s', async (_label, received) => {
    const response = await request(app).get(MENU_URL).set('X-Request-Id', received)

    expect(response.headers['x-request-id']).toMatch(UUID)
  })

  it('erros trazem o requestId no corpo, igual ao do cabeçalho', async () => {
    const responses = [
      await request(app).get('/nao-existe'),
      await request(app).post(MENU_URL).send({}),
      await request(app).post(MENU_URL).type('json').send('{ "name": '),
    ]

    for (const response of responses) {
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.body.requestId).toEqual(expect.any(String))
      expect(response.body.requestId).toBe(response.headers['x-request-id'])
    }
  })
})

describe('logs', () => {
  it('cada requisição gera uma linha JSON com id, método, caminho, status e duração', async () => {
    const logs = captureLogs()

    const response = await request(app).get(`${MENU_URL}?debug=1`)

    expect(logs()).toEqual([
      {
        level: 'info',
        time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        message: 'request completed',
        requestId: response.headers['x-request-id'],
        method: 'GET',
        path: MENU_URL,
        status: 200,
        durationMs: expect.any(Number),
      },
    ])
  })

  it('erro do cliente é registrado como warn, sem o corpo da requisição', async () => {
    const logs = captureLogs()

    await request(app)
      .post(MENU_URL)
      .send({ name: '', segredo: 'não deve ir para o log' })

    const lines = logs()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ level: 'warn', status: 400, method: 'POST' })
    expect(JSON.stringify(lines)).not.toContain('segredo')
  })

  it('erro 500 registra o erro original com stack e mascara credenciais', async () => {
    const logs = captureLogs()
    vi.spyOn(Menu, 'find').mockImplementationOnce(() => {
      throw new Error('falha ao conectar em mongodb://usuario:senha@host:27017/menu')
    })

    const response = await request(app).get(MENU_URL)

    expectProblem(response, 500, 'INTERNAL_ERROR')
    const [failure, access] = logs()
    expect(failure).toMatchObject({
      level: 'error',
      message: 'request failed',
      requestId: response.headers['x-request-id'],
      code: 'INTERNAL_ERROR',
      error: {
        name: 'Error',
        message: 'falha ao conectar em mongodb://***:***@host:27017/menu',
      },
    })
    expect((failure.error as { stack: string }).stack).toContain('observability.test.ts')
    expect(access).toMatchObject({ level: 'error', status: 500 })
    expect(JSON.stringify([failure, access])).not.toContain('senha')
  })

  it('o health check só aparece no log em nível debug', async () => {
    const logs = captureLogs()

    await request(app).get('/health').expect(200)
    expect(logs()).toEqual([])

    config.logLevel = 'debug'
    await request(app).get('/health').expect(200)
    expect(logs()).toMatchObject([{ level: 'debug', path: '/health', status: 200 }])
  })

  it('em silent nada é gravado', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await createMenu('Informática')
    await request(app).get('/nao-existe')

    expect(write).not.toHaveBeenCalled()
  })
})
