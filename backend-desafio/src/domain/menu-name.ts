export const MENU_NAME_MAX_LENGTH = 100

export interface NormalizedMenuName {
  /** Nome como será exibido: espaços arrumados, caixa original. */
  name: string
  /** Chave de unicidade: o nome em NFKC e minúsculas (ADR 0006). */
  nameKey: string
}

export const normalizeMenuName = (raw: string): NormalizedMenuName => {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ')

  return { name, nameKey: name.normalize('NFKC').toLowerCase() }
}
