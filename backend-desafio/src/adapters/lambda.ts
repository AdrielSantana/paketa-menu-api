import serverlessExpress from '@codegenie/serverless-express'
import type { Handler } from 'aws-lambda'

import app from '../app'
import { RETRY_AFTER_SECONDS } from '../config'
import { serviceUnavailable, toProblem } from '../errors'
import { logger, serializeError } from '../logger'

// O que este adaptador precisa dos eventos HTTP do API Gateway (REST e HTTP
// API) e do ALB. A tradução completa é da biblioteca.
interface HttpEvent {
  headers?: Record<string, string | undefined> | null
  multiValueHeaders?: Record<string, string[] | undefined> | null
}

interface HttpResult {
  statusCode: number
  headers?: Record<string, string>
  // O REST API (payload 1.0) devolve os cabeçalhos aqui.
  multiValueHeaders?: Record<string, string[]>
  body?: string
}

const REQUEST_ID_HEADER = 'x-request-id'

const hasHeader = (headers: Record<string, unknown>, name: string) =>
  Object.keys(headers).some(key => key.toLowerCase() === name)

// Sem id vindo do cliente, a requisição usa o id da invocação: é o mesmo que
// o Lambda grava no CloudWatch, então as duas trilhas de log se encontram.
const propagateRequestId = (event: HttpEvent, awsRequestId: string) => {
  event.headers ??= {}
  if (hasHeader(event.headers, REQUEST_ID_HEADER)) return

  event.headers[REQUEST_ID_HEADER] = awsRequestId
  if (event.multiValueHeaders) event.multiValueHeaders[REQUEST_ID_HEADER] = [awsRequestId]
}

// Mesmo contrato do middleware de erros, para quando nem dá para chegar no Express.
const unavailable = (requestId: string): HttpResult => ({
  statusCode: 503,
  headers: {
    'content-type': 'application/problem+json; charset=utf-8',
    'retry-after': String(RETRY_AFTER_SECONDS),
    [REQUEST_ID_HEADER]: requestId,
  },
  body: JSON.stringify({ ...toProblem(serviceUnavailable()), requestId }),
})

/**
 * Handler de Lambda sobre o mesmo app Express do servidor (ADR 0012).
 * `connect` é chamado uma vez por instância; se falhar, a próxima invocação
 * tenta de novo.
 */
export const createHandler = (
  connect: () => Promise<void>,
): Handler<HttpEvent, HttpResult> => {
  const proxy = serverlessExpress<HttpEvent, HttpResult>({ app })
  let connection: Promise<void> | undefined

  return async (event, context, callback) => {
    // A conexão com o banco fica aberta entre invocações; sem isto o Lambda
    // esperaria o event loop esvaziar e a invocação terminaria por timeout.
    context.callbackWaitsForEmptyEventLoop = false
    propagateRequestId(event, context.awsRequestId)

    try {
      connection ??= connect()
      await connection
    } catch (error) {
      connection = undefined
      logger.error('database connection failed', {
        requestId: context.awsRequestId,
        error: serializeError(error),
      })
      return unavailable(context.awsRequestId)
    }

    return (await proxy(event, context, callback)) as HttpResult
  }
}
