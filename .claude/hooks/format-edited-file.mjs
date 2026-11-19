// PostToolUse (Edit|Write): formata e linta o arquivo que o agente acabou de
// editar. Feedback em segundos, no arquivo certo, sem esperar a suíte.
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { projectDir, readHookInput } from './lib.mjs'

const input = readHookInput()
const file = input.tool_response?.filePath ?? input.tool_input?.file_path

const insideProject = file && path.resolve(file).startsWith(projectDir + path.sep)
if (!insideProject || file.includes(`${path.sep}node_modules${path.sep}`)) process.exit(0)

const run = (bin, args) =>
  spawnSync(path.join(projectDir, 'node_modules', '.bin', bin), args, {
    cwd: projectDir,
    encoding: 'utf8',
  })

run('prettier', ['--write', '--ignore-unknown', file])

if (/\.(ts|mts|mjs)$/.test(file)) {
  const lint = run('eslint', ['--fix', file])
  if (lint.status !== 0) {
    // Exit 2 devolve o stderr ao agente, que corrige antes de seguir.
    console.error(`ESLint encontrou problemas em ${file}:\n${lint.stdout}${lint.stderr}`)
    process.exit(2)
  }
}
