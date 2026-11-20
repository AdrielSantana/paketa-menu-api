export const MENU_NAME_MAX_LENGTH = 100

export interface NormalizedMenuName {
  /** Nome como será exibido: espaços arrumados, caixa original. */
  name: string
  /** Chave de unicidade: o nome em NFKC e minúsculas (ADR 0006). */
  nameKey: string
}

// Caracteres de controle e surrogates soltos (Unicode malformado). Além de não
// fazerem sentido em um nome, são os que mais crescem ao virar JSON: sem eles,
// cada caractere do nome ocupa no máximo 3 bytes na resposta (ADR 0010).
const FORBIDDEN_CHARACTERS = /[\p{Cc}\p{Cs}]/u

/** Recebe o nome já normalizado: tabulações e quebras de linha já viraram espaço. */
export const hasForbiddenCharacters = (name: string): boolean =>
  FORBIDDEN_CHARACTERS.test(name)

export const normalizeMenuName = (raw: string): NormalizedMenuName => {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ')

  return { name, nameKey: name.normalize('NFKC').toLowerCase() }
}
