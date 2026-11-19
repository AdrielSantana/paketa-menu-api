import { readFileSync } from 'node:fs'
import path from 'node:path'

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  type MenuItem,
  type MenuNode,
  buildMenuTree,
  serializeMenuTree,
} from '../../src/domain/menu-tree'

const item = (id: string, name: string, relatedId: string | null = null): MenuItem => ({
  id,
  name,
  relatedId,
})

// Percorre a árvore sem recursão e devolve cada nó com o id do pai.
const flatten = (roots: MenuNode[]): MenuItem[] => {
  const result: MenuItem[] = []
  const pending = roots.map(node => ({ node, parentId: null as string | null }))
  while (pending.length > 0) {
    const { node, parentId } = pending.pop()!
    result.push(item(node.id, node.name, parentId))
    for (const child of node.submenus ?? [])
      pending.push({ node: child, parentId: node.id })
  }
  return result
}

const sortById = (items: MenuItem[]) =>
  [...items].sort((a, b) => a.id.localeCompare(b.id))

describe('buildMenuTree', () => {
  it('lista vazia vira árvore vazia', () => {
    expect(buildMenuTree([])).toStrictEqual([])
  })

  it('item sem pai vira raiz, e folha não tem a chave submenus', () => {
    const [root] = buildMenuTree([item('1', 'Plasma')])

    expect(root).toStrictEqual({ id: '1', name: 'Plasma' })
    expect(root).not.toHaveProperty('submenus')
  })

  it('aninha filhos, netos e bisnetos', () => {
    const tree = buildMenuTree([
      item('1', 'Eletrodomésticos'),
      item('2', 'Televisores', '1'),
      item('3', 'LCD', '2'),
      item('4', '110', '3'),
    ])

    expect(tree).toStrictEqual([
      {
        id: '1',
        name: 'Eletrodomésticos',
        submenus: [
          {
            id: '2',
            name: 'Televisores',
            submenus: [{ id: '3', name: 'LCD', submenus: [{ id: '4', name: '110' }] }],
          },
        ],
      },
    ])
  })

  it('monta o exemplo do boilerplate, em que o filho vem antes do pai', () => {
    const documents: { _id: string; name: string; relatedId?: string }[] = JSON.parse(
      readFileSync(path.join(__dirname, '../../.docs/menus-documents.json'), 'utf8'),
    )

    const tree = buildMenuTree(
      documents.map(({ _id, name, relatedId }) => item(_id, name, relatedId ?? null)),
    )

    // O mesmo conteúdo de .docs/menus-tree.json, com `name` e arrays.
    expect(tree).toStrictEqual([
      {
        id: '1',
        name: 'Gêneros musicais',
        submenus: [
          { id: '2', name: 'Pop', submenus: [{ id: '5', name: 'Sia' }] },
          {
            id: '3',
            name: 'Metal',
            submenus: [
              { id: '4', name: 'Nightwish', submenus: [{ id: '9', name: 'Once' }] },
              {
                id: '6',
                name: 'Disturbed',
                submenus: [
                  {
                    id: '7',
                    name: 'Immortalized',
                    submenus: [{ id: '8', name: 'The Sound of Silence' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      { id: '10', name: 'Gêneros de filmes' },
    ])
  })

  it('ordena raízes e irmãos por id, não pela ordem de entrada', () => {
    const tree = buildMenuTree([
      item('c', 'terceiro', 'x'),
      item('y', 'raiz 2'),
      item('a', 'primeiro', 'x'),
      item('x', 'raiz 1'),
      item('b', 'segundo', 'x'),
    ])

    expect(tree.map(node => node.name)).toEqual(['raiz 1', 'raiz 2'])
    expect(tree[0].submenus?.map(node => node.name)).toEqual([
      'primeiro',
      'segundo',
      'terceiro',
    ])
  })

  it('deixa de fora o item cujo pai não existe, junto com a subárvore dele', () => {
    const tree = buildMenuTree([
      item('1', 'raiz'),
      item('2', 'órfão', 'não-existe'),
      item('3', 'filho do órfão', '2'),
    ])

    expect(tree).toStrictEqual([{ id: '1', name: 'raiz' }])
  })

  it('não entra em loop com um ciclo nos dados, e o ciclo fica de fora', () => {
    const tree = buildMenuTree([
      item('1', 'raiz'),
      item('2', 'a', '3'),
      item('3', 'b', '2'),
      item('4', 'aponta para si mesmo', '4'),
    ])

    expect(tree).toStrictEqual([{ id: '1', name: 'raiz' }])
  })

  it('aguenta 100 mil níveis de profundidade sem estourar a pilha', () => {
    const DEPTH = 100_000
    const id = (level: number) => String(level).padStart(6, '0')
    const chain = Array.from({ length: DEPTH }, (_, level) =>
      item(id(level), `nível ${level}`, level === 0 ? null : id(level - 1)),
    )

    const tree = buildMenuTree(chain)

    expect(flatten(tree)).toHaveLength(DEPTH)
    expect(() => JSON.stringify(tree)).toThrow(RangeError) // o motivo do serializador próprio
    expect(serializeMenuTree(tree)).toContain(`"name":"nível ${DEPTH - 1}"}`)
  })
})

describe('serializeMenuTree', () => {
  it('produz o mesmo JSON que JSON.stringify', () => {
    const tree = buildMenuTree([
      item('1', 'Eletrodomésticos'),
      item('2', 'Televisores', '1'),
      item('3', 'Plasma', '2'),
      item('4', 'Informática'),
    ])

    expect(serializeMenuTree(tree)).toBe(JSON.stringify(tree))
    expect(serializeMenuTree([])).toBe('[]')
  })

  it('escapa aspas, barras, quebras de linha e Unicode nos nomes', () => {
    const tree = buildMenuTree([item('1', 'TV 50" \\ "Smart"\n🙂 ')])

    expect(JSON.parse(serializeMenuTree(tree))).toStrictEqual(tree)
  })
})

describe('propriedades da árvore, para qualquer floresta', () => {
  const idOf = (index: number) => index.toString(16).padStart(24, '0')

  // Floresta arbitrária: cada item é raiz ou filho de algum item anterior.
  // Os nomes são texto arbitrário, para exercitar o escape do serializador.
  const forest = fc
    .array(fc.record({ parent: fc.option(fc.nat(), { nil: null }), name: fc.string() }), {
      maxLength: 80,
    })
    .map(entries =>
      entries.map(({ parent, name }, index) =>
        item(
          idOf(index),
          name,
          parent === null || index === 0 ? null : idOf(parent % index),
        ),
      ),
    )

  const shuffledForest = forest.chain(items =>
    fc.tuple(fc.constant(items), fc.shuffledSubarray(items, { minLength: items.length })),
  )

  it('todo item aparece exatamente uma vez, sob o pai certo', () => {
    fc.assert(
      fc.property(forest, items => {
        expect(sortById(flatten(buildMenuTree(items)))).toStrictEqual(sortById(items))
      }),
    )
  })

  it('a ordem de entrada não muda o resultado', () => {
    fc.assert(
      fc.property(shuffledForest, ([items, shuffled]) => {
        expect(buildMenuTree(shuffled)).toStrictEqual(buildMenuTree(items))
      }),
    )
  })

  it('irmãos saem em ordem crescente de id e nenhum nó tem submenus vazio', () => {
    fc.assert(
      fc.property(forest, items => {
        const pending = [buildMenuTree(items)]
        while (pending.length > 0) {
          const siblings = pending.pop()!
          const ids = siblings.map(node => node.id)
          expect(ids).toEqual([...ids].sort())
          for (const node of siblings) {
            if (!node.submenus) continue
            expect(node.submenus.length).toBeGreaterThan(0)
            pending.push(node.submenus)
          }
        }
      }),
    )
  })

  it('o serializador próprio é idêntico ao JSON.stringify', () => {
    fc.assert(
      fc.property(forest, items => {
        const tree = buildMenuTree(items)

        expect(serializeMenuTree(tree)).toBe(JSON.stringify(tree))
      }),
    )
  })
})
