import { STATUS_CODES } from 'node:http'

import { RETRY_AFTER_SECONDS } from './config'

/**
 * Erro com resposta HTTP definida. O middleware central o converte em
 * Problem Details (RFC 9457, ADR 0007).
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly extensions: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    detail: string,
    extensions: Record<string, unknown> = {},
    cause?: unknown,
  ) {
    // A causa não vai para o cliente: fica para o log.
    super(detail, { cause })
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.extensions = extensions
  }
}

interface Problem {
  title: string
  status: number
  code: string
  detail: string
  [extension: string]: unknown
}

const toProblem = (error: HttpError): Problem => ({
  title: STATUS_CODES[error.status] ?? 'Error',
  status: error.status,
  code: error.code,
  detail: error.message,
  ...error.extensions,
})

/**
 * A resposta HTTP de um erro: status, cabeçalhos e corpo. É o único lugar
 * que conhece o contrato (ADRs 0007 e 0010); o middleware de erros e o
 * adaptador de Lambda só a entregam.
 */
export const toProblemResponse = (error: HttpError, requestId: unknown) => {
  const headers: Record<string, string> = {
    'content-type': 'application/problem+json; charset=utf-8',
  }
  if (error.status === 503) headers['retry-after'] = String(RETRY_AFTER_SECONDS)

  return { status: error.status, headers, body: { ...toProblem(error), requestId } }
}

export const validationFailed = (errors: string[]) =>
  new HttpError(400, 'VALIDATION_FAILED', 'The request is invalid.', { errors })

export const malformedJson = () =>
  new HttpError(400, 'MALFORMED_JSON', 'The request body is not valid JSON.')

export const routeNotFound = (method: string, path: string) =>
  new HttpError(404, 'ROUTE_NOT_FOUND', `No route matches ${method} ${path}.`)

export const menuNotFound = (id: string) =>
  new HttpError(404, 'MENU_NOT_FOUND', `No menu item with id "${id}".`)

export const menuNameTaken = (name: string) =>
  new HttpError(409, 'MENU_NAME_TAKEN', `A menu item named "${name}" already exists.`)

export const menuHasSubmenus = (
  id: string,
  submenus: number,
  options: readonly string[],
) =>
  new HttpError(
    409,
    'MENU_HAS_SUBMENUS',
    `Menu item "${id}" has ${submenus} direct submenu(s). Choose what happens to them: ` +
      '"?children=cascade" deletes the item and its whole subtree; ' +
      '"?children=promote" moves its direct submenus to the parent of the deleted item.',
    { submenus, options: [...options] },
  )

export const parentNotFound = (relatedId: string) =>
  new HttpError(
    422,
    'PARENT_NOT_FOUND',
    `relatedId "${relatedId}" does not reference an existing menu item.`,
  )

export const menuLimitReached = (limit: number) =>
  new HttpError(
    409,
    'MENU_LIMIT_REACHED',
    `The menu has reached its limit of ${limit} items. Delete an item before creating a new one.`,
    { limit },
  )

export const menuSubtreeTooLarge = (id: string) =>
  new HttpError(
    409,
    'MENU_SUBTREE_TOO_LARGE',
    `The subtree of menu item "${id}" is too large to delete in one request. ` +
      'Delete its branches first.',
  )

export const payloadTooLarge = (limit: string) =>
  new HttpError(413, 'PAYLOAD_TOO_LARGE', `The request body is larger than ${limit}.`)

export const serviceUnavailable = (cause?: unknown) =>
  new HttpError(
    503,
    'SERVICE_UNAVAILABLE',
    'The service is temporarily unable to handle the request. Try again shortly.',
    {},
    cause,
  )

export const internalError = () =>
  new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
