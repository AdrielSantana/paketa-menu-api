import { MongoMemoryServer } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

// Versão fixada de propósito: a mesma major do docker-compose de desenvolvimento.
const MONGODB_VERSION = '8.0.26'

// Sobe um único mongod para toda a execução e entrega a URI aos testes.
export default async function setup(project: TestProject) {
  const mongod = await MongoMemoryServer.create({ binary: { version: MONGODB_VERSION } })
  project.provide('mongoUri', mongod.getUri())

  return async () => {
    await mongod.stop()
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
  }
}
