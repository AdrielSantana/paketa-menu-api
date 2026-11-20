# ADR 0011: Observabilidade mínima: logs estruturados, request id e health check

- **Status:** aceito
- **Data:** 2026-11-19

## Contexto

O boilerplate registrava com `console.log` em texto livre, e um erro 500 ia para o log sem nada que o ligasse à requisição que falhou. A stack da vaga usa CloudWatch e Datadog, que indexam logs em JSON, e roda em Lambda, onde a saída padrão do processo já é o destino dos logs.

O ADR 0010 passou a responder 503 quando o banco cai. Falta um jeito de perguntar ao serviço se ele está apto a atender.

## Decisão

**Logs em JSON, uma linha por evento, na saída padrão.** Um módulo pequeno (`src/logger.ts`), sem dependência nova. Cada linha tem `level`, `time`, `message` e os campos do evento.

- Uma linha por requisição, ao terminar: `requestId`, método, caminho (sem query string), status e duração. O nível acompanha o status: `info`, `warn` para 4xx e `error` para 5xx.
- Uma linha por erro 5xx, com o erro original (nome, mensagem, código e stack) e até três causas encadeadas: o motivo real costuma estar na causa.
- Corpo de requisição e de resposta não são registrados.
- Credenciais em URLs (`mongodb://usuario:senha@host`) são mascaradas antes de gravar: mensagens de erro de conexão costumam carregar a URL.
- `LOG_LEVEL` (`debug`, `info`, `warn`, `error`, `silent`) controla o volume; o padrão é `info` e os testes rodam em `silent`.
- `console` fica proibido em `src/` por regra de lint.

**Toda requisição tem um id.** O serviço aceita o `X-Request-Id` recebido, se tiver formato seguro (8 a 64 caracteres entre letras, números, `.`, `_` e `-`), ou gera um UUID. O id volta no cabeçalho `X-Request-Id` da resposta, entra em todas as linhas de log da requisição e aparece como `requestId` no corpo dos erros (extensão do Problem Details, ADR 0007). Quem recebe um erro tem o que informar ao suporte.

**`GET /health` confere a dependência.** Faz um `ping` no banco: 200 `{ "status": "ok" }` se responder, 503 `SERVICE_UNAVAILABLE` se não. A requisição de health é registrada em nível `debug`, para não poluir o log.

**Encerramento limpo.** Ao receber `SIGTERM` ou `SIGINT`, o servidor para de aceitar conexões, termina as requisições em andamento e fecha a conexão com o banco.

## Alternativas consideradas

- **pino (com pino-http).** É o padrão de mercado e mais rápido. Para o volume deste serviço, um módulo de 40 linhas entrega o mesmo formato sem dependência; trocar depois é mudar um arquivo.
- **Powertools for AWS Lambda.** Padrão em Lambda, com correlação e métricas, mas prende o serviço ao ambiente e não serve ao modo servidor.
- **`AsyncLocalStorage` para propagar o request id.** Necessário quando camadas profundas precisam registrar. Aqui só o middleware de acesso e o de erro registram, e os dois têm a requisição em mãos.
- **Dois endpoints, liveness e readiness.** Faz sentido em Kubernetes ou ECS, onde as duas sondas têm efeitos diferentes. Com uma dependência só, um endpoint basta.
- **Aceitar qualquer `X-Request-Id`.** Um valor com quebra de linha ou muito longo poluiria o log e a resposta.

## Consequências

- O request id recebido não é confiável como identidade: serve só para correlação.
- Métricas e tracing ficam fora. A duração por requisição no log permite derivar latência no CloudWatch ou no Datadog sem instrumentação adicional.
- O mascaramento cobre credenciais em URLs. Outros segredos não devem chegar a mensagens de erro; nomes de menu aparecem no log só dentro de mensagens de erro do banco.
