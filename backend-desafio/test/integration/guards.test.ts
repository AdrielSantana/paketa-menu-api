import mongoose from 'mongoose'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

import app from '../../src/app'
import { DEFAULT_MENU_MAX_ITEMS, RETRY_AFTER_SECONDS, config } from '../../src/config'
import { logger } from '../../src/logger'
import Menu from '../../src/models/menu'
import { enunciadoTree } from '../fixtures/enunciado'
import { connectTestDatabase, disconnectTestDatabase } from '../support/database'
import {
  MENU_URL,
  createMenu,
  expectProblem,
  getMenu,
  getMenuNames,
  seedMenu,
} from '../support/menu'

// Limites e tratativas de falha do ADR 0010.

const post = (body: object) => request(app).post(MENU_URL).send(body)
const del = (id: string, query = '') => request(app).delete(`${MENU_URL}/${id}${query}`)

const serverError = (code: number, errmsg: string) =>
  new mongoose.mongo.MongoServerError({ code, errmsg })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('teto de itens', () => {
  it('recusa criar acima do teto com 409 e volta a aceitar quando abre espaço', async () => {
    // Enche o banco direto, até faltar um item para o teto padrão.
    await Menu.collection.insertMany(
      Array.from({ length: DEFAULT_MENU_MAX_ITEMS - 1 }, (_, index) => ({
        name: `Item ${index}`,
        nameKey: `item ${index}`,
        relatedId: null,
      })),
    )
    const lastId = await createMenu('Último que cabe')

    const refused = await post({ name: 'Um a mais' })
    expectProblem(refused, 409, 'MENU_LIMIT_REACHED')
    expect(refused.body.limit).toBe(DEFAULT_MENU_MAX_ITEMS)
    expectProblem(
      await post({ name: 'Sub-item a mais', relatedId: lastId }),
      409,
      'MENU_LIMIT_REACHED',
    )

    // No teto, o menu inteiro ainda é devolvido.
    expect(await getMenu()).toHaveLength(DEFAULT_MENU_MAX_ITEMS)

    await del(lastId).expect(200)
    await createMenu('Agora cabe')
  })
})

describe('caracteres do nome', () => {
  it.each([
    ['caractere nulo', 'TV\u0000'],
    ['escape de terminal', 'TV\u001b[31m'],
    ['surrogate solto', 'TV\ud800'],
  ])('recusa nome com %s', async (_label, name) => {
    const response = await post({ name })

    expectProblem(response, 400, 'VALIDATION_FAILED')
    expect(response.body.errors).toEqual([
      'name must not contain control characters or malformed Unicode',
    ])
  })

  it('nome só com caracteres invisíveis é recusado como vazio', async () => {
    const response = await post({ name: '\u200b\u2060' })

    expectProblem(response, 400, 'VALIDATION_FAILED')
    expect(response.body.errors).toEqual(['name must not be blank'])
  })

  it('caractere invisível não burla a unicidade do nome', async () => {
    await createMenu('LCD')

    expectProblem(await post({ name: 'LCD\u200b' }), 409, 'MENU_NAME_TAKEN')
  })

  it('aceita emoji e trata tabulação e quebra de linha como espaço', async () => {
    await createMenu('Televisores 📺')
    await createMenu('Smart\tTV\n4K')

    expect(await getMenuNames()).toStrictEqual([
      { name: 'Televisores 📺' },
      { name: 'Smart TV 4K' },
    ])
  })
})

describe('requisição', () => {
  it('corpo acima de 10 KB devolve 413 em Problem Details', async () => {
    const response = await post({ name: 'a'.repeat(20_000) })

    expectProblem(response, 413, 'PAYLOAD_TOO_LARGE')
  })

  it('a resposta não anuncia a tecnologia do servidor', async () => {
    const response = await request(app).get(MENU_URL).expect(200)

    expect(response.headers).not.toHaveProperty('x-powered-by')
  })
})

describe('cascata', () => {
  it('subárvore maior do que o banco percorre devolve 409 explicado e não apaga nada', async () => {
    const ids = await seedMenu(enunciadoTree)
    // Erro real do MongoDB 8.0.26 quando o $graphLookup passa de 100 MB,
    // observado nas medições do ADR 0003. Simulado aqui pelo custo de reproduzir.
    vi.spyOn(Menu, 'aggregate').mockImplementationOnce(() => {
      throw serverError(40099, '$graphLookup reached maximum memory consumption')
    })

    const response = await del(ids.get('Informática')!, '?children=cascade')

    expectProblem(response, 409, 'MENU_SUBTREE_TOO_LARGE')
    expect(await getMenuNames()).toStrictEqual(enunciadoTree)
  })
})

describe('banco lento ou fora do ar', () => {
  it('consultas e agregações da API levam o tempo máximo configurado', async () => {
    const ids = await seedMenu(enunciadoTree)
    const sent: { name: string; maxTimeMS: unknown }[] = []
    const record = (event: mongoose.mongo.CommandStartedEvent) => {
      sent.push({ name: event.commandName, maxTimeMS: event.command.maxTimeMS })
    }
    const client = mongoose.connection.getClient()
    client.on('commandStarted', record)

    try {
      await getMenu()
      await createMenu('Áudio', ids.get('Eletrodomésticos'))
      await del(ids.get('Informática')!, '?children=cascade').expect(200)
    } finally {
      client.off('commandStarted', record)
    }

    const reads = sent.filter(command =>
      ['find', 'aggregate', 'count', 'findAndModify'].includes(command.name),
    )
    expect(new Set(reads.map(command => command.name))).toEqual(
      new Set(['find', 'aggregate', 'count', 'findAndModify']),
    )
    expect(reads.filter(command => command.maxTimeMS !== config.dbTimeoutMs)).toEqual([])
  })

  it('tempo esgotado no banco devolve 503 com Retry-After, sem detalhes', async () => {
    const log = vi.spyOn(logger, 'error')
    // Erro real do servidor quando o maxTimeMS estoura (código 50).
    vi.spyOn(Menu, 'find').mockImplementationOnce(() => {
      throw serverError(50, 'operation exceeded time limit')
    })

    const response = await request(app).get(MENU_URL)

    expectProblem(response, 503, 'SERVICE_UNAVAILABLE')
    expect(response.headers['retry-after']).toBe(String(RETRY_AFTER_SECONDS))
    expect(JSON.stringify(response.body)).not.toContain('time limit')
    expect(log).toHaveBeenCalledWith(
      'request failed',
      expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }),
    )
  })

  it('com a conexão caída, leitura e escrita devolvem 503 e o serviço se recupera', async () => {
    const parentId = await createMenu('Informática')
    // No serviço a espera é DB_TIMEOUT_MS; aqui é curta para o teste não demorar.
    mongoose.set('bufferTimeoutMS', 200)
    await disconnectTestDatabase()

    try {
      const responses = [
        await request(app).get(MENU_URL),
        await post({ name: 'Raiz nova' }),
        await post({ name: 'Computadores', relatedId: parentId }),
        await del(parentId),
      ]
      for (const response of responses) {
        expectProblem(response, 503, 'SERVICE_UNAVAILABLE')
        expect(response.headers['retry-after']).toBe(String(RETRY_AFTER_SECONDS))
      }
    } finally {
      await connectTestDatabase()
    }

    expect(await getMenuNames()).toStrictEqual([{ name: 'Informática' }])
  })
})
