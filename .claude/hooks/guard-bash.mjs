// PreToolUse (Bash): bloqueia comandos que as regras do projeto proíbem.
// A regra está escrita no AGENTS.md; este hook é o que a faz valer mesmo
// que o agente a esqueça.
import { readHookInput } from './lib.mjs'

const command = readHookInput().tool_input?.command ?? ''

const forbidden = [
  {
    pattern: /git\s+commit[^\n;&|]*--no-verify|HUSKY=0/,
    reason: 'Não pule o pre-commit. Corrija o que o hook apontou.',
  },
  {
    pattern: /git\s+push[^\n;&|]*\bupstream\b/,
    reason: 'Nada de push no repositório da Paketá. O remoto de entrega é o origin.',
  },
  {
    pattern:
      /git\s+(fetch|pull|checkout|switch|clone|show|log|diff|merge|cherry-pick|worktree)[^\n;&|]*(\bdevelop\b|refact-aggregate|refact-recursive)/,
    reason:
      'As branches develop e feature/refact-* do upstream contêm uma solução pronta e não podem ser lidas.',
  },
]

const hit = forbidden.find(rule => rule.pattern.test(command))

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
