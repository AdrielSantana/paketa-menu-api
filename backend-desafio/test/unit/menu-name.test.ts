import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  MENU_NAME_MAX_LENGTH,
  hasForbiddenCharacters,
  normalizeMenuName,
} from '../../src/domain/menu-name'

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

describe('hasForbiddenCharacters', () => {
  it.each([
    ['nulo', 'TV\u0000'],
    ['escape', '\u001b[31mTV'],
    ['DEL', 'TV\u007f'],
    ['controle C1', 'TV\u0085'],
    ['surrogate alto solto', 'TV\ud83d'],
    ['surrogate baixo solto', '\ude00TV'],
  ])('recusa %s', (_label, name) => {
    expect(hasForbiddenCharacters(name)).toBe(true)
  })

  it.each([
    'Informática',
    'Smart TV 4K',
    'Televisores 📺',
    '日本語',
    '"aspas" e \\barra',
  ])('aceita %j', name => {
    expect(hasForbiddenCharacters(name)).toBe(false)
  })

  // É o que sustenta a conta do teto de itens no ADR 0010.
  it('propriedade: um nome válido ocupa no máximo 3 bytes por caractere em JSON', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 150 }), raw => {
        const { name } = normalizeMenuName(raw)
        fc.pre(name.length <= MENU_NAME_MAX_LENGTH && !hasForbiddenCharacters(name))

        const quotes = 2
        expect(Buffer.byteLength(JSON.stringify(name))).toBeLessThanOrEqual(
          quotes + 3 * name.length,
        )
      }),
    )
  })
})
