import { describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/config'

describe('loadConfig', () => {
  it('sem variáveis, usa os padrões do ADR 0010', () => {
    expect(loadConfig({})).toStrictEqual({
      menuMaxItems: 10_000,
      dbTimeoutMs: 5_000,
      logLevel: 'info',
    })
  })

  it('variável vazia conta como ausente', () => {
    expect(loadConfig({ MENU_MAX_ITEMS: '' }).menuMaxItems).toBe(10_000)
  })

  it('lê os valores do ambiente', () => {
    expect(
      loadConfig({ MENU_MAX_ITEMS: '250', DB_TIMEOUT_MS: '1500', LOG_LEVEL: 'warn' }),
    ).toStrictEqual({ menuMaxItems: 250, dbTimeoutMs: 1500, logLevel: 'warn' })
  })

  it.each(['abc', '0', '-1', '1.5', '1e3', ' 10', '99999999999999999999'])(
    'valor %j derruba o boot dizendo qual variável está errada',
    value => {
      expect(() => loadConfig({ MENU_MAX_ITEMS: value })).toThrow(
        `MENU_MAX_ITEMS must be a positive integer, got "${value}"`,
      )
      expect(() => loadConfig({ DB_TIMEOUT_MS: value })).toThrow('DB_TIMEOUT_MS')
    },
  )

  it('LOG_LEVEL fora da lista derruba o boot', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(
      'LOG_LEVEL must be one of debug, info, warn, error, silent, got "verbose"',
    )
  })
})
