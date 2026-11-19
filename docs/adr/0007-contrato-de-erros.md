# ADR 0007: Contrato de erros com Problem Details (RFC 9457)

- **Status:** aceito
- **Data:** 2026-11-19

## Contexto

O enunciado só define as respostas de sucesso. O boilerplate responde erros em dois formatos (`{ messages: [...] }` na validação e `{ message }` no resto), e um erro não tratado devolvia uma página HTML com stack trace e caminhos do servidor.

Quem consome a API precisa distinguir os erros por código, sem depender do texto da mensagem.

## Decisão

**Toda resposta de erro da API de menu, e todo erro não tratado do serviço, segue a RFC 9457**, com `Content-Type: application/problem+json`:

```json
{
  "title": "Conflict",
  "status": 409,
  "code": "MENU_NAME_TAKEN",
  "detail": "A menu item named \"LCD\" already exists."
}
```

- `title` e `status` repetem o status HTTP.
- `code` é uma extensão: identificador estável, para o cliente tratar o erro em código.
- `detail` é texto para pessoas e pode mudar.
- Erros de validação trazem também `errors`, a lista de mensagens por campo.

**Status por situação:**

| Status | Quando | `code` |
|---|---|---|
| 400 | Corpo, parâmetro ou query inválidos; JSON malformado | `VALIDATION_FAILED`, `MALFORMED_JSON` |
| 404 | O recurso da URL não existe | `MENU_NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409 | A requisição é válida, mas conflita com o estado atual | `MENU_NAME_TAKEN`, `MENU_HAS_SUBMENUS` |
| 422 | O corpo é válido, mas referencia algo que não existe | `PARENT_NOT_FOUND` |
| 500 | Erro inesperado | `INTERNAL_ERROR` |

Um middleware central converte qualquer erro nesse formato. Erro 500 é registrado em log com o stack e respondido sem detalhes internos.

O corpo aceita só os campos conhecidos (`name` e `relatedId`); campo desconhecido é 400, para que um erro de digitação como `parentId` não seja ignorado em silêncio.

## Alternativas consideradas

- **Manter os formatos do boilerplate.** Sem custo, mas são dois formatos, nenhum com código estável.
- **Formato próprio** (`{ error: { code, message } }`). Resolve, mas reinventa um padrão que já existe e que ferramentas e gateways conhecem.
- **`relatedId` inexistente como 404.** O 404 diz que a URL não existe, e `/api/v1/menu` existe; o cliente seria levado a achar que errou a rota.
- **`relatedId` inexistente como 400.** Defensável, mas mistura "requisição que nunca seria válida" com "requisição válida que depende de um dado que sumiu". O 422 separa as duas.

## Consequências

- As rotas de `user` do boilerplate continuam respondendo validação no formato antigo, para não quebrar a interface existente. Só os erros não tratados delas mudam, de HTML com stack trace para Problem Details.
- A lista de `code` é parte do contrato: renomear um código é mudança incompatível.
- As mensagens ficam em inglês, como as do boilerplate.
