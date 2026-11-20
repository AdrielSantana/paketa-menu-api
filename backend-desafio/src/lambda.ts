import { createHandler } from './adapters/lambda'
import { connectDatabase } from './db/connect'

// Ponto de entrada no Lambda (ADR 0012). Sem MONGO_URL a função falha na
// inicialização, e não a cada requisição.
const MONGO_URL = process.env.MONGO_URL
if (!MONGO_URL) throw new Error('MONGO_URL is required')

// Uma instância atende uma requisição por vez: duas conexões cobrem a
// operação em curso e deixam folga, sem multiplicar conexões no cluster.
const MAX_POOL_SIZE = 2

export const handler = createHandler(() =>
  connectDatabase(MONGO_URL, { maxPoolSize: MAX_POOL_SIZE }),
)
