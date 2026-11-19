import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../../src/app'
import { enunciadoTree } from '../fixtures/enunciado'
import {
  MENU_URL,
  type MenuNode,
  createMenu,
  getMenu,
  getMenuNames,
  seedMenu,
  toNames,
} from '../support/menu'

describe('GET /api/v1/menu', () => {
  it.fails('devolve 200 e lista vazia quando não há itens', async () => {
    const response = await request(app).get(MENU_URL).expect(200)

    expect(response.headers['content-type']).toMatch(/^application\/json/)
    expect(response.body).toStrictEqual([])
  })

  it.fails('devolve exatamente a árvore de exemplo do enunciado', async () => {
    const ids = await seedMenu(enunciadoTree)

    const menu = await getMenu()

    expect(toNames(menu)).toStrictEqual(enunciadoTree)

    // Cada nó carrega o id devolvido na criação, e só id, name e submenus.
    const visit = (nodes: MenuNode[]) => {
      for (const node of nodes) {
        expect(node.id).toBe(ids.get(node.name))
        expect(Object.keys(node)).toEqual(
          node.submenus ? ['id', 'name', 'submenus'] : ['id', 'name'],
        )
        if (node.submenus) visit(node.submenus)
      }
    }
    visit(menu)
    expect(ids.size).toBe(12)
  })

  it.fails('folha não tem a chave submenus', async () => {
    await createMenu('Plasma')

    const [leaf] = await getMenu()

    expect(leaf).not.toHaveProperty('submenus')
  })

  it.fails('irmãos vêm na ordem em que foram criados', async () => {
    const parentId = await createMenu('LCD')
    for (const name of ['220', '110', '127', 'Bivolt']) await createMenu(name, parentId)
    await createMenu('Áudio')

    expect(await getMenuNames()).toStrictEqual([
      {
        name: 'LCD',
        submenus: [{ name: '220' }, { name: '110' }, { name: '127' }, { name: 'Bivolt' }],
      },
      { name: 'Áudio' },
    ])
  })

  it.fails('aninha em qualquer profundidade (150 níveis criados pela API)', async () => {
    const DEPTH = 150
    let parentId: string | undefined
    for (let level = 1; level <= DEPTH; level++) {
      parentId = await createMenu(`Nível ${level}`, parentId)
    }

    let node: MenuNode | undefined = (await getMenu())[0]
    let depth = 0
    while (node) {
      depth++
      expect(node.name).toBe(`Nível ${depth}`)
      node = node.submenus?.[0]
    }
    expect(depth).toBe(DEPTH)
  })
})
