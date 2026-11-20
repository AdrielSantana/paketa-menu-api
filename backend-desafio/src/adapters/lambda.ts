import serverlessExpress from '@codegenie/serverless-express'
import type { Context } from 'aws-lambda'

import app from '../app'
import { serviceUnavailable, toProblemResponse } from '../errors'
import { logger, serializeError } from '../logger'
import { REQUEST_ID_HEADER, isSafeRequestId } from '../middlewares/request-context'

// O que este adaptador precisa dos eventos HTTP do API Gateway (REST e HTTP
// API) e do ALB. A tradução completa é da biblioteca.
interface HttpEvent {
  headers?: Record<string, string | undefined> | null
  // REST API manda os dois mapas; ALB em modo multi-valor manda só este.
  multiValueHeaders?: Record<string, string[] | undefined> | null
}

interface HttpResult {
  statusCode: number
  headers?: Record<string, string>
  multiValueHeaders?: Record<string, string[]>
  body?: string
}

// O runtime Node 24 do Lambda só aceita handler async, sem callback.
type HttpHandler = (event: HttpEvent, context: Context) => Promise<HttpResult>

// Nomes de cabeçalho chegam com a caixa que o cliente mandou.
const lookup = <T>(headers: Record<string, T> | null | undefined, name: string) =>
  Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1]

const readHeader = (event: HttpEvent, name: string): string | undefined =>
  lookup(event.headers, name) ?? lookup(event.multiValueHeaders, name)?.[0]

// Grava nos mapas que o evento já tem. Criar `headers` em um evento que só
// tem `multiValueHeaders` faria a biblioteca responder no formato errado.
const writeHeader = (event: HttpEvent, name: string, value: string) => {
  if (!event.headers && !event.multiValueHeaders) event.headers = {}

  for (const headers of [event.headers, event.multiValueHeaders]) {
    if (!headers) continue
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === name) delete headers[key]
    }
  }
  if (event.headers) event.headers[name] = value
  if (event.multiValueHeaders) event.multiValueHeaders[name] = [value]
}

// Mantém o id do cliente quando o formato é seguro. Senão usa o id da
// invocação: é o mesmo que o Lambda grava no CloudWatch, então as duas
// trilhas de log se encontram.
const resolveRequestId = (event: HttpEvent, awsRequestId: string): string => {
  const received = readHeader(event, REQUEST_ID_HEADER)
  if (isSafeRequestId(received)) return received

  writeHeader(event, REQUEST_ID_HEADER, awsRequestId)
  return awsRequestId
}

// Mesmo contrato do middleware de erros, para quando nem dá para chegar no
// Express. O formato dos cabeçalhos acompanha o do evento.
const unavailable = (event: HttpEvent, requestId: string): HttpResult => {
  const problem = toProblemResponse(serviceUnavailable(), requestId)
  const headers = { ...problem.headers, [REQUEST_ID_HEADER]: requestId }
  const multiValueOnly = !event.headers && Boolean(event.multiValueHeaders)

  return {
    statusCode: problem.status,
    ...(multiValueOnly
      ? {
          multiValueHeaders: Object.fromEntries(
            Object.entries(headers).map(([key, value]) => [key, [value]]),
          ),
        }
      : { headers }),
    body: JSON.stringify(problem.body),
  }
}

/**
 * Handler de Lambda sobre o mesmo app Express do servidor (ADR 0012).
 * `connect` é chamado uma vez por instância; se falhar, a próxima invocação
 * tenta de novo.
 */
export const createHandler = (connect: () => Promise<void>): HttpHandler => {
  // A biblioteca tipa o retorno com a assinatura antiga, de três parâmetros,
  // mas o handler dela é async e recebe só evento e contexto.
  const proxy = serverlessExpress({ app }) as unknown as HttpHandler
  let connection: Promise<void> | undefined

  return async (event, context) => {
    const requestId = resolveRequestId(event, context.awsRequestId)

    try {
      connection ??= connect()
      await connection
    } catch (error) {
      connection = undefined
      logger.error('database connection failed', {
        requestId,
        error: serializeError(error),
      })
      return unavailable(event, requestId)
    }

    return proxy(event, context)
  }
}
