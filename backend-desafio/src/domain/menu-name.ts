export const MENU_NAME_MAX_LENGTH = 100

interface NormalizedMenuName {
  /** Nome como será exibido: espaços arrumados, caixa original. */
  name: string
  /** Chave de unicidade: o nome em NFKC, sem caracteres invisíveis e em minúsculas (ADR 0006). */
  nameKey: string
}

// Caracteres de controle e surrogates soltos (Unicode malformado). Além de não
// fazerem sentido em um nome, são os que mais crescem ao virar JSON: sem eles,
// cada caractere do nome ocupa no máximo 3 bytes na resposta (ADR 0010).
const FORBIDDEN_CHARACTERS = /[\p{Cc}\p{Cs}]/u

// As três regras de um nome válido. Todas recebem o nome como chegou e
// conferem a forma normalizada, que é a que vai para o banco.

/** Pela chave: um nome só com espaços ou caracteres invisíveis também é vazio. */
export const isBlankMenuName = (raw: string): boolean =>
  normalizeMenuName(raw).nameKey.length === 0

export const isMenuNameTooLong = (raw: string): boolean =>
  normalizeMenuName(raw).name.length > MENU_NAME_MAX_LENGTH

/** Tabulações e quebras de linha não contam: a normalização as troca por espaço. */
export const hasForbiddenCharacters = (raw: string): boolean =>
  FORBIDDEN_CHARACTERS.test(normalizeMenuName(raw).name)

// Caracteres de formato (espaço de largura zero, hífen opcional, inversores
// de direção): não aparecem na tela. Ficam no nome exibido, porque emojis
// compostos e algumas escritas dependem deles, mas saem da chave, para que
// "LCD" e "LCD" com um caractere invisível sejam o mesmo nome.
const INVISIBLE_CHARACTERS = /\p{Cf}/gu

const collapseSpaces = (text: string) => text.trim().replace(/\s+/g, ' ')

export const normalizeMenuName = (raw: string): NormalizedMenuName => {
  const name = collapseSpaces(raw.normalize('NFC'))
  const visible = collapseSpaces(name.normalize('NFKC').replace(INVISIBLE_CHARACTERS, ''))

  return { name, nameKey: visible.toLowerCase() }
}
