// Utilitários compartilhados pelos hooks do agente. Só Node, sem dependências:
// quem clona o repositório não precisa de jq nem de nada além do Node.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)
export const projectDir = path.join(repoRoot, 'backend-desafio')

// O Claude Code entrega o evento do hook como JSON no stdin.
export const readHookInput = () => {
  try {
    return JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return {}
  }
}
