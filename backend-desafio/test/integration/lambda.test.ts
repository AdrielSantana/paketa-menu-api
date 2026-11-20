import type { Context } from 'aws-lambda'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createHandler } from '../../src/adapters/lambda'
import { RETRY_AFTER_SECONDS } from '../../src/config'
import { enunciadoTree } from '../fixtures/enunciado'
import { type MenuNode, getMenuNames, seedMenu, toNames } from '../support/menu'

// Adaptador de Lambda (ADR 0012): o handler é invocado com eventos no formato
// do API Gateway, sem servidor HTTP, contra o mesmo banco dos outros testes.

const AWS_REQUEST_ID = 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef'
const MENU_PATH = '/api/v1/menu'

const fakeContext = () =>
  ({
    awsRequestId: AWS_REQUEST_ID,
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'menu-api',
    getRemainingTimeInMillis: () => 15_000,
  }) as unknown as Context

interface RequestOptions {
  body?: unknown
  headers?: Record<string, string>
  query?: Record<string, string>
}

// Evento do API Gateway HTTP API (payload 2.0).
const httpApiEvent = (method: string, path: string, options: RequestOptions = {}) => ({
  version: '2.0',
  routeKey: '$default',
  rawPath: path,
  rawQueryString: new URLSearchParams(options.query).toString(),
  headers: { 'content-type': 'application/json', ...options.headers },
  queryStringParameters: options.query,
  requestContext: {
    accountId: '123456789012',
    apiId: 'api-id',
    domainName: 'api.example.com',
    domainPrefix: 'api',
    http: {
      method,
      path,
      protocol: 'HTTP/1.1',
      sourceIp: '203.0.113.10',
      userAgent: 'vitest',
    },
    requestId: 'JKJaXmPLvHcESHA=',
    routeKey: '$default',
    stage: '$default',
    time: '19/Nov/2026:21:00:00 +0000',
    timeEpoch: 1795122000000,
  },
  body: options.body === undefined ? undefined : JSON.stringify(options.body),
  isBase64Encoded: false,
})

// Evento do API Gateway REST API (payload 1.0).
const restApiEvent = (method: string, path: string, options: RequestOptions = {}) => {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const multiValue = (values: Record<string, string>) =>
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [value]]))

  return {
    resource: '/{proxy+}',
    path,
    httpMethod: method,
    headers,
    multiValueHeaders: multiValue(headers),
    queryStringParameters: options.query ?? null,
    multiValueQueryStringParameters: options.query ? multiValue(options.query) : null,
    pathParameters: { proxy: path.slice(1) },
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      httpMethod: method,
      identity: { sourceIp: '203.0.113.10', userAgent: 'vitest' },
      path: `/prod${path}`,
      protocol: 'HTTP/1.1',
      requestId: 'a3de505e-f16b-42f4-b3e6-bcd2e70bec04',
      requestTimeEpoch: 1795122000000,
      resourceId: 'abc123',
      resourcePath: '/{proxy+}',
      stage: 'prod',
    },
    body: options.body === undefined ? null : JSON.stringify(options.body),
    isBase64Encoded: false,
  }
}

// Evento de ALB com "multi value headers" ligado: só existe multiValueHeaders.
const albEvent = (method: string, path: string, options: RequestOptions = {}) => ({
  requestContext: {
    elb: {
      targetGroupArn:
        'arn:aws:elasticloadbalancing:sa-east-1:123456789012:targetgroup/menu/6d0ecf831eec9f09',
    },
  },
  httpMethod: method,
  path,
  multiValueQueryStringParameters: Object.fromEntries(
    Object.entries(options.query ?? {}).map(([key, value]) => [key, [value]]),
  ),
  multiValueHeaders: Object.fromEntries(
    Object.entries({ 'content-type': 'application/json', ...options.headers }).map(
      ([key, value]) => [key, [value]],
    ),
  ),
  body: options.body === undefined ? '' : JSON.stringify(options.body),
  isBase64Encoded: false,
})

// A conexão já foi aberta pelo setup dos testes.
const alreadyConnected = () => Promise.resolve()

type Event =
  | ReturnType<typeof httpApiEvent>
  | ReturnType<typeof restApiEvent>
  | ReturnType<typeof albEvent>

const invoke = async (handler: ReturnType<typeof createHandler>, event: Event) => {
  const result = await handler(event, fakeContext())
  // HTTP API devolve `headers`; REST API devolve `multiValueHeaders`.
  const headers = Object.fromEntries(
    [
      ...Object.entries(result.headers ?? {}),
      ...Object.entries(result.multiValueHeaders ?? {}).map(([key, [value]]) => [
        key,
        value,
      ]),
    ].map(([key, value]) => [key.toLowerCase(), value]),
  )
  return {
    status: result.statusCode,
    headers,
    body: result.body ? (JSON.parse(result.body) as Record<string, unknown>) : undefined,
    raw: result,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handler de Lambda', () => {
  it('atende o fluxo do enunciado com eventos do HTTP API', async () => {
    const handler = createHandler(alreadyConnected)

    const created = await invoke(
      handler,
      httpApiEvent('POST', MENU_PATH, { body: { name: 'Informática' } }),
    )
    expect(created.status).toBe(201)
    const id = created.body!.id as string

    const child = await invoke(
      handler,
      httpApiEvent('POST', MENU_PATH, { body: { name: 'Computadores', relatedId: id } }),
    )
    expect(child.status).toBe(201)

    const tree = await invoke(handler, httpApiEvent('GET', MENU_PATH))
    expect(tree.status).toBe(200)
    expect(tree.headers['content-type']).toMatch(/^application\/json/)
    expect(toNames(tree.body as unknown as MenuNode[])).toStrictEqual([
      { name: 'Informática', submenus: [{ name: 'Computadores' }] },
    ])

    const blocked = await invoke(handler, httpApiEvent('DELETE', `${MENU_PATH}/${id}`))
    expect(blocked.status).toBe(409)
    expect(blocked.headers['content-type']).toMatch(/^application\/problem\+json/)
    expect(blocked.body).toMatchObject({ code: 'MENU_HAS_SUBMENUS' })

    const deleted = await invoke(
      handler,
      httpApiEvent('DELETE', `${MENU_PATH}/${id}`, { query: { children: 'cascade' } }),
    )
    expect(deleted.status).toBe(200)
    expect(deleted.body).toStrictEqual({ id, deletedCount: 2 })
    expect(await getMenuNames()).toStrictEqual([])
  })

  it('atende eventos do REST API, com query string', async () => {
    const ids = await seedMenu(enunciadoTree)
    const handler = createHandler(alreadyConnected)

    const tree = await invoke(handler, restApiEvent('GET', MENU_PATH))
    expect(tree.status).toBe(200)
    expect(toNames(tree.body as unknown as MenuNode[])).toStrictEqual(enunciadoTree)

    const promoted = await invoke(
      handler,
      restApiEvent('DELETE', `${MENU_PATH}/${ids.get('Informática')}`, {
        query: { children: 'promote' },
      }),
    )
    expect(promoted.status).toBe(200)
    expect((await getMenuNames()).map(root => root.name)).toStrictEqual([
      'Eletrodomésticos',
      'Computadores',
    ])
  })

  it('erro de validação e rota desconhecida saem em Problem Details', async () => {
    const handler = createHandler(alreadyConnected)

    const invalid = await invoke(handler, httpApiEvent('POST', MENU_PATH, { body: {} }))
    expect(invalid.status).toBe(400)
    expect(invalid.body).toMatchObject({ code: 'VALIDATION_FAILED' })

    const unknown = await invoke(handler, httpApiEvent('GET', '/nao-existe'))
    expect(unknown.status).toBe(404)
    expect(unknown.body).toMatchObject({ code: 'ROUTE_NOT_FOUND' })
  })

  it.each([
    ['HTTP API', httpApiEvent],
    ['REST API', restApiEvent],
  ])(
    'no %s, o request id é o da invocação quando o cliente não manda um',
    async (_, event) => {
      const handler = createHandler(alreadyConnected)

      const generated = await invoke(handler, event('GET', '/nao-existe'))
      expect(generated.headers['x-request-id']).toBe(AWS_REQUEST_ID)
      expect(generated.body!.requestId).toBe(AWS_REQUEST_ID)

      const received = await invoke(
        handler,
        event('GET', MENU_PATH, { headers: { 'X-Request-Id': 'pedido-do-cliente' } }),
      )
      expect(received.headers['x-request-id']).toBe('pedido-do-cliente')
    },
  )

  it('conecta no banco uma vez por instância, não a cada invocação', async () => {
    const connect = vi.fn(alreadyConnected)
    const handler = createHandler(connect)

    for (let invocation = 0; invocation < 3; invocation++) {
      expect((await invoke(handler, httpApiEvent('GET', MENU_PATH))).status).toBe(200)
    }

    expect(connect).toHaveBeenCalledOnce()
  })

  it('se a conexão falha, responde 503 e tenta de novo na invocação seguinte', async () => {
    const connect = vi
      .fn(alreadyConnected)
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const handler = createHandler(connect)

    const failed = await invoke(handler, httpApiEvent('GET', MENU_PATH))
    expect(failed.status).toBe(503)
    expect(failed.headers['content-type']).toMatch(/^application\/problem\+json/)
    expect(failed.headers['retry-after']).toBe(String(RETRY_AFTER_SECONDS))
    expect(failed.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      requestId: AWS_REQUEST_ID,
    })

    const recovered = await invoke(handler, httpApiEvent('GET', MENU_PATH))
    expect(recovered.status).toBe(200)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  // O runtime Node 24 do Lambda não aceita mais handler com callback
  // (documentação da AWS, conferida em 2026-11-19).
  it('o handler é async com dois parâmetros, sem callback', () => {
    expect(createHandler(alreadyConnected).length).toBeLessThanOrEqual(2)
  })

  it('atende eventos de ALB com cabeçalhos multi-valor, sem trocar o formato da resposta', async () => {
    const handler = createHandler(alreadyConnected)

    const response = await invoke(
      handler,
      albEvent('GET', MENU_PATH, { headers: { 'X-Request-Id': 'pedido-via-alb' } }),
    )

    expect(response.status).toBe(200)
    expect(response.headers['x-request-id']).toBe('pedido-via-alb')
    // Nesse modo o ALB só lê multiValueHeaders.
    expect(response.raw.headers).toBeUndefined()
    expect(response.raw.multiValueHeaders).toMatchObject({
      'content-type': [expect.stringMatching(/^application\/json/)],
    })
  })

  it('X-Request-Id em formato inseguro é trocado pelo id da invocação', async () => {
    const response = await invoke(
      createHandler(alreadyConnected),
      httpApiEvent('GET', '/nao-existe', {
        headers: { 'x-request-id': 'id com espaço' },
      }),
    )

    expect(response.headers['x-request-id']).toBe(AWS_REQUEST_ID)
    expect(response.body!.requestId).toBe(AWS_REQUEST_ID)
  })

  it.each([
    ['HTTP API', httpApiEvent],
    ['ALB multi-valor', albEvent],
  ])('no %s, o 503 de conexão mantém o request id do cliente', async (_, event) => {
    const connect = vi
      .fn(alreadyConnected)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const failed = await invoke(
      createHandler(connect),
      event('GET', MENU_PATH, { headers: { 'x-request-id': 'pedido-do-cliente' } }),
    )

    expect(failed.status).toBe(503)
    expect(failed.headers['x-request-id']).toBe('pedido-do-cliente')
    expect(failed.headers['retry-after']).toBe(String(RETRY_AFTER_SECONDS))
    expect(failed.body!.requestId).toBe('pedido-do-cliente')
  })
})
