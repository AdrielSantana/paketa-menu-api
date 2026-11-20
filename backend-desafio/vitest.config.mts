import { defineConfig } from 'vitest/config'

// Dois projetos = dois degraus da pirâmide:
// - unit: funções puras, sem banco nem HTTP.
// - integration: HTTP (supertest) + MongoDB real em memória.
// Os testes rodam sem log; os que conferem o log ligam o nível na hora.
// Todo vi.spyOn é desfeito antes do teste seguinte, sem afterEach em cada arquivo.
const SHARED = { env: { LOG_LEVEL: 'silent' }, restoreMocks: true }

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...SHARED,
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          ...SHARED,
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/setup/mongo-server.ts'],
          setupFiles: ['test/setup/database.ts'],
        },
      },
    ],
  },
})
