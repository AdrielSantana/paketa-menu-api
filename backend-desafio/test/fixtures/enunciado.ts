import type { NameTree } from '../support/menu'

// A árvore de exemplo do enunciado, só com os nomes: os ids são gerados pelo
// banco. Vale o JSON do enunciado (Plasma é filho de Televisores).
export const enunciadoTree: NameTree[] = [
  {
    name: 'Eletrodomésticos',
    submenus: [
      {
        name: 'Televisores',
        submenus: [
          { name: 'LCD', submenus: [{ name: '110' }, { name: '220' }] },
          { name: 'Plasma' },
        ],
      },
    ],
  },
  {
    name: 'Informática',
    submenus: [
      {
        name: 'Computadores',
        submenus: [
          {
            name: 'Apple',
            submenus: [
              { name: 'MacBook', submenus: [{ name: 'Cabos' }] },
              { name: 'iMac' },
            ],
          },
        ],
      },
    ],
  },
]
