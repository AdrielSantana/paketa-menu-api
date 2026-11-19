import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

import app from '../../src/app'
import Menu from '../../src/models/menu'
import { enunciadoTree } from '../fixtures/enunciado'
import {
  MENU_URL,
  type MenuNode,
  createMenu,
  expectProblem,
  getMenuNames,
  seedMenu,
} from '../support/menu'

// Testes de caixa-branca: conferem no banco o que a API não mostra.

const post = (name: string, relatedId: string) =>
  request(app).post(MENU_URL).send({ name, relatedId })
const del = (id: string, query = '') => request(app).delete(`${MENU_URL}/${id}${query}`)

// Itens cujo pai não existe mais: invisíveis no menu e ocupando um nome.
const findOrphanNames = async (): Promise<string[]> => {
  const all = await Menu.find().lean()
  const ids = new Set(all.map(menu => menu._id.toString()))
  return all
    .filter(menu => menu.relatedId && !ids.has(menu.relatedId.toString()))
    .map(menu => menu.name)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('índices', () => {
  it('nameKey tem índice único e relatedId tem índice', async () => {
    const indexes = await Menu.collection.indexes()

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { nameKey: 1 }, unique: true }),
        expect.objectContaining({ key: { relatedId: 1 } }),
      ]),
    )
  })

  it('grava a chave de unicidade normalizada e relatedId null na raiz', async () => {
    await request(app).post(MENU_URL).send({ name: '  Smart   TV ' }).expect(201)

    const [menu] = await Menu.find().lean()

    expect(menu).toMatchObject({ name: 'Smart TV', nameKey: 'smart tv', relatedId: null })
  })
})

describe('concorrência (ADR 0005)', () => {
  it('criar sub-itens enquanto o pai é apagado em cascata nunca deixa órfão', async () => {
    const ROUNDS = 25

    for (let round = 0; round < ROUNDS; round++) {
      const parentId = await createMenu(`Pai ${round}`)
      const childId = await createMenu(`Filho ${round}`, parentId)

      const [deletion, ...creations] = await Promise.all([
        del(parentId, '?children=cascade'),
        post(`Novo filho A ${round}`, parentId),
        post(`Novo filho B ${round}`, parentId),
        post(`Novo neto ${round}`, childId),
      ])

      expect(deletion.status).toBe(200)
      // Cada criação ou entrou antes da exclusão (e foi apagada junto) ou
      // chegou depois e foi recusada. Nunca um erro inesperado.
      for (const creation of creations) expect([201, 422]).toContain(creation.status)
    }

    expect(await findOrphanNames()).toEqual([])
    expect(await Menu.countDocuments()).toBe(0)
  })

  it('apagar uma folha e criar um filho nela ao mesmo tempo: só um dos dois vence', async () => {
    const ROUNDS = 25

    for (let round = 0; round < ROUNDS; round++) {
      const leafId = await createMenu(`Folha ${round}`)

      const [deletion, creation] = await Promise.all([
        del(leafId),
        post(`Filho da folha ${round}`, leafId),
      ])

      // Ou a folha foi apagada e o filho recusado, ou o filho entrou e a
      // exclusão passou a exigir uma escolha.
      expect([
        [200, 422],
        [409, 201],
      ]).toContainEqual([deletion.status, creation.status])
    }

    expect(await findOrphanNames()).toEqual([])
  })

  it('criar um sub-item atualiza o updatedAt do pai (é a trava da transação)', async () => {
    const parentId = await createMenu('Eletrodomésticos')
    const before = (await Menu.findById(parentId).lean())!.updatedAt

    await createMenu('Televisores', parentId)

    const after = (await Menu.findById(parentId).lean())!.updatedAt
    expect(after.getTime()).toBeGreaterThan(before.getTime())
  })
})

describe('atomicidade', () => {
  it('se a exclusão falha no meio da promoção, nada muda', async () => {
    const ids = await seedMenu(enunciadoTree)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Menu, 'deleteMany').mockRejectedValueOnce(new Error('falha simulada'))

    const response = await del(ids.get('Televisores')!, '?children=promote')

    expectProblem(response, 500, 'INTERNAL_ERROR')
    // O updateMany dos filhos já tinha rodado dentro da transação; o rollback
    // devolve LCD e Plasma para baixo de Televisores.
    expect(await getMenuNames()).toStrictEqual(enunciadoTree)
  })

  it('se a criação do sub-item falha depois de travar o pai, nada é gravado', async () => {
    const parentId = await createMenu('Eletrodomésticos')
    const before = await Menu.findById(parentId).lean()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Menu, 'create').mockRejectedValueOnce(new Error('falha simulada'))

    expectProblem(await post('Televisores', parentId), 500, 'INTERNAL_ERROR')

    expect(await Menu.findById(parentId).lean()).toStrictEqual(before)
    expect(await Menu.countDocuments()).toBe(1)
  })
})

describe('erro inesperado', () => {
  it('é registrado em log e respondido sem detalhes', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Menu, 'aggregate').mockImplementationOnce(() => {
      throw new Error('conexão perdida com mongodb://usuario:senha@host')
    })

    const response = await request(app).get(MENU_URL)

    expectProblem(response, 500, 'INTERNAL_ERROR')
    expect(JSON.stringify(response.body)).not.toContain('senha')
    expect(log).toHaveBeenCalledOnce()
  })
})

describe('aninhamento infinito (ADR 0008)', () => {
  it('devolve um menu com 5.000 níveis, além do limite do JSON.stringify', async () => {
    const DEPTH = 5_000
    const documents = Array.from({ length: DEPTH }, (_, level) => ({
      _id: new Menu()._id,
      name: `Nível ${level + 1}`,
      nameKey: `nível ${level + 1}`,
    }))
    await Menu.insertMany(
      documents.map((document, level) => ({
        ...document,
        relatedId: level === 0 ? null : documents[level - 1]._id,
      })),
    )

    const response = await request(app).get(MENU_URL).expect(200)

    let node: MenuNode | undefined = (response.body as MenuNode[])[0]
    let depth = 0
    while (node) {
      depth++
      node = node.submenus?.[0]
    }
    expect(depth).toBe(DEPTH)
    expect(() => JSON.stringify(response.body)).toThrow(RangeError)
  })
})
