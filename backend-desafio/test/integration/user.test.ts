import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../../src/app'

const userPayload = (name: string) => ({
  name,
  email: `${name.toLowerCase()}@example.com`,
  password: 'secret123',
})

const createUser = async (name: string): Promise<string> => {
  const response = await request(app).post('/user').send(userPayload(name)).expect(201)
  return response.body.id
}

const listUserNames = async (): Promise<string[]> => {
  const response = await request(app).get('/user').expect(200)
  return response.body.map((user: { name: string }) => user.name)
}

describe('CRUD de user (exemplo do boilerplate)', () => {
  it('cria um usuário e o devolve na consulta por id', async () => {
    const id = await createUser('Alice')

    const response = await request(app).get(`/user/${id}`).expect(200)

    expect(response.body).toMatchObject({ _id: id, name: 'Alice' })
  })

  it('rejeita payload inválido com 400 e a lista de erros', async () => {
    const response = await request(app).post('/user').send({ name: 'x' }).expect(400)

    expect(response.body.messages).toEqual(
      expect.arrayContaining(['email is a required field']),
    )
  })

  it('rejeita com 400 um id que não é ObjectId', async () => {
    await request(app).get('/user/123').expect(400)
  })
})
