// Teste do guard-bash: passa cada comando pelo hook, como o Claude Code faz,
// e confere se ele barra ou libera. Uso: node .claude/hooks/guard-bash.test.mjs
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), 'guard-bash.mjs')

const cases = {
  deny: [
    'git commit --no-verify -m "x"',
    'git commit -n -m "x"',
    'git commit -anm "x"',
    'HUSKY=0 git commit -m "x"',
    'git -c core.hooksPath=/dev/null commit -m "x"',
    'git push upstream main',
    'git fetch upstream',
    'git fetch --all',
    'git remote update',
    'git pull upstream',
    'git checkout develop',
    'git grep foo upstream/develop',
    'git ls-tree -r origin/feature/refact-recursive',
    'git -C .. show feature/refact-aggregate:README.md',
    'npm test && git checkout develop',
  ],
  allow: [
    'git commit -m "feat: x"',
    'npm run check && git add -A && git commit -q -m "a" -m "b"',
    'git commit -m "docs: o hook passa a barrar -n e a branch develop"',
    'git fetch upstream boilerplate',
    'git fetch origin',
    'git push -q origin main',
    'git log --oneline -n 5',
    'git status --short',
    'npm run check',
  ],
}

let failures = 0
for (const [expected, commands] of Object.entries(cases)) {
  for (const command of commands) {
    const { stdout } = spawnSync('node', [hook], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      encoding: 'utf8',
    })
    const actual = stdout.includes('"deny"') ? 'deny' : 'allow'
    if (actual !== expected) failures++
    console.log(`${actual === expected ? 'ok  ' : 'ERRO'} ${expected.padEnd(5)} ${command}`)
  }
}

console.log(failures === 0 ? '\ntodos os casos passaram' : `\n${failures} caso(s) falharam`)
process.exit(failures === 0 ? 0 : 1)
