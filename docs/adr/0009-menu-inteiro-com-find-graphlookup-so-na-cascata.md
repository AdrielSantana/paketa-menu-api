# ADR 0009: Menu inteiro lido com `find`; `$graphLookup` só na cascata

- **Status:** aceito
- **Data:** 2026-11-19
- **Altera:** ADR 0003, na forma de ler o menu no `GET`. O modelo de dados não muda.

## Contexto

O ADR 0003 decidiu percorrer a hierarquia com `$graphLookup` nos dois lugares em que o serviço lê mais de um nível: o `GET` do menu inteiro e a exclusão em cascata.

Depois de implementado, medimos o `GET` com volumes grandes (ADR 0003, "Medições"). Ele passou de 100 segundos com 1 milhão de itens e falhou com 400 mil itens sob uma mesma raiz. Para decidir o que fazer, comparamos três desenhos no mesmo banco:

1. **Hoje:** cada item guarda só o pai; o `GET` usa `$graphLookup`.
2. **Mesmo modelo, outro operador:** o `GET` lê a coleção com um `find` projetado.
3. **Array de ancestrais:** cada item guarda também os ids de todos os seus pais, com índice no array.

Medido em 2026-11-19, MongoDB 8.0.26 (replica set de um nó, em memória), na máquina de desenvolvimento. Mediana de três execuções; com 1 milhão de itens, uma execução. O script está em `backend-desafio/scripts/bench-menu-read.ts` (`npm run bench:read`).

### Ler o menu inteiro

Tempo até as linhas chegarem na aplicação, com a CPU do mongod entre parênteses:

| Itens | 1. `$graphLookup` | 2. `find`, mesmo modelo | 3. `find`, com ancestrais |
|---|---|---|---|
| 10 mil (100 raízes de 100) | 22 ms (20 ms) | 11 ms (~0) | 9 ms (~0) |
| 100 mil (1.000 raízes de 100) | 0,9 s (0,85 s) | 0,11 s (0,01 s) | 0,11 s (0,01 s) |
| 100 mil sob 1 raiz | 3,2 s (3,2 s) | 0,11 s (0,02 s) | 0,11 s (0,02 s) |
| 1 milhão (1.000 raízes de 1.000) | 108,9 s (108,4 s) | 1,2 s (0,19 s) | 1,2 s (0,22 s) |

- O tempo do desenho 1 é CPU do banco dentro do estágio `$graphLookup`. Não vem das consultas por nível: com `maxDepth: 0` o tempo foi o mesmo. Dobrar os descendentes de uma raiz multiplicou o tempo por 3,6 a 3,9. A causa interna não foi investigada.
- Idas ao banco: 1 a 5 comandos no desenho 1, 2 a 6 nos outros (o `find` e os lotes seguintes).
- Na aplicação, memória e CPU são equivalentes nos três: as mesmas linhas, a mesma montagem (`buildMenuTree`) e a mesma serialização.
- Para devolver tudo, o desenho 3 faz o mesmo `find` do desenho 2. O array de ancestrais não ajuda o `GET`.

### Armazenamento

Com 1 milhão de itens em 4 níveis:

| | Só o pai | Com array de ancestrais |
|---|---|---|
| Documento médio | 138 bytes | 197 bytes |
| Dados, sem compressão | 132 MB | 189 MB |
| Dados em disco | 21,5 MB | 29,2 MB |
| Índices | 110 MB | 182 MB |

O array cresce com a profundidade. Em uma cadeia de 2.000 níveis: 0,3 MB de dados e 0,3 MB de índices só com o pai; 33 MB de dados e 46 MB de índices com ancestrais.

### Subárvore e promoção

| Operação | Só o pai | Com array de ancestrais |
|---|---|---|
| Ler os ids de uma subárvore de 100 itens | 1 ms (`$graphLookup`) | 1 ms |
| Ler os ids de uma subárvore de 1.000 itens | 3 ms (`$graphLookup`) | 2 ms |
| Ler os ids de uma subárvore de 100 mil itens | 3,2 s (`$graphLookup`) | 84 ms |
| Promover os filhos de um item com 100 mil descendentes | 10 documentos, 6 ms | 100.009 documentos, 666 ms |
| Promover em uma cadeia de 2.000 níveis | 1 documento, 4 ms | 2.000 documentos, 347 ms |

## Decisão

**Cada operação usa a estratégia que mediu melhor para ela.**

- **O modelo continua o do ADR 0003:** um documento por item, só com a referência ao pai.
- **`GET` do menu inteiro: um `find` projetado (`name` e `relatedId`) da coleção.** Devolver tudo não é um problema de grafo: a resposta é a coleção. A árvore continua sendo montada por `buildMenuTree` e serializada por `serializeMenuTree`.
- **Exclusão em cascata: `$graphLookup` a partir do item.** Aqui o banco seleciona uma parte do grafo, e a aplicação não precisa carregar a coleção para apagar uma subárvore.

## Alternativas consideradas

- **Manter o `$graphLookup` no `GET`.** Em um menu de tamanho real a diferença é de milissegundos, mas o custo cresce quase com o quadrado dos itens por raiz e há um teto de 100 MB por execução.
- **Array de ancestrais.** Só ganha ao ler uma subárvore grande. Custa mais disco e mais índice, cresce com a profundidade e reescreve todos os descendentes em cada promoção, dentro da transação.
- **Cascata também sem `$graphLookup`**, com uma consulta por nível feita pela aplicação. Remove o teto de 100 MB, mas troca uma ida ao banco por uma por nível, todas dentro da transação.

## Consequências

- O `GET` cresce de forma linear com o número de itens e deixa de ter o teto de 100 MB do `$graphLookup` e o de 16 MB por raiz.
- O `GET` deixa de depender do DocumentDB 8.0.2. A cascata continua dependendo.
- O `find` também lê itens inalcançáveis (órfãos, ciclos), que a API não cria (ADR 0005). `buildMenuTree` os descarta, e há teste para isso.
- A aplicação continua segurando o menu inteiro em memória para montar a resposta, como antes. Os limites que sobram no `GET` são os da resposta: 6 MB em Lambda com invocação síncrona, cerca de 110 mil itens.
- A cascata em uma subárvore muito grande continua limitada: 3,2 s com 100 mil descendentes e erro acima de 100 MB, além dos limites de transação (ADR 0005).
- Nada disso foi medido no DocumentDB, que é outro motor.
