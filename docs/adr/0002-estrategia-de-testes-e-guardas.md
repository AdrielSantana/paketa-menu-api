# ADR 0002: Estratégia de testes e guardas automáticas

- **Status:** aceito
- **Data:** 2026-11-19

## Contexto

O boilerplate não tinha testes, lint nem CI (`npm test` era um `echo` que falhava). O código deste desafio é escrito por um agente de IA, então a qualidade não pode depender de o agente lembrar das regras: precisa de verificações que rodem sozinhas.

O enunciado não define ferramentas de teste. A vaga pede pirâmide de testes (unitários e integrados, cobrindo casos extremos e erros esperados), mas não cita um runner.

## Decisão

**Um comando como definição de pronto.** `npm run check` roda formatação (Prettier), lint (ESLint), tipos (`tsc --noEmit`) e testes. Todas as guardas chamam esse comando ou uma parte dele.

**Pirâmide em dois projetos do Vitest.**

- `unit`: funções puras, sem banco nem HTTP.
- `integration`: requisições HTTP reais contra o app (supertest) e MongoDB real em memória (mongodb-memory-server), com a versão do servidor fixada.

**Guardas em três camadas**, da mais rápida à mais completa:

| Camada | Quando | O que roda |
|---|---|---|
| Hooks do agente | A cada arquivo editado e ao fim de cada turno | Prettier e ESLint no arquivo; depois o `check` completo, que impede o agente de encerrar se falhar |
| Pre-commit | A cada commit | lint-staged e typecheck |
| CI | A cada push e pull request | `npm ci` e `npm run check` |

As regras do agente ficam em `AGENTS.md`. As que cabem em código (não pular hooks, não tocar no upstream nem nas branches com solução pronta) também são barradas por um hook.

## Alternativas consideradas

- **Jest.** É o runner mais difundido e pode ser o que o time usa, mas precisa de um transformador de TypeScript (ts-jest, Babel ou SWC) e de mais configuração. Os testes usam só `describe`/`it`/`expect`, API que o Vitest compartilha com o Jest; migrar seria trocar imports e configuração.
- **`node:test`.** Zero dependências, mas com menos recursos prontos para separar os degraus da pirâmide e relatar falhas.
- **MongoDB via Docker nos testes.** Deixaria os testes dependentes do Docker local e de um service container no CI. O docker-compose fica só para desenvolvimento.
- **Mocks do mongoose.** Não testariam o que mais importa aqui: índices únicos, filtros e o comportamento real das queries. O bug de `update`/`delete` do `user` só aparece contra um banco de verdade.

## Consequências

- `npm test` funciona do zero, sem Docker. A primeira execução baixa o binário do mongod (cerca de 80 MB); o CI guarda esse binário em cache.
- Os testes rodam contra MongoDB, não contra DocumentDB. Compatibilidade de operadores com o DocumentDB é verificada na documentação da AWS e registrada no ADR da decisão que depender dela.
- O `check` completo leva poucos segundos hoje. O hook de fim de turno guarda uma impressão digital do estado do código e não roda de novo se nada mudou.
- O pre-commit não roda os testes, para continuar rápido. Um commit com teste quebrado ainda é possível à mão; o hook de fim de turno e o CI são as camadas que pegam isso.
- `it.fails` aceita qualquer falha, inclusive erro do próprio teste (aconteceu no teste do `PUT /user`). Por isso a regra de conferir que o teste falha pelo motivo certo.
