import { type LogLevel, config } from './config'

type Fields = Record<string, unknown>

const WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
}

// Usuário e senha em URLs, como em `mongodb://usuario:senha@host`. Mensagens
// de erro de conexão costumam carregar a URL inteira.
const CREDENTIALS_IN_URL = /(\w[\w+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/g

export const redactSecrets = (text: string): string =>
  text.replace(CREDENTIALS_IN_URL, '$1***:***@')

interface SerializedError {
  name?: string
  message: string
  code?: unknown
  stack?: string
  cause?: SerializedError
}

// Quantas causas encadeadas vão para o log. O motivo real de uma falha
// costuma estar na causa, não no erro que a embrulhou.
const MAX_CAUSE_DEPTH = 3

export const serializeError = (error: unknown, depth = 0): SerializedError => {
  if (!(error instanceof Error)) return { message: String(error) }

  const { code } = error as { code?: unknown }
  return {
    name: error.name,
    message: error.message,
    ...(code === undefined ? {} : { code }),
    stack: error.stack,
    ...(error.cause === undefined || depth >= MAX_CAUSE_DEPTH
      ? {}
      : { cause: serializeError(error.cause, depth + 1) }),
  }
}

// Uma linha JSON por evento na saída padrão, que é de onde CloudWatch e
// Datadog leem (ADR 0011). O mascaramento vale para a linha inteira.
const write = (level: Exclude<LogLevel, 'silent'>, message: string, fields: Fields) => {
  if (WEIGHT[level] < WEIGHT[config.logLevel]) return

  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...fields,
  })
  process.stdout.write(redactSecrets(line) + '\n')
}

export const logger = {
  debug: (message: string, fields: Fields = {}) => write('debug', message, fields),
  info: (message: string, fields: Fields = {}) => write('info', message, fields),
  warn: (message: string, fields: Fields = {}) => write('warn', message, fields),
  error: (message: string, fields: Fields = {}) => write('error', message, fields),
}
