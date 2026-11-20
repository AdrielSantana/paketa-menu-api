type Env = Record<string, string | undefined>

// Variável ausente usa o padrão; variável fora do formato derruba o boot.
// Subir com um limite errado em silêncio é pior do que não subir (ADR 0010).
const positiveInteger = (env: Env, name: string, fallback: number): number => {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback

  const value = Number(raw)
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`)
  }
  return value
}

// Em ordem de severidade: o logger compara pela posição.
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

const logLevel = (env: Env, fallback: LogLevel): LogLevel => {
  const raw = env.LOG_LEVEL
  if (raw === undefined || raw === '') return fallback
  if (!LOG_LEVELS.includes(raw as LogLevel)) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${raw}"`)
  }
  return raw as LogLevel
}

export const DEFAULT_MENU_MAX_ITEMS = 10_000

// Bem acima do maior corpo válido (um nome de 100 caracteres e um id).
export const REQUEST_BODY_LIMIT = '10kb'

// Segundos sugeridos ao cliente em uma resposta 503.
export const RETRY_AFTER_SECONDS = 5

export const loadConfig = (env: Env) => ({
  /** Porta do servidor HTTP. O Lambda não usa. */
  port: positiveInteger(env, 'PORT', 8000),
  /** Teto de itens do menu: mantém o GET dentro de um tamanho conhecido. */
  menuMaxItems: positiveInteger(env, 'MENU_MAX_ITEMS', DEFAULT_MENU_MAX_ITEMS),
  /** Tempo máximo de uma operação no banco e de espera por conexão. */
  dbTimeoutMs: positiveInteger(env, 'DB_TIMEOUT_MS', 5_000),
  /** Menor nível que vai para o log (ADR 0011). */
  logLevel: logLevel(env, 'info'),
})

export const config = loadConfig(process.env)
