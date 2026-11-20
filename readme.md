# API de Menu

[![CI](https://github.com/AdrielSantana/paketa-menu-api/actions/workflows/ci.yml/badge.svg)](https://github.com/AdrielSantana/paketa-menu-api/actions/workflows/ci.yml)

Solução do [desafio de backend da Paketá](./backend-desafio/readme.md): um serviço de gestão de menus com itens e sub-itens em aninhamento infinito, um registro por item, em Node.js, TypeScript, Express e MongoDB, sobre a arquitetura do boilerplate.

Feito por Adriel Santana com apoio de IA. O que eu decidi, o que a IA fez e o que as guardas pegaram estão em [docs/ai-workflow.md](./docs/ai-workflow.md).

## Rodar

Tudo dentro de `backend-desafio/`, com Node 24 (`.nvmrc`).

```sh
npm ci
npm run check          # formatação, lint, tipos, 164 testes e build. Não precisa de Docker
```

Para subir o servidor:

```sh
cp .env.example .env
npm run db:up          # MongoDB 8.0 em replica set, via docker compose
npm run start          # http://localhost:8000
```

## A API

| Método e rota | Sucesso | O que faz |
|---|---|---|
| `POST /api/v1/menu` | 201 `{ "id" }` | Cria um item. Corpo: `name` (único) e `relatedId` opcional (id do pai) |
| `GET /api/v1/menu` | 200 | Devolve o menu inteiro, aninhado |
| `DELETE /api/v1/menu/{id}` | 200 `{ "id", "deletedCount" }` | Apaga um item. Com filhos, exige `?children=cascade` ou `?children=promote` |
| `GET /health` | 200 `{ "status": "ok" }` | Confere se o banco responde |

```sh
curl -X POST localhost:8000/api/v1/menu -H 'content-type: application/json' -d '{"name":"Informática"}'
# {"id":"6affa040fcba1f320335f21e"}

curl -X POST localhost:8000/api/v1/menu -H 'content-type: application/json' \
  -d '{"name":"Computadores","relatedId":"6affa040fcba1f320335f21e"}'
# {"id":"6affa040fcba1f320335f21f"}

curl localhost:8000/api/v1/menu
# [{"id":"6affa040fcba1f320335f21e","name":"Informática","submenus":[{"id":"6affa040fcba1f320335f21f","name":"Computadores"}]}]

curl -X DELETE localhost:8000/api/v1/menu/6affa040fcba1f320335f21e
# 409 {"code":"MENU_HAS_SUBMENUS","detail":"... \"?children=cascade\" deletes the item and its whole subtree; \"?children=promote\" moves its direct submenus to the parent of the deleted item.", ...}

curl -X DELETE 'localhost:8000/api/v1/menu/6affa040fcba1f320335f21e?children=promote'
# {"id":"6affa040fcba1f320335f21e","deletedCount":1}
```

Erros saem em Problem Details (RFC 9457), com um `code` estável e o `requestId` da requisição:

| Status | `code` |
|---|---|
| 400 | `VALIDATION_FAILED`, `MALFORMED_JSON`, `REQUEST_REJECTED` |
| 404 | `MENU_NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409 | `MENU_NAME_TAKEN`, `MENU_HAS_SUBMENUS`, `MENU_LIMIT_REACHED`, `MENU_SUBTREE_TOO_LARGE` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 422 | `PARENT_NOT_FOUND` |
| 500 | `INTERNAL_ERROR` |
| 503 | `SERVICE_UNAVAILABLE` |

As coleções do Insomnia e do Postman do boilerplate continuam em `backend-desafio/.docs/`.

## Decisões

Cada decisão tem um ADR curto em [docs/adr](./docs/adr), com contexto, alternativas e consequências.

| Tema | Decisão | ADR |
|---|---|---|
| Boilerplate | Mantive a stack do enunciado e atualizei as versões (Express 5, mongoose 9, TypeScript 6, Node 24). Corrigi um bug das rotas de `user`, com teste | [0001](./docs/adr/0001-atualizar-dependencias-mantendo-a-stack.md) |
| Testes e guardas | Pirâmide com Vitest: funções puras em teste unitário, HTTP e banco em teste de integração com MongoDB real em memória | [0002](./docs/adr/0002-estrategia-de-testes-e-guardas.md) |
| Modelo de dados | Um documento por item, só com a referência ao pai. Id é o ObjectId | [0003](./docs/adr/0003-modelo-de-dados-referencia-ao-pai-e-graphlookup.md) |
| Excluir item com filhos | A API não escolhe pelo cliente: 409 até ele dizer `cascade` ou `promote` | [0004](./docs/adr/0004-exclusao-de-item-com-filhos.md) |
| Consistência | Transação em toda escrita que depende de outro documento; replica set em todos os ambientes | [0005](./docs/adr/0005-transacoes-e-replica-set.md) |
| Nome único | Índice único em uma chave normalizada: sem diferenciar maiúsculas nem espaços | [0006](./docs/adr/0006-unicidade-e-normalizacao-do-nome.md) |
| Erros | Problem Details com `code` estável | [0007](./docs/adr/0007-contrato-de-erros.md) |
| Aninhamento infinito | Montagem e serialização da árvore sem recursão | [0008](./docs/adr/0008-serializacao-sem-recursao.md) |
| Leitura | `find` para o menu inteiro, `$graphLookup` só na cascata, escolhidos por medição | [0009](./docs/adr/0009-menu-inteiro-com-find-graphlookup-so-na-cascata.md) |
| Limites | Teto de itens, tamanho de corpo, tempo máximo no banco e 503 quando o banco cai | [0010](./docs/adr/0010-limites-e-tratativas-de-falha.md) |
| Observabilidade | Logs em JSON com request id, `/health`, encerramento limpo | [0011](./docs/adr/0011-observabilidade-minima.md) |
| Lambda | O mesmo app Express atrás de um handler de Lambda | [0012](./docs/adr/0012-adaptador-de-lambda.md) |

### Onde me afastei do enunciado, de propósito

- **`DELETE` de um item com filhos devolve 409** até o cliente escolher o que fazer com eles. O enunciado só diz "200" e não define o destino dos sub-itens; apagar ou reposicionar em silêncio é decisão de negócio (ADR 0004). Para folhas, o `DELETE` devolve 200 como pedido.
- **Os ids são ObjectId**, não `"1"`, `"2"` como no exemplo. Os motivos contra id sequencial estão no ADR 0003.
- **O menu tem um teto de 10 mil itens**, configurável. Como o `GET` devolve tudo, sem teto a resposta não tem tamanho máximo (ADR 0010).

### O que as medições mudaram

A primeira versão lia o menu com `$graphLookup`. Medi com 1 milhão de itens: 108,9 s, contra 1,2 s de um `find` da coleção, e erro acima de 100 MB sob uma mesma raiz. Comparei também com array de ancestrais (tempo, CPU do banco, idas ao banco, armazenamento e custo de promoção). Ficou o modelo mais simples, com o operador certo para cada caso. Os números estão no ADR 0009, e `npm run bench:read` refaz as medições.

## Limites conhecidos

- **Tamanho:** 10 mil itens (`MENU_MAX_ITEMS`). No pior caso a resposta tem 3,6 MB, abaixo dos 6 MB de uma invocação síncrona de Lambda.
- **Nome:** 1 a 100 caracteres, sem caracteres de controle. A unicidade é global, como pede o enunciado, e ignora maiúsculas, espaços e caracteres invisíveis.
- **Ordem:** irmãos saem na ordem de criação. Não há campo de posição.
- **DocumentDB:** a cascata usa `$graphLookup`, que só existe a partir do DocumentDB 8.0.2. Nada foi executado contra um cluster DocumentDB; o que os ADRs dizem sobre ele vem da documentação da AWS, com a data da consulta.

## Rodar em Lambda

`npm run build` gera `build/`, e o handler é `build/lambda.handler`. Ele usa o mesmo app Express, conecta no banco uma vez por instância e responde 503 se a conexão falhar. É testado com eventos de API Gateway (HTTP API e REST API). Não fiz deploy nem infraestrutura como código; o desenho do deploy está no [ADR 0012](./docs/adr/0012-adaptador-de-lambda.md).

## Testes e guardas

- **164 testes**: 65 unitários (incluindo testes de propriedades com fast-check) e 99 de integração (HTTP com supertest, eventos de Lambda, o servidor subindo em um processo de verdade e MongoDB 8.0 em memória, em replica set).
- **Concorrência:** criar um sub-item enquanto o pai é apagado nunca deixa órfão. O teste falha se a trava da transação for removida.
- **Conferência por mutação:** em cada entrega injetei defeitos de propósito no código e conferi se os testes pegavam. De 54 defeitos, 52 foram detectados; os dois que passaram mostraram um trecho redundante e uma asserção fraca, ambos corrigidos.
- **Revisão independente:** uma revisão automática de todo o código apontou 10 problemas. Os 10 foram reproduzidos em teste antes de corrigir.
- **`npm run check`** é a definição de pronto e roda em três lugares: nos hooks do agente de IA, no pre-commit (husky) e no CI (GitHub Actions).

As regras que o agente de IA segue neste repositório estão em [AGENTS.md](./AGENTS.md).

## Estrutura

```
backend-desafio/
  src/
    app.ts            monta o Express; index.ts (servidor) e lambda.ts (Lambda) são os pontos de entrada
    routes/ validation/ controllers/ models/    o fluxo do boilerplate, um arquivo por recurso
    domain/           funções puras: montagem e serialização da árvore, normalização do nome
    db/               conexão, transação e classificação de erros do banco
    middlewares/      request id com log de acesso, e saída única de erros
    adapters/         handler de Lambda
  test/unit  test/integration
  scripts/            medições do ADR 0009
docs/adr/             decisões
docs/ai-workflow.md   como a IA foi usada
AGENTS.md  .claude/   regras e hooks do agente
```

## O que eu faria em seguida

- Validar em um cluster DocumentDB 8.0, em especial a cascata dentro de transação.
- Infraestrutura como código e deploy do Lambda.
- Cache da árvore pronta com invalidação na escrita, se a leitura crescer.
- Endpoint por nível (`GET /api/v1/menu/{id}/submenus`, paginado), se o menu precisar passar do teto.
- Autenticação e limite de requisições no API Gateway.
