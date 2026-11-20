import { randomUUID } from 'node:crypto'

import { RequestHandler } from 'express'

import { logger } from '../logger'

// Formato aceito para um id vindo de fora: sem espaços, quebras de linha ou
// tamanho que polua o log e a resposta.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

export const REQUEST_ID_HEADER = 'x-request-id'

export const isSafeRequestId = (value: string | undefined): value is string =>
  value !== undefined && SAFE_REQUEST_ID.test(value)

export const HEALTH_PATH = '/health'

// O nível acompanha o status. O health check bem-sucedido fica em debug,
// para não poluir o log.
const levelFor = (status: number, path: string) => {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  return path === HEALTH_PATH ? 'debug' : 'info'
}

// Dá um id a cada requisição e registra uma linha quando ela termina (ADR 0011).
export const requestContext: RequestHandler = (req, res, next) => {
  const received = req.get(REQUEST_ID_HEADER)
  const requestId = isSafeRequestId(received) ? received : randomUUID()
  res.locals.requestId = requestId
  res.set(REQUEST_ID_HEADER, requestId)

  const startedAt = performance.now()
  res.on('finish', () => {
    // Sem query string: parâmetros podem carregar dados que não são do log.
    const path = req.originalUrl.split('?')[0]
    const level = levelFor(res.statusCode, path)

    logger[level]('request completed', {
      requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    })
  })

  next()
}
