# ADR 0004: Exclusão de item com filhos exige uma escolha explícita

- **Status:** aceito
- **Data:** 2026-11-19

## Contexto

O enunciado define `DELETE /api/v1/menu/{id}` com resposta 200 e não diz o que acontece com os sub-itens. Apagar a subárvore inteira em silêncio pode destruir muito conteúdo; reposicionar os filhos em silêncio muda a estrutura do menu sem aviso. Qual das duas é a certa é decisão de negócio, não de arquitetura.

## Decisão

A API não escolhe pelo cliente.

| Situação | Resultado |
|---|---|
| Item sem filhos | Apaga. 200 |
| Item com filhos, sem parâmetro | Não apaga. 409 com a explicação das duas opções |
| `?children=cascade` | Apaga o item e toda a subárvore. 200 |
| `?children=promote` | Os filhos diretos passam a apontar para o pai do item apagado (ou viram primeiro nível, se ele era raiz) e só o item é apagado. 200 |
| Id inexistente | 404 |
| Id malformado ou `children` com outro valor | 400 |

A resposta de sucesso é `{ "id": "<id>", "deletedCount": <n> }`.

Na cascata, os descendentes são encontrados com `$graphLookup` a partir do item e removidos com um `deleteMany`. Na promoção, um `updateMany` troca o `relatedId` dos filhos diretos; netos e demais descendentes não são tocados.

Toda exclusão roda em uma transação (ADR 0005).

## Alternativas consideradas

- **Cascata por padrão.** Atende ao enunciado ao pé da letra, mas torna destrutiva a chamada mais simples.
- **Promoção por padrão.** Mantém o 200 do enunciado para qualquer item, sem perda de dados, mas reorganiza o menu sem que o cliente tenha pedido.
- **Só bloquear (409) e obrigar o cliente a apagar folha por folha.** Seguro, mas empurra para o cliente uma operação que o servidor faz de forma atômica.

## Consequências

- O `DELETE` do enunciado continua devolvendo 200 para folhas. Para item com filhos, a primeira chamada sem parâmetro devolve 409; é uma divergência consciente, e a mensagem diz o que fazer.
- Filhos promovidos entram entre os novos irmãos pela ordem de `_id` (ADR 0003), ou seja, pela data de criação, e não na posição do item apagado.
- Uma cascata em subárvore muito grande pode esbarrar nos limites de transação do banco (ADR 0005). Nesse volume, a exclusão passaria a ser assíncrona e em lotes.
