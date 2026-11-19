import request, { type Response } from 'supertest'
import { expect } from 'vitest'

import app from '../../src/app'

export const MENU_URL = '/api/v1/menu'

export type MenuNode = { id: string; name: string; submenus?: MenuNode[] }
export type NameTree = { name: string; submenus?: NameTree[] }

export const createMenu = async (name: string, relatedId?: string): Promise<string> => {
  const response = await request(app).post(MENU_URL).send({ name, relatedId }).expect(201)
  return response.body.id
}

export const getMenu = async (): Promise<MenuNode[]> => {
  const response = await request(app).get(MENU_URL).expect(200)
  return response.body
}

// Reduz a árvore aos nomes, preservando a ausência de `submenus` nas folhas.
export const toNames = (nodes: MenuNode[]): NameTree[] =>
  nodes.map(({ name, submenus }) =>
    submenus ? { name, submenus: toNames(submenus) } : { name },
  )

export const getMenuNames = async (): Promise<NameTree[]> => toNames(await getMenu())

// Cria a árvore pela API, pai antes dos filhos, e devolve o id de cada nome.
export const seedMenu = async (
  tree: NameTree[],
  parentId?: string,
  ids = new Map<string, string>(),
): Promise<Map<string, string>> => {
  for (const { name, submenus } of tree) {
    const id = await createMenu(name, parentId)
    ids.set(name, id)
    if (submenus) await seedMenu(submenus, id, ids)
  }
  return ids
}

// Confere o contrato de erro do ADR 0007 (Problem Details).
export const expectProblem = (response: Response, status: number, code: string) => {
  expect(response.status).toBe(status)
  expect(response.headers['content-type']).toMatch(/^application\/problem\+json/)
  expect(response.body).toMatchObject({ status, code })
  expect(typeof response.body.title).toBe('string')
  expect(typeof response.body.detail).toBe('string')
}
