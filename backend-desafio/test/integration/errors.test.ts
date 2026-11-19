import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

import app from '../../src/app'
import { expectProblem } from '../support/menu'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('erros fora do caminho feliz (ADR 0007)', () => {
  it('rota desconhecida devolve 404 em Problem Details', async () => {
    expectProblem(await request(app).get('/api/v1/nao-existe'), 404, 'ROUTE_NOT_FOUND')
  })

  // No boilerplate original este request derrubava o processo: a rejeição do
  // handler async não era capturada (Express 4) e o Node encerrava.
  it('erro inesperado devolve 500 sem vazar detalhes internos', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await request(app).post('/user').send({
      _id: 'abc',
      name: 'Dora',
      email: 'dora@example.com',
      password: 'secret123',
    })

    expectProblem(response, 500, 'INTERNAL_ERROR')
    expect(JSON.stringify(response.body)).not.toMatch(/ObjectId|node_modules|at /)

    // O servidor continua atendendo.
    await request(app).get('/user').expect(200)
  })
})
