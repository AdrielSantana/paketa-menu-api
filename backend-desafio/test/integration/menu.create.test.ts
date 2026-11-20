import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../../src/app'
import {
  MENU_URL,
  UNKNOWN_ID,
  createMenu,
  expectProblem,
  getMenuNames,
  postMenu,
} from '../support/menu'

describe('POST /api/v1/menu', () => {
  describe('criação', () => {
    it('cria um item de primeiro nível e devolve 201 com o id em string', async () => {
      const response = await postMenu({ name: 'Eletrodomésticos' }).expect(201)

      expect(Object.keys(response.body)).toEqual(['id'])
      expect(response.body.id).toMatch(/^[0-9a-f]{24}$/)
      expect(await getMenuNames()).toStrictEqual([{ name: 'Eletrodomésticos' }])
    })

    it('cria um sub-item quando recebe o id do pai em relatedId', async () => {
      const parentId = await createMenu('Eletrodomésticos')

      await postMenu({ name: 'Televisores', relatedId: parentId }).expect(201)

      expect(await getMenuNames()).toStrictEqual([
        { name: 'Eletrodomésticos', submenus: [{ name: 'Televisores' }] },
      ])
    })

    it('aceita relatedId null como item de primeiro nível', async () => {
      await postMenu({ name: 'Informática', relatedId: null }).expect(201)

      expect(await getMenuNames()).toStrictEqual([{ name: 'Informática' }])
    })

    it('guarda o nome sem espaços sobrando e com a caixa original', async () => {
      await postMenu({ name: '  Smart   TV ' }).expect(201)

      expect(await getMenuNames()).toStrictEqual([{ name: 'Smart TV' }])
    })
  })

  describe('validação (400)', () => {
    it.each([
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
      const response = await postMenu(body)

      expectProblem(response, 400, 'VALIDATION_FAILED')
      expect(response.body.errors.length).toBeGreaterThan(0)
      expect(await getMenuNames()).toStrictEqual([])
    })

    it('recusa JSON malformado', async () => {
      const response = await request(app)
        .post(MENU_URL)
        .set('Content-Type', 'application/json')
        .send('{"name":')

      expectProblem(response, 400, 'MALFORMED_JSON')
    })
  })

  describe('pai inexistente (422)', () => {
    it('recusa relatedId bem formado que não aponta para um item', async () => {
      const response = await postMenu({ name: 'Televisores', relatedId: UNKNOWN_ID })

      expectProblem(response, 422, 'PARENT_NOT_FOUND')
      expect(await getMenuNames()).toStrictEqual([])
    })
  })

  describe('nome único (409)', () => {
    it('recusa nome repetido', async () => {
      await createMenu('LCD')

      const response = await postMenu({ name: 'LCD' })

      expectProblem(response, 409, 'MENU_NAME_TAKEN')
      expect(await getMenuNames()).toStrictEqual([{ name: 'LCD' }])
    })

    it('a unicidade é global: recusa nome repetido em outro ramo', async () => {
      const appleId = await createMenu('Apple')
      const dellId = await createMenu('Dell')
      await createMenu('Cabos', appleId)

      const response = await postMenu({ name: 'Cabos', relatedId: dellId })

      expectProblem(response, 409, 'MENU_NAME_TAKEN')
    })

    it.each([
      ['caixa', 'lcd'],
      ['espaços nas pontas', '  LCD  '],
      ['caixa e espaços', ' Lcd '],
    ])('trata como repetido o nome que só difere em %s', async (_case, name) => {
      await createMenu('LCD')

      expectProblem(await postMenu({ name }), 409, 'MENU_NAME_TAKEN')
    })

    it('acento faz diferença: Informática e Informatica coexistem', async () => {
      await createMenu('Informática')

      await postMenu({ name: 'Informatica' }).expect(201)
    })

    it('em criações simultâneas do mesmo nome, só uma vence', async () => {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => postMenu({ name: 'Plasma' })),
      )

      const statuses = responses.map(response => response.status).sort()
      expect(statuses).toEqual([201, ...Array<number>(9).fill(409)])
      expect(await getMenuNames()).toStrictEqual([{ name: 'Plasma' }])
    })
  })
})
