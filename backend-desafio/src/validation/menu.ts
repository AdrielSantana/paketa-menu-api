import { NextFunction, Request, Response } from 'express'
import * as yup from 'yup'

import {
  MENU_NAME_MAX_LENGTH,
  hasForbiddenCharacters,
  isBlankMenuName,
  isMenuNameTooLong,
} from '../domain/menu-name'
import { validationFailed } from '../errors'

const OBJECT_ID = /^[0-9a-fA-F]{24}$/
const OBJECT_ID_MESSAGE = '${path} must be a 24-character hexadecimal id'

export const CHILDREN_STRATEGIES = ['cascade', 'promote'] as const
export type ChildrenStrategy = (typeof CHILDREN_STRATEGIES)[number]

const createBody = yup
  .object({
    name: yup
      .string()
      .required()
      // As regras são do domínio; aqui ficam só o encaixe no yup e a mensagem.
      .test('not-blank', '${path} must not be blank', value => !isBlankMenuName(value))
      .test(
        'max-length',
        `\${path} must be at most ${MENU_NAME_MAX_LENGTH} characters`,
        value => !isMenuNameTooLong(value),
      )
      .test(
        'allowed-characters',
        '${path} must not contain control characters or malformed Unicode',
        value => !hasForbiddenCharacters(value),
      ),
    relatedId: yup.string().nullable().matches(OBJECT_ID, OBJECT_ID_MESSAGE),
  })
  .noUnknown()
  .required()

export type CreateMenuBody = yup.InferType<typeof createBody>

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
