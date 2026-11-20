# Regras para agentes de IA neste repositório

Este arquivo é lido pelo agente no início de cada sessão. As regras que podem ser verificadas por máquina também estão em hooks e no CI (ver "Guardas automáticas"); o que está aqui é o que o agente precisa saber para acertar de primeira.

## O projeto

API de gestão de menus (itens e sub-itens com aninhamento infinito), feita sobre o boilerplate do desafio técnico da Paketá. Stack fixada pelo enunciado: Node.js, TypeScript, Express e MongoDB (mongoose), com validação em yup.

- `backend-desafio/`: o serviço. Todos os comandos `npm` rodam aqui dentro.
- `docs/adr/`: decisões de arquitetura. Leia antes de mudar algo que um ADR decidiu.
- `backend-desafio/.docs/`: coleções e exemplos originais do boilerplate. Não edite.

## Comandos

Dentro de `backend-desafio/`:

| Comando | O que faz |
|---|---|
| `npm ci` | Instala as versões exatas do lockfile |
| `npm run check` | Formatação, lint, tipos, testes e build. É a definição de pronto |
| `npm test` | Todos os testes (sobe um MongoDB em memória, não precisa de Docker) |
| `npm run test:unit` / `npm run test:integration` | Um degrau da pirâmide por vez |
| `npm run db:up` e `npm run start` | Banco local (docker compose) e servidor em modo watch |
| `npm run bench:read` | Refaz as medições do ADR 0009 (não faz parte do check) |

## Arquitetura

O fluxo de uma requisição segue o padrão do boilerplate, uma pasta por papel e um arquivo por recurso:

`routes/` → `validation/` (middlewares yup) → `controllers/` (handlers async) → `models/` (schemas mongoose)

- `src/app.ts` monta o app Express. Há dois pontos de entrada sobre ele: `src/index.ts` (servidor HTTP) e `src/lambda.ts` (handler de Lambda, via `src/adapters/lambda.ts`, ADR 0012). Testes importam o `app` ou o adaptador, nunca os pontos de entrada.
- `npm run build` compila `src/` para `build/`, que é o que roda fora do desenvolvimento.
- `src/domain/`: funções puras, sem HTTP nem banco (montagem e serialização da árvore, normalização do nome). Toda regra que couber aqui vem para cá e ganha teste unitário.
- `src/errors.ts` e `src/middlewares/error-handler.ts`: todo erro sai em Problem Details (ADR 0007). Controllers e validações lançam `HttpError` (ou chamam `next` com um); não montam resposta de erro à mão.
- `src/db/transaction.ts`: toda escrita que depende de outro documento roda em `withTransaction` (ADR 0005).
- `src/config.ts`: limites lidos do ambiente e validados no boot. `src/db/connect.ts` é o único ponto de conexão (tempos máximos, índices) e `src/db/errors.ts` classifica os erros do banco (ADR 0010).
- `src/logger.ts` e `src/middlewares/request-context.ts`: logs em JSON com request id (ADR 0011). Em `src/` não se usa `console` (o lint barra); nunca registre corpo de requisição.
- Todo limite novo segue o ADR 0010: explícito, com erro que diz o que fazer e teste que falha sem a guarda.
- Não crie camadas novas (services, repositories, DI) sem um ADR que justifique.

## Convenções

- Formatação é a do `prettier.config.js` da raiz. Não discuta estilo: rode `npm run format`.
- TypeScript em modo `strict`. Sem `any` explícito e sem `@ts-ignore`; se precisar de exceção, comente o motivo na linha.
- Toda promise é aguardada ou tratada (o lint barra promise solta).
- Código, nomes de arquivo e identificadores em inglês, como no boilerplate. Testes, commits, ADRs e documentação em português.

## Como trabalhar

1. **Decisão antes de código.** Mudança de modelagem, de contrato da API ou de dependência precisa de um ADR em `docs/adr/`. Se a decisão não foi tomada, pare e pergunte ao Adriel; não escolha por ele.
2. **Spec antes de implementação.** Escreva primeiro o teste que descreve o comportamento, a partir do enunciado ou do ADR. Um teste escrito antes da implementação entra como `it.fails` ou `it.todo`, para a suíte seguir verde, e perde a marca no commit que o faz passar.
3. **Teste no degrau certo.** Regra pura: teste unitário. Contrato HTTP, índices e comportamento do banco: teste de integração. Cubra os erros esperados (400, 404, 409, 503) e os casos extremos, não só o caminho feliz.
4. **Confira que o teste falha pelo motivo certo.** Um teste novo de regressão deve ser visto falhando sem a correção e passando com ela.
5. **Commits pequenos, em português, no padrão `tipo(escopo): resumo`.** O corpo explica o porquê. Um commit, um assunto.

## Definição de pronto

- `npm run check` passa.
- Todo comportamento novo tem teste; todo bug corrigido tem teste de regressão.
- Decisões tomadas no caminho estão em um ADR.
- O que não foi feito ou não foi verificado está dito no resumo, não escondido.

## Nunca

- Ler, buscar ou fazer checkout das branches `develop`, `feature/refact-aggregate` e `feature/refact-recursive` do upstream: contêm uma solução pronta.
- Fazer push ou abrir PR no repositório da Paketá (`upstream`). A entrega é no `origin`.
- Pular hooks (`--no-verify`, `HUSKY=0`) ou enfraquecer um teste, uma regra de lint ou o `tsconfig` para fazer o check passar.
- Commitar com o check vermelho.
- Afirmar que algo funciona sem ter rodado. Sobre compatibilidade com o DocumentDB, confira a documentação da AWS antes de escrever.
- Adicionar dependência sem dizer por quê no commit.

## Guardas automáticas

| Quando | O que roda | Onde está |
|---|---|---|
| Antes de um comando Bash do agente | Bloqueia os comandos da lista "Nunca" | `.claude/hooks/guard-bash.mjs` |
| Depois de cada arquivo editado pelo agente | Prettier e ESLint no arquivo | `.claude/hooks/format-edited-file.mjs` |
| Antes de o agente encerrar um turno | `npm run check`; se falhar, o agente não encerra | `.claude/hooks/check-before-stop.mjs` |
| Em cada `git commit` | lint-staged e typecheck | `backend-desafio/.husky/pre-commit` |
| Em cada push e pull request | `npm ci` e `npm run check` | `.github/workflows/ci.yml` |
