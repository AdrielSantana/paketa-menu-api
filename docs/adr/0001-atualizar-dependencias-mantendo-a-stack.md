# ADR 0001: Atualizar as dependências mantendo a stack do boilerplate

- **Status:** aceito
- **Data:** 2026-11-19

## Contexto

O boilerplate é de 2022: Express 4, mongoose 6, yup 0.32, TypeScript 4.5, `ts-node` + `nodemon`, Node >= 14. O `package-lock.json` estava no `.gitignore`, então cada instalação resolvia versões diferentes. Numa instalação limpa em novembro de 2026:

- `tsc --noEmit` falhava (conflito entre `@types/node` 17 e TypeScript 4.9.5);
- `npm audit` apontava 3 vulnerabilidades altas;
- uma rejeição em handler async derrubava o processo, porque o Express 4 não captura promises rejeitadas e o Node >= 15 encerra em rejeição não tratada.

O enunciado pede Node.js + TypeScript + Express + MongoDB "em cima da arquitetura do boilerplate".

## Decisão

Manter a stack e a arquitetura (routes → validation → controller → model, mongoose, yup) e atualizar as versões:

| Pacote | Antes | Depois |
|---|---|---|
| Node | >= 14 | 24 (`.nvmrc` e `engines`) |
| express | 4.x | 5.3 |
| mongoose | 6.x | 9.12 |
| yup | 0.32 | 1.7 |
| typescript | 4.x | 6.0 |
| `ts-node` + `nodemon` | 10.x / 2.x | `tsx watch` |

O `package-lock.json` passa a ser versionado.

A atualização foi feita **depois** de montar os testes de integração do CRUD existente, para que a suíte servisse de rede de proteção.

## Alternativas consideradas

- **Manter as versões de 2022 e só travar o lockfile.** Diff menor contra a base, mas entregaria um serviço novo sobre dependências antigas, com `tsc` quebrado e sem tratamento de erro async.
- **TypeScript 7.** É a `latest` no npm, mas o `typescript-eslint` 8.73 só aceita `typescript < 6.1`. Fica para quando o lint suportar.
- **Trocar peças da stack** (zod no lugar do yup, outro framework HTTP). Fora do que o enunciado pede.

## Consequências

- `npm ci` reprodutível, `tsc --noEmit` limpo e `npm audit` sem vulnerabilidades.
- Express 5 encaminha rejeições de handlers async ao middleware de erro: o mesmo request que derrubava o processo agora devolve 500 e o servidor segue de pé. Ainda falta um middleware de erro que responda em JSON.
- `mongoose.connect` com callback não existe mais desde o mongoose 7; o `index.ts` passou a usar a promise.
- O `strictQuery` voltou a ser `false` por padrão no mongoose 7. Isso muda a forma do bug de `update`/`delete` do `user` (filtro `{ id }`): antes atingia o primeiro documento da coleção, agora não atinge nenhum e responde 200. Os testes `it.fails` pegam os dois casos.
- No `@types/express` 5, `req.params.id` é `string | string[]`; os handlers tipam os params explicitamente.
- `mongoose` 9 e `vitest` 5 exigem Node >= 20.19 / 22.12; quem estiver em Node antigo precisa atualizar.
