import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['build/', 'coverage/'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    // Lint com informação de tipos só onde ele paga o custo: uma promise
    // esquecida (sem await) em handler ou teste vira erro silencioso.
    files: ['**/*.ts', '**/*.mts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  // Desliga regras de estilo que brigariam com o Prettier.
  prettier,
)
