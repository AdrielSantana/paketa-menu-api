import { defineConfig } from 'vitest/config'

// Dois projetos = dois degraus da pirâmide:
// - unit: funções puras, sem banco nem HTTP.
// - integration: HTTP (supertest) + MongoDB real em memória.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/setup/mongo-server.ts'],
          setupFiles: ['test/setup/database.ts'],
        },
      },
    ],
  },
})
