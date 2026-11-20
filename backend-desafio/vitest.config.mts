import { defineConfig } from 'vitest/config'

// Dois projetos = dois degraus da pirâmide:
// - unit: funções puras, sem banco nem HTTP.
// - integration: HTTP (supertest) + MongoDB real em memória.
// Os testes rodam sem log; os que conferem o log ligam o nível na hora.
const TEST_ENV = { LOG_LEVEL: 'silent' }

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          env: TEST_ENV,
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          env: TEST_ENV,
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/setup/mongo-server.ts'],
          setupFiles: ['test/setup/database.ts'],
        },
      },
    ],
  },
})
