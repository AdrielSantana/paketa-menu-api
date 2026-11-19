import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../../src/app'
import { enunciadoTree } from '../fixtures/enunciado'
import {
  MENU_URL,
  createMenu,
  expectProblem,
  getMenuNames,
  seedMenu,
} from '../support/menu'

const UNKNOWN_ID = '507f1f77bcf86cd799439011'

const del = (id: string, query = '') => request(app).delete(`${MENU_URL}/${id}${query}`)

describe('DELETE /api/v1/menu/:id', () => {
  describe('item sem filhos', () => {
    it.fails('apaga a folha e devolve 200 com o id', async () => {
      const ids = await seedMenu(enunciadoTree)

      const response = await del(ids.get('Plasma')!).expect(200)

      expect(response.body).toStrictEqual({ id: ids.get('Plasma'), deletedCount: 1 })
      expect(await getMenuNames()).toStrictEqual([
        {
          name: 'Eletrodomésticos',
          submenus: [
            {
              name: 'Televisores',
              submenus: [{ name: 'LCD', submenus: [{ name: '110' }, { name: '220' }] }],
            },
          ],
        },
        enunciadoTree[1],
      ])
    })

    it.fails('libera o nome para ser usado de novo', async () => {
      const id = await createMenu('Plasma')

      await del(id).expect(200)

      await createMenu('Plasma')
    })

    it.fails('aceita a estratégia mesmo sem filhos para tratar', async () => {
      const id = await createMenu('Plasma')

      await del(id, '?children=cascade').expect(200)

      expect(await getMenuNames()).toStrictEqual([])
    })
  })

  describe('item com filhos, sem escolha (409)', () => {
    it.fails('não apaga nada e explica as duas opções', async () => {
      const ids = await seedMenu(enunciadoTree)

      const response = await del(ids.get('Televisores')!)

      expectProblem(response, 409, 'MENU_HAS_SUBMENUS')
      expect(response.body.detail).toContain('children=cascade')
      expect(response.body.detail).toContain('children=promote')
      expect(await getMenuNames()).toStrictEqual(enunciadoTree)
    })
  })

  describe('?children=cascade', () => {
    it.fails('apaga o item e toda a subárvore, e só ela', async () => {
      const ids = await seedMenu(enunciadoTree)

      const response = await del(ids.get('Televisores')!, '?children=cascade').expect(200)

      // Televisores, LCD, 110, 220 e Plasma.
      expect(response.body).toStrictEqual({ id: ids.get('Televisores'), deletedCount: 5 })
      expect(await getMenuNames()).toStrictEqual([
        { name: 'Eletrodomésticos' },
        enunciadoTree[1],
      ])
    })

    it.fails('apaga uma raiz com tudo que está abaixo', async () => {
      const ids = await seedMenu(enunciadoTree)

      const response = await del(ids.get('Informática')!, '?children=cascade').expect(200)

      expect(response.body.deletedCount).toBe(6)
      expect(await getMenuNames()).toStrictEqual([enunciadoTree[0]])
    })
  })

  describe('?children=promote', () => {
    it.fails(
      'os filhos sobem para o pai do item apagado e os netos seguem com eles',
      async () => {
        const ids = await seedMenu(enunciadoTree)

        const response = await del(ids.get('Televisores')!, '?children=promote').expect(
          200,
        )

        expect(response.body).toStrictEqual({
          id: ids.get('Televisores'),
          deletedCount: 1,
        })
        expect(await getMenuNames()).toStrictEqual([
          {
            name: 'Eletrodomésticos',
            submenus: [
              { name: 'LCD', submenus: [{ name: '110' }, { name: '220' }] },
              { name: 'Plasma' },
            ],
          },
          enunciadoTree[1],
        ])
      },
    )

    it.fails('ao apagar uma raiz, os filhos viram itens de primeiro nível', async () => {
      const ids = await seedMenu(enunciadoTree)

      await del(ids.get('Informática')!, '?children=promote').expect(200)

      expect(await getMenuNames()).toStrictEqual([
        enunciadoTree[0],
        enunciadoTree[1].submenus![0], // Computadores, com a subárvore intacta
      ])
    })
  })

  describe('erros', () => {
    it.fails('devolve 404 para um id que não existe', async () => {
      expectProblem(await del(UNKNOWN_ID), 404, 'MENU_NOT_FOUND')
    })

    it.fails('devolve 404 ao apagar o mesmo item duas vezes', async () => {
      const id = await createMenu('Plasma')
      await del(id).expect(200)

      expectProblem(await del(id), 404, 'MENU_NOT_FOUND')
    })

    it.fails('devolve 400 para um id que não é ObjectId', async () => {
      expectProblem(await del('1'), 400, 'VALIDATION_FAILED')
    })

    it.fails('devolve 400 para uma estratégia desconhecida', async () => {
      const id = await createMenu('Plasma')

      expectProblem(await del(id, '?children=orphan'), 400, 'VALIDATION_FAILED')
      expect(await getMenuNames()).toStrictEqual([{ name: 'Plasma' }])
    })
  })
})
