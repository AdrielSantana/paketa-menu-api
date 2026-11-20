import { ErrorRequestHandler, RequestHandler } from 'express'

import { REQUEST_BODY_LIMIT, RETRY_AFTER_SECONDS } from '../config'
import { isDatabaseUnavailable } from '../db/errors'
import {
  HttpError,
  internalError,
  malformedJson,
  payloadTooLarge,
  routeNotFound,
  serviceUnavailable,
  toProblem,
} from '../errors'
import { logger, serializeError } from '../logger'

interface BodyParserError {
  type?: string
  status?: number
  expose?: boolean
  message?: string
}

// Traduz qualquer erro para um HttpError. O que não é conhecido vira 500.
const toHttpError = (error: unknown): HttpError => {
  if (error instanceof HttpError) return error

  const { type, status, expose, message } = (error ?? {}) as BodyParserError
  if (type === 'entity.parse.failed') return malformedJson()
  if (type === 'entity.too.large') return payloadTooLarge(REQUEST_BODY_LIMIT)
  // Demais erros do body-parser já trazem status e mensagem segura para o
  // cliente.
  if (expose && status && status >= 400 && status < 500) {
    return new HttpError(
      status,
      'REQUEST_REJECTED',
      message ?? 'The request was rejected.',
    )
  }

  // Banco lento ou fora do ar não é erro do serviço: o cliente pode tentar
  // de novo (ADR 0010).
  if (isDatabaseUnavailable(error)) return serviceUnavailable()

  return internalError()
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(routeNotFound(req.method, req.path))
}

// Ponto único de saída de erros. No Express 5, rejeições de handlers async
// chegam aqui sozinhas. Os quatro parâmetros são o que identifica, para o
// Express, um middleware de erro.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const httpError = toHttpError(error)

  const requestId: unknown = res.locals.requestId

  // O erro original só vai para o log; o cliente recebe a versão sem detalhes
  // e o id para informar ao suporte.
  if (httpError.status >= 500) {
    logger.error('request failed', {
      requestId,
      code: httpError.code,
      error: serializeError(error),
    })
  }

  if (httpError.status === 503) res.set('Retry-After', String(RETRY_AFTER_SECONDS))

  res
    .status(httpError.status)
    .type('application/problem+json')
    .json({ ...toProblem(httpError), requestId })
}
