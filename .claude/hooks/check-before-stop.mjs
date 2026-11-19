// Stop: o agente só encerra o turno com `npm run check` verde.
// É a definição de pronto do projeto aplicada por máquina, não por lembrança.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { projectDir, readHookInput, repoRoot } from './lib.mjs'

// Se o agente já foi barrado uma vez neste encerramento, não entra em loop.
if (readHookInput().stop_hook_active) process.exit(0)

if (!existsSync(path.join(projectDir, 'node_modules'))) {
  console.error('Dependências não instaladas: rode `npm ci` em backend-desafio.')
  process.exit(2)
}

const git = (...args) =>
  spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).stdout

// Impressão digital do estado do código: commit atual + mudanças não commitadas
// + arquivos novos. Se esse estado já passou no check, não roda de novo.
const untracked = git(
  'ls-files',
  '--others',
  '--exclude-standard',
  '--',
  'backend-desafio',
)
  .split('\n')
  .filter(Boolean)
  .map(file => file + readFileSync(path.join(repoRoot, file), 'utf8'))
const state = createHash('sha256')
  .update(git('rev-parse', 'HEAD'))
  .update(git('diff', 'HEAD', '--', 'backend-desafio'))
  .update(untracked.join('\n'))
  .digest('hex')

const cacheFile = path.join(projectDir, 'node_modules', '.cache', 'agent-check-state')
if (existsSync(cacheFile) && readFileSync(cacheFile, 'utf8') === state) process.exit(0)

const check = spawnSync('npm', ['run', 'check'], { cwd: projectDir, encoding: 'utf8' })

if (check.status === 0) {
  mkdirSync(path.dirname(cacheFile), { recursive: true })
  writeFileSync(cacheFile, state)
  process.exit(0)
}

// Exit 2 impede o encerramento e devolve a saída ao agente.
const output = `${check.stdout}\n${check.stderr}`.trim().split('\n').slice(-60).join('\n')
console.error(`\`npm run check\` falhou. Corrija antes de encerrar:\n\n${output}`)
process.exit(2)
