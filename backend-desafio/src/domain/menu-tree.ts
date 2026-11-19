/** Um item como está no banco: plano, apontando para o pai. */
export interface MenuItem {
  id: string
  name: string
  relatedId: string | null
}

/** Um item como a API devolve: aninhado. Folha não tem `submenus`. */
export interface MenuNode {
  id: string
  name: string
  submenus?: MenuNode[]
}

const byId = (a: MenuItem, b: MenuItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Monta a árvore a partir da lista plana, em qualquer ordem de entrada.
 *
 * - Irmãos saem ordenados por id (para ObjectId, a ordem de criação).
 * - Só entra o que é alcançável a partir de um item de primeiro nível: itens
 *   cujo pai não está na lista, e ciclos, ficam de fora.
 * - Não usa recursão, então a profundidade não é limitada pela pilha.
 */
export const buildMenuTree = (items: readonly MenuItem[]): MenuNode[] => {
  const sorted = [...items].sort(byId)

  const nodes = new Map<string, MenuNode>()
  for (const { id, name } of sorted) nodes.set(id, { id, name })

  const roots: MenuNode[] = []
  for (const { id, relatedId } of sorted) {
    const node = nodes.get(id)!
    if (relatedId === null) {
      roots.push(node)
      continue
    }

    const parent = nodes.get(relatedId)
    if (parent) (parent.submenus ??= []).push(node)
  }

  return roots
}

/**
 * Serializa a árvore em JSON sem recursão.
 *
 * `JSON.stringify` é recursivo e estoura a pilha por volta de 3 mil níveis
 * de menu (medido no Node 24). Como o requisito é aninhamento infinito, a
 * resposta é montada com uma pilha explícita (ADR 0008). O resultado é
 * idêntico ao de `JSON.stringify`.
 */
export const serializeMenuTree = (roots: readonly MenuNode[]): string => {
  const parts: string[] = ['[']
  const stack = [{ siblings: roots, next: 0 }]

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]

    if (frame.next === frame.siblings.length) {
      stack.pop()
      // Fecha a lista de irmãos e, se não for a raiz, o nó pai.
      parts.push(stack.length > 0 ? ']}' : ']')
      continue
    }

    const node = frame.siblings[frame.next]
    if (frame.next > 0) parts.push(',')
    frame.next++

    parts.push(`{"id":${JSON.stringify(node.id)},"name":${JSON.stringify(node.name)}`)
    if (node.submenus) {
      parts.push(',"submenus":[')
      stack.push({ siblings: node.submenus, next: 0 })
    } else {
      parts.push('}')
    }
  }

  return parts.join('')
}
