import { ErrorRequestHandler, RequestHandler } from 'express'

import {
  HttpError,
  internalError,
  malformedJson,
  routeNotFound,
  toProblem,
} from '../errors'

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
  // Demais erros do body-parser (ex.: 413 payload grande) já trazem status e
  // mensagem segura para o cliente.
  if (expose && status && status >= 400 && status < 500) {
    return new HttpError(
      status,
      'REQUEST_REJECTED',
      message ?? 'The request was rejected.',
    )
  }

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

  // O erro original só vai para o log; o cliente recebe a versão sem detalhes.
  if (httpError.status >= 500) console.error(error)

  res.status(httpError.status).type('application/problem+json').json(toProblem(httpError))
}
