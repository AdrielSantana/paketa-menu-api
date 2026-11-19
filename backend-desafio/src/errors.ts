import { STATUS_CODES } from 'node:http'

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
  ) {
    super(detail)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.extensions = extensions
  }
}

export interface Problem {
  title: string
  status: number
  code: string
  detail: string
  [extension: string]: unknown
}

export const toProblem = (error: HttpError): Problem => ({
  title: STATUS_CODES[error.status] ?? 'Error',
  status: error.status,
  code: error.code,
  detail: error.message,
  ...error.extensions,
})

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

export const menuHasSubmenus = (id: string, submenus: number) =>
  new HttpError(
    409,
    'MENU_HAS_SUBMENUS',
    `Menu item "${id}" has ${submenus} direct submenu(s). Choose what happens to them: ` +
      '"?children=cascade" deletes the item and its whole subtree; ' +
      '"?children=promote" moves its direct submenus to the parent of the deleted item.',
    { submenus, options: ['cascade', 'promote'] },
  )

export const parentNotFound = (relatedId: string) =>
  new HttpError(
    422,
    'PARENT_NOT_FOUND',
    `relatedId "${relatedId}" does not reference an existing menu item.`,
  )

export const internalError = () =>
  new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
