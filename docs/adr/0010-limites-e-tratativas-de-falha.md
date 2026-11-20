# ADR 0010: Limites explícitos e tratativas de falha

- **Status:** aceito
- **Data:** 2026-11-19

## Contexto

O enunciado pede que o `GET` devolva o menu inteiro, sem paginação. Uma resposta sem limite de tamanho quebra em algum ponto, e quebra mal: resposta cortada pela infraestrutura, tempo esgotado ou erro 500 sem explicação. As medições dos ADRs 0003 e 0009 mostraram onde:

- em Lambda com invocação síncrona, a resposta é limitada a 6 MB;
- o `$graphLookup` da cascata falha acima de 100 MB (erro 40099);
- nenhuma operação no banco tinha tempo máximo.

Também medimos o que acontece quando o banco cai depois do boot (MongoDB 8.0.26, 2026-11-19): uma consulta espera a seleção de servidor (30 segundos por padrão no driver) e uma transação espera a fila do mongoose (10 segundos). As duas terminavam em 500 `INTERNAL_ERROR`, o mesmo código de um bug do serviço.

O contexto da vaga é uma fintech: um limite conhecido e um erro explicado valem mais do que uma promessa de "infinito" que falha em produção.

## Decisão

**Todo limite do serviço é explícito, configurável quando faz sentido e respondido com um erro que diz o que fazer.**

| Guarda | Regra | Resposta |
|---|---|---|
| Teto de itens | `MENU_MAX_ITEMS`, padrão 10.000. Conferido antes de criar | 409 `MENU_LIMIT_REACHED` |
| Caracteres do nome | Sem caracteres de controle e sem Unicode malformado (surrogate solto) | 400 `VALIDATION_FAILED` |
| Tamanho do corpo | Até 10 KB | 413 `PAYLOAD_TOO_LARGE` |
| Cascata maior do que o banco percorre | Erro 40099 do `$graphLookup` | 409 `MENU_SUBTREE_TOO_LARGE` |
| Banco lento | `DB_TIMEOUT_MS`, padrão 5.000, como `maxTimeMS` nas consultas e agregações | 503 `SERVICE_UNAVAILABLE`, com `Retry-After` |
| Banco fora do ar | Seleção de servidor e fila de espera limitadas ao mesmo `DB_TIMEOUT_MS` | 503 `SERVICE_UNAVAILABLE`, com `Retry-After` |
| Configuração inválida | Variável de ambiente fora do formato | O serviço não sobe |
| Cabeçalho `X-Powered-By` | Removido | |

**Por que 10.000 itens.** Com o nome limitado a 100 caracteres e sem caracteres de controle, um item ocupa no máximo 359 bytes na resposta. Dez mil itens cabem em 3,6 MB no pior caso, abaixo dos 6 MB do Lambda, e o `GET` responde em dezenas de milissegundos (ADR 0009). Há um teste que monta esse pior caso.

**O teto é aproximado de propósito.** A conferência usa a contagem estimada da coleção, que não percorre documentos. Criações simultâneas podem passar do teto por, no máximo, o número de requisições em voo. Um teto exato exigiria um contador que toda criação disputa, o mesmo problema do id sequencial (ADR 0003), para proteger um limite que é de tamanho de resposta, não de negócio.

**503 separa "dependência indisponível" de "erro do serviço".** O cliente sabe que pode tentar de novo, e o alerta de 500 deixa de disparar por queda do banco. São tratados como indisponibilidade: tempo esgotado no banco (erro 50), falha de seleção de servidor, erro de rede e qualquer erro inesperado enquanto a conexão está caída.

## Alternativas consideradas

- **Paginar o `GET`.** Contraria o enunciado, e paginar por raiz não limita nada: uma raiz pode conter o menu inteiro.
- **Limitar a profundidade.** O requisito é aninhamento infinito. A profundidade fica limitada só pelo teto de itens.
- **Conferir o tamanho na leitura** e recusar o `GET` acima do limite. Falharia em toda leitura, em vez de falhar na escrita que criou o problema.
- **Rate limiting e autenticação dentro do serviço.** Na stack da vaga isso é papel do API Gateway e do WAF; um contador em memória não funciona entre instâncias de Lambda.

## Consequências

- O contrato de erros (ADR 0007) ganha quatro códigos: `MENU_LIMIT_REACHED`, `MENU_SUBTREE_TOO_LARGE`, `PAYLOAD_TOO_LARGE` e `SERVICE_UNAVAILABLE`.
- Quem precisar de mais de 10 mil itens sobe o `MENU_MAX_ITEMS` sabendo o que vem junto: resposta maior que 6 MB a partir de uns 110 mil itens com nomes curtos e cascata mais lenta (ADR 0009).
- O `maxTimeMS` é aceito pelo DocumentDB nas versões 3.6 a 8.0, mas não nos clusters elásticos (documentação da AWS, conferida em 2026-11-19).
- A queda real da conexão é testada desconectando o mongoose. O tempo esgotado e o erro 40099 são testados com o erro simulado; os dois foram observados de verdade nas medições.
- Inserções não recebem `maxTimeMS`: o mongoose só o aplica a consultas. Ficam protegidas pela seleção de servidor e pela fila de espera.
