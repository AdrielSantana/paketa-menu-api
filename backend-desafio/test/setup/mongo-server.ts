import { MongoMemoryReplSet } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

// Versão fixada de propósito: a mesma major do docker-compose de desenvolvimento.
export const MONGODB_VERSION = '8.0.26'

// Sobe um replica set de um nó para toda a execução e entrega a URI aos
// testes. Replica set porque o serviço usa transações (ADR 0005).
export default async function setup(project: TestProject) {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: MONGODB_VERSION },
    replSet: { count: 1 },
  })
  project.provide('mongoUri', replSet.getUri())

  return async () => {
    await replSet.stop()
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
  }
}
