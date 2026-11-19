import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../../src/app'
import { MENU_URL, createMenu, expectProblem, getMenuNames } from '../support/menu'

const UNKNOWN_ID = '507f1f77bcf86cd799439011'

const post = (body: unknown) =>
  request(app)
    .post(MENU_URL)
    .send(body as object)

describe('POST /api/v1/menu', () => {
  describe('criação', () => {
    it.fails(
      'cria um item de primeiro nível e devolve 201 com o id em string',
      async () => {
        const response = await post({ name: 'Eletrodomésticos' }).expect(201)

        expect(Object.keys(response.body)).toEqual(['id'])
        expect(response.body.id).toMatch(/^[0-9a-f]{24}$/)
        expect(await getMenuNames()).toStrictEqual([{ name: 'Eletrodomésticos' }])
      },
    )

    it.fails('cria um sub-item quando recebe o id do pai em relatedId', async () => {
      const parentId = await createMenu('Eletrodomésticos')

      await post({ name: 'Televisores', relatedId: parentId }).expect(201)

      expect(await getMenuNames()).toStrictEqual([
        { name: 'Eletrodomésticos', submenus: [{ name: 'Televisores' }] },
      ])
    })

    it.fails('aceita relatedId null como item de primeiro nível', async () => {
      await post({ name: 'Informática', relatedId: null }).expect(201)

      expect(await getMenuNames()).toStrictEqual([{ name: 'Informática' }])
    })

    it.fails('guarda o nome sem espaços sobrando e com a caixa original', async () => {
      await post({ name: '  Smart   TV ' }).expect(201)

      expect(await getMenuNames()).toStrictEqual([{ name: 'Smart TV' }])
    })
  })

  describe('validação (400)', () => {
    it.fails.each([
      ['name ausente', {}],
      ['name null', { name: null }],
      ['name que não é string', { name: 123 }],
      ['name vazio', { name: '' }],
      ['name só com espaços', { name: '   ' }],
      ['name com mais de 100 caracteres', { name: 'a'.repeat(101) }],
      ['relatedId numérico', { name: 'LCD', relatedId: 1 }],
      ['relatedId que não é um ObjectId', { name: 'LCD', relatedId: 'abc' }],
      ['campo desconhecido', { name: 'LCD', parentId: UNKNOWN_ID }],
    ])('recusa %s', async (_case, body) => {
      const response = await post(body)

      expectProblem(response, 400, 'VALIDATION_FAILED')
      expect(response.body.errors.length).toBeGreaterThan(0)
      expect(await getMenuNames()).toStrictEqual([])
    })

    it.fails('recusa JSON malformado', async () => {
      const response = await request(app)
        .post(MENU_URL)
        .set('Content-Type', 'application/json')
        .send('{"name":')

      expectProblem(response, 400, 'MALFORMED_JSON')
    })
  })

  describe('pai inexistente (422)', () => {
    it.fails('recusa relatedId bem formado que não aponta para um item', async () => {
      const response = await post({ name: 'Televisores', relatedId: UNKNOWN_ID })

      expectProblem(response, 422, 'PARENT_NOT_FOUND')
      expect(await getMenuNames()).toStrictEqual([])
    })
  })

  describe('nome único (409)', () => {
    it.fails('recusa nome repetido', async () => {
      await createMenu('LCD')

      const response = await post({ name: 'LCD' })

      expectProblem(response, 409, 'MENU_NAME_TAKEN')
      expect(await getMenuNames()).toStrictEqual([{ name: 'LCD' }])
    })

    it.fails('a unicidade é global: recusa nome repetido em outro ramo', async () => {
      const appleId = await createMenu('Apple')
      const dellId = await createMenu('Dell')
      await createMenu('Cabos', appleId)

      const response = await post({ name: 'Cabos', relatedId: dellId })

      expectProblem(response, 409, 'MENU_NAME_TAKEN')
    })

    it.fails.each([
      ['caixa', 'lcd'],
      ['espaços nas pontas', '  LCD  '],
      ['caixa e espaços', ' Lcd '],
    ])('trata como repetido o nome que só difere em %s', async (_case, name) => {
      await createMenu('LCD')

      expectProblem(await post({ name }), 409, 'MENU_NAME_TAKEN')
    })

    it.fails('acento faz diferença: Informática e Informatica coexistem', async () => {
      await createMenu('Informática')

      await post({ name: 'Informatica' }).expect(201)
    })

    it.fails('em criações simultâneas do mesmo nome, só uma vence', async () => {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => post({ name: 'Plasma' })),
      )

      const statuses = responses.map(response => response.status).sort()
      expect(statuses).toEqual([201, ...Array<number>(9).fill(409)])
      expect(await getMenuNames()).toStrictEqual([{ name: 'Plasma' }])
    })
  })
})
