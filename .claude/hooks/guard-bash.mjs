// PreToolUse (Bash): bloqueia comandos que as regras do projeto proíbem.
// A regra está escrita no AGENTS.md; este hook é o que a faz valer mesmo
// que o agente a esqueça.
import { readHookInput } from './lib.mjs'

const command = readHookInput().tool_input?.command ?? ''

// Sem o conteúdo entre aspas: uma mensagem de commit pode citar "-n" ou o
// nome de uma branch sem que isso seja o comando.
const unquoted = command.replace(/'[^']*'|"[^"]*"/g, '""')

const FORBIDDEN_BRANCHES = /\bdevelop\b|refact-aggregate|refact-recursive/

// Um comando por vez: cada trecho entre ; & | ou quebra de linha.
const gitSegments = text =>
  text
    .split(/[;&|\n]+/)
    .map(segment => segment.trim())
    .filter(segment => /\bgit\b/.test(segment))

const rules = [
  {
    // --no-verify, a forma curta -n (sozinha ou junto de outras, como -nm),
    // HUSKY=0 e a troca do diretório de hooks.
    hit: () =>
      /HUSKY=0|core\.hooksPath/.test(command) ||
      gitSegments(unquoted).some(
        segment =>
          /\bcommit\b/.test(segment) &&
          /(^|\s)(--no-verify\b|-[a-zA-Z]*n[a-zA-Z]*(\s|$))/.test(segment),
      ),
    reason: 'Não pule o pre-commit. Corrija o que o hook apontou.',
  },
  {
    hit: () => gitSegments(command).some(segment => /\bpush\b.*\bupstream\b/.test(segment)),
    reason: 'Nada de push no repositório da Paketá. O remoto de entrega é o origin.',
  },
  {
    // Do upstream só se busca a branch boilerplate, e pelo nome.
    hit: () =>
      gitSegments(command).some(
        segment =>
          /\b(fetch|pull)\b.*--all\b|\bremote\s+update\b/.test(segment) ||
          (/\b(fetch|pull)\b.*\bupstream\b/.test(segment) && !/\bboilerplate\b/.test(segment)),
      ),
    reason:
      'Do upstream só a branch boilerplate, pedida pelo nome: git fetch upstream boilerplate.',
  },
  {
    // Qualquer comando git que cite as branches proibidas, menos dentro de
    // aspas (a mensagem de um commit pode citá-las).
    hit: () => gitSegments(unquoted).some(segment => FORBIDDEN_BRANCHES.test(segment)),
    reason:
      'As branches develop e feature/refact-* do upstream contêm uma solução pronta e não podem ser lidas.',
  },
]

const hit = rules.find(rule => rule.hit())

if (hit) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: hit.reason,
      },
    }),
  )
}
