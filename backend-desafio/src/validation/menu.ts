import { NextFunction, Request, Response } from 'express'
import * as yup from 'yup'

import {
  MENU_NAME_MAX_LENGTH,
  hasForbiddenCharacters,
  normalizeMenuName,
} from '../domain/menu-name'
import { validationFailed } from '../errors'

const OBJECT_ID = /^[0-9a-fA-F]{24}$/
const OBJECT_ID_MESSAGE = '${path} must be a 24-character hexadecimal id'

export const CHILDREN_STRATEGIES = ['cascade', 'promote'] as const
export type ChildrenStrategy = (typeof CHILDREN_STRATEGIES)[number]

export interface CreateMenuBody {
  name: string
  relatedId?: string | null
}

// O tamanho é medido no nome já normalizado, que é o que vai para o banco.
const normalizedLength = (value: string) => normalizeMenuName(value).name.length

const createBody = yup
  .object({
    name: yup
      .string()
      .required()
      .test(
        'not-blank',
        '${path} must not be blank',
        // Pela chave: um nome só com caracteres invisíveis também é vazio.
        value => normalizeMenuName(value).nameKey.length > 0,
      )
      .test(
        'max-length',
        `\${path} must be at most ${MENU_NAME_MAX_LENGTH} characters`,
        value => normalizedLength(value) <= MENU_NAME_MAX_LENGTH,
      )
      .test(
        'allowed-characters',
        '${path} must not contain control characters or malformed Unicode',
        value => !hasForbiddenCharacters(normalizeMenuName(value).name),
      ),
    relatedId: yup.string().nullable().matches(OBJECT_ID, OBJECT_ID_MESSAGE),
  })
  .noUnknown()
  .required()

const deleteRequest = yup.object({
  id: yup.string().required().matches(OBJECT_ID, OBJECT_ID_MESSAGE),
  children: yup.string().oneOf(CHILDREN_STRATEGIES),
})

// `strict` desliga a coerção do yup: 123 não vira "123" e campo desconhecido
// é erro em vez de ser descartado.
const validate = async (schema: yup.AnySchema, value: unknown, next: NextFunction) => {
  try {
    await schema.validate(value, { strict: true, abortEarly: false })
    return next()
  } catch (error) {
    if (error instanceof yup.ValidationError) return next(validationFailed(error.errors))
    return next(error)
  }
}

export default {
  create: (req: Request, _res: Response, next: NextFunction) =>
    validate(createBody, req.body, next),
  delete: (req: Request, _res: Response, next: NextFunction) =>
    validate(deleteRequest, { id: req.params.id, children: req.query.children }, next),
}
