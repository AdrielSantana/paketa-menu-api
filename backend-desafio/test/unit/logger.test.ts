import { describe, expect, it } from 'vitest'

import { redactSecrets, serializeError } from '../../src/logger'

describe('redactSecrets', () => {
  it.each([
    ['mongodb://usuario:senha@host:27017/menu', 'mongodb://***:***@host:27017/menu'],
    [
      'falha em mongodb+srv://app:s3nh%40@cluster.docdb.amazonaws.com/?tls=true agora',
      'falha em mongodb+srv://***:***@cluster.docdb.amazonaws.com/?tls=true agora',
    ],
    ['https://token:x-oauth@api.exemplo.com', 'https://***:***@api.exemplo.com'],
  ])('mascara usuário e senha em %j', (text, expected) => {
    expect(redactSecrets(text)).toBe(expected)
  })

  it.each([
    'mongodb://localhost:27017/menu?replicaSet=rs0',
    'No menu item with id "507f1f77bcf86cd799439011".',
    'contato: adriel@example.com',
  ])('não mexe em %j', text => {
    expect(redactSecrets(text)).toBe(text)
  })
})

describe('serializeError', () => {
  it('leva nome, mensagem, código e stack', () => {
    const error = Object.assign(new Error('operation exceeded time limit'), { code: 50 })

    expect(serializeError(error)).toMatchObject({
      name: 'Error',
      message: 'operation exceeded time limit',
      code: 50,
      stack: expect.stringContaining('logger.test.ts'),
    })
  })

  it('aceita o que não é Error', () => {
    expect(serializeError('texto solto')).toStrictEqual({ message: 'texto solto' })
  })
})
