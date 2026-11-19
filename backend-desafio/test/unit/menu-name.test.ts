import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { normalizeMenuName } from '../../src/domain/menu-name'

describe('normalizeMenuName', () => {
  it.each([
    ['LCD', 'LCD', 'lcd'],
    ['  Smart   TV ', 'Smart TV', 'smart tv'],
    ['\tMacBook\n Pro', 'MacBook Pro', 'macbook pro'],
    ['Informática', 'Informática', 'informática'],
    ['   ', '', ''],
  ])('%j vira nome %j e chave %j', (raw, name, nameKey) => {
    expect(normalizeMenuName(raw)).toStrictEqual({ name, nameKey })
  })

  it('caixa e espaços não mudam a chave', () => {
    const keys = ['LCD', 'lcd', ' Lcd ', 'lCD\n'].map(
      raw => normalizeMenuName(raw).nameKey,
    )

    expect(new Set(keys).size).toBe(1)
  })

  it('acento muda a chave', () => {
    expect(normalizeMenuName('Informática').nameKey).not.toBe(
      normalizeMenuName('Informatica').nameKey,
    )
  })

  it('formas Unicode diferentes do mesmo texto dão a mesma chave', () => {
    const composed = 'Informática' // "á" como um caractere
    const decomposed = 'Informática' // "a" + acento combinante
    const fullWidth = 'ＬＣＤ' // letras de largura dupla

    expect(normalizeMenuName(decomposed)).toStrictEqual(normalizeMenuName(composed))
    expect(normalizeMenuName(fullWidth).nameKey).toBe('lcd')
  })

  it('propriedade: normalizar de novo o nome já normalizado não muda nada', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), raw => {
        const once = normalizeMenuName(raw)

        expect(normalizeMenuName(once.name)).toStrictEqual(once)
      }),
    )
  })

  it('propriedade: o nome nunca tem espaço nas pontas nem espaços repetidos', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), raw => {
        const { name } = normalizeMenuName(raw)

        expect(name).toBe(name.trim())
        expect(name).not.toMatch(/\s{2,}/)
      }),
    )
  })
})
