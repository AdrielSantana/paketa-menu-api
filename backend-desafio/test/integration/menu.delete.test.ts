import { describe, expect, it } from 'vitest'

import { enunciadoTree } from '../fixtures/enunciado'
import {
  UNKNOWN_ID,
  createMenu,
  deleteMenu,
  expectProblem,
  getMenuNames,
  seedMenu,
} from '../support/menu'

describe('DELETE /api/v1/menu/:id', () => {
  describe('item sem filhos', () => {
    it('apaga a folha e devolve 200 com o id', async () => {
      const ids = await seedMenu(enunciadoTree)

      const response = await deleteMenu(ids.get('Plasma')!).expect(200)

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

    it('libera o nome para ser usado de novo', async () => {
      const id = await createMenu('Plasma')

      await deleteMenu(id).expect(200)

      await createMenu('Plasma')
    })

    it('aceita a estratégia mesmo sem filhos para tratar', async () => {
      const id = await createMenu('Plasma')

      await deleteMenu(id, '?children=cascade').expect(200)

      expect(await getMenuNames()).toStrictEqual([])
    })
  })

  describe('item com filhos, sem escolha (409)', () => {
    it('não apaga nada e explica as duas opções', async () => {
      const ids = await seedMenu(enunciadoTree)

      const response = await deleteMenu(ids.get('Televisores')!)

      expectProblem(response, 409, 'MENU_HAS_SUBMENUS')
      expect(response.body.detail).toContain('children=cascade')
      expect(response.body.detail).toContain('children=promote')
      expect(await getMenuNames()).toStrictEqual(enunciadoTree)
    })
  })

  describe('?children=cascade', () => {
    it('apaga o item e toda a subárvore, e só ela', async () => {
      const ids = await seedMenu(enunciadoTree)

      const response = await deleteMenu(
        ids.get('Televisores')!,
        '?children=cascade',
      ).expect(200)

      // Televisores, LCD, 110, 220 e Plasma.
      expect(response.body).toStrictEqual({ id: ids.get('Televisores'), deletedCount: 5 })
      expect(await getMenuNames()).toStrictEqual([
        { name: 'Eletrodomésticos' },
        enunciadoTree[1],
      ])
    })

    it('apaga uma raiz com tudo que está abaixo', async () => {
      const ids = await seedMenu(enunciadoTree)

      const response = await deleteMenu(
        ids.get('Informática')!,
        '?children=cascade',
      ).expect(200)

      expect(response.body.deletedCount).toBe(6)
      expect(await getMenuNames()).toStrictEqual([enunciadoTree[0]])
    })
  })

  describe('?children=promote', () => {
    it('os filhos sobem para o pai do item apagado e os netos seguem com eles', async () => {
      const ids = await seedMenu(enunciadoTree)

      const response = await deleteMenu(
        ids.get('Televisores')!,
        '?children=promote',
      ).expect(200)

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
    })

    it('ao apagar uma raiz, os filhos viram itens de primeiro nível', async () => {
      const ids = await seedMenu(enunciadoTree)

      await deleteMenu(ids.get('Informática')!, '?children=promote').expect(200)

      expect(await getMenuNames()).toStrictEqual([
        enunciadoTree[0],
        enunciadoTree[1].submenus![0], // Computadores, com a subárvore intacta
      ])
    })
  })

  describe('erros', () => {
    it('devolve 404 para um id que não existe', async () => {
      expectProblem(await deleteMenu(UNKNOWN_ID), 404, 'MENU_NOT_FOUND')
    })

    it('devolve 404 ao apagar o mesmo item duas vezes', async () => {
      const id = await createMenu('Plasma')
      await deleteMenu(id).expect(200)

      expectProblem(await deleteMenu(id), 404, 'MENU_NOT_FOUND')
    })

    it('devolve 400 para um id que não é ObjectId', async () => {
      expectProblem(await deleteMenu('1'), 400, 'VALIDATION_FAILED')
    })

    it('devolve 400 para uma estratégia desconhecida', async () => {
      const id = await createMenu('Plasma')

      expectProblem(await deleteMenu(id, '?children=orphan'), 400, 'VALIDATION_FAILED')
      expect(await getMenuNames()).toStrictEqual([{ name: 'Plasma' }])
    })
  })
})
