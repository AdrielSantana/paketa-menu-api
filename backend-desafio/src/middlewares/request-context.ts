import { randomUUID } from 'node:crypto'

import { RequestHandler } from 'express'

import { logger } from '../logger'

// Formato aceito para um id vindo de fora: sem espaços, quebras de linha ou
// tamanho que polua o log e a resposta.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

const HEALTH_PATH = '/health'

// Dá um id a cada requisição e registra uma linha quando ela termina (ADR 0011).
export const requestContext: RequestHandler = (req, res, next) => {
  const received = req.get('x-request-id')
  const requestId = received && SAFE_REQUEST_ID.test(received) ? received : randomUUID()
  res.locals.requestId = requestId
  res.set('X-Request-Id', requestId)

  const startedAt = performance.now()
  res.on('finish', () => {
    // Sem query string: parâmetros podem carregar dados que não são do log.
    const path = req.originalUrl.split('?')[0]
    const failed = res.statusCode >= 400
    const level =
      res.statusCode >= 500
        ? 'error'
        : failed
          ? 'warn'
          : path === HEALTH_PATH
            ? 'debug'
            : 'info'

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
