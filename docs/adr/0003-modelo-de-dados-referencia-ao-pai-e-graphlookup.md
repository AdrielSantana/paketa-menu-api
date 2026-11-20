# ADR 0003: Modelo de dados com referência ao pai, ObjectId e `$graphLookup`

- **Status:** aceito; a leitura do menu no `GET` foi alterada pelo ADR 0009
- **Data:** 2026-11-19

## Contexto

O enunciado pede um menu com aninhamento infinito em que cada item é um registro único no banco, criado com `name` e um `relatedId` opcional que aponta para o pai. As operações são criar, excluir e consultar o menu inteiro.

Três pontos do material original se contradizem:

- o enunciado diz que `relatedId` é `Number`, mas o exemplo passa `"1"`;
- `.docs/menus-documents.json` usa `_id` e `relatedId` como strings sequenciais;
- `.docs/menus-tree.json` usa `nome` em vez de `name` e tem um `submenus` que é objeto em vez de array.

A vaga usa DocumentDB. Conferido na documentação da AWS em 2026-11-19: o `$graphLookup` existe no DocumentDB a partir da versão 8.0.2 e não existe nas versões 3.6, 4.0, 5.0 nem nos Elastic clusters.

## Decisão

**Um documento por item, com referência ao pai** (lista de adjacência):

```
{ _id: ObjectId, name: String, nameKey: String, relatedId: ObjectId | null, createdAt, updatedAt }
```

- `relatedId: null` marca um item de primeiro nível. Índice em `relatedId`.
- `nameKey` é a chave de unicidade do nome (ADR 0006).

**Id é o `_id` ObjectId**, devolvido como string. `relatedId` é aceito como string de 24 caracteres hexadecimais. Um número é recusado com 400.

**A hierarquia é percorrida pelo banco com `$graphLookup`**, tanto para montar o menu (`GET`) quanto para achar a subárvore na exclusão em cascata (ADR 0004). O ambiente de referência é MongoDB 8.0, compatível com DocumentDB 8.0.

**O `GET` usa um pipeline só** (alterado pelo ADR 0009: hoje é um `find` da coleção)**:** `$match` nos itens de primeiro nível, `$graphLookup` descendo por `relatedId` e `$project` com `_id`, `name` e `relatedId`. O banco devolve, para cada raiz, a lista plana dos seus descendentes; uma função pura (`buildMenuTree`) transforma essa lista no JSON aninhado.

**Irmãos são ordenados por `_id` crescente**, que acompanha a ordem de criação. A ordenação é feita na aplicação, porque o `$graphLookup` não garante a ordem do array de resultado.

Seguimos o enunciado onde o material diverge: campo `name`, `submenus` sempre array e ausente nas folhas.

## Por que não id sequencial

- Exige um contador compartilhado: uma escrita a mais por criação e um documento que toda criação disputa.
- Só funciona com incremento atômico, e mesmo assim deixa buracos quando uma transação aborta.
- É previsível: expõe o volume de registros e facilita varrer a API id por id.
- Não permite gerar o id fora do banco (no driver, em outro serviço, em outra região) sem coordenação.
- Colide ao juntar dados de ambientes diferentes.

O ObjectId é gerado pelo driver sem ida ao banco, é único sem coordenação e ordena aproximadamente por tempo. O custo é não reproduzir os ids `"1"`, `"2"` do exemplo, que são ilustrativos.

## Alternativas consideradas

- **Array de ancestrais** (cada item guarda os ids de todos os pais). Lê a subárvore e a ancestralidade com uma consulta indexada, sem recursão, e roda em DocumentDB 4.0+. Mas promover ou mover um item obriga a reescrever o array em todos os descendentes. Com as duas estratégias de exclusão do ADR 0004, a promoção passou a ser operação de primeira classe, e aí o modelo fica caro justamente na escrita.
- **Materialized path** (caminho como string). Mesmas vantagens e o mesmo custo de reescrita, com consulta por prefixo.
- **Nested sets.** Leitura de subárvore muito barata, mas cada inserção renumera parte da coleção. Ruim para um menu que recebe escritas.
- **Uma consulta `find` da coleção inteira e montagem em memória.** É a opção mais simples e, para devolver o menu inteiro, lê os mesmos documentos. Descartada aqui porque deixaria a aplicação responsável por percorrer o grafo também na exclusão, carregando a coleção para apagar uma subárvore. Depois das medições, o ADR 0009 adotou o `find` só para o `GET` e manteve o `$graphLookup` na exclusão.
- **N consultas recursivas** (uma por nível ou por item). Uma ida ao banco por nível; cresce com a profundidade.

## Consequências

- Promover, e um futuro "mover", custam uma escrita por filho direto.
- **Limites do `$graphLookup`.** O estágio tem limite de 100 MB de memória. No DocumentDB ele não aceita `allowDiskUse` e devolve erro ao ultrapassar. No MongoDB 8.0.26 o comportamento medido é o mesmo: erro 40099 (`$graphLookup reached maximum memory consumption`), inclusive com `allowDiskUse: true`. A documentação atual do MongoDB descreve gravação em disco nesse caso, o que essa versão não fez. Além disso, cada raiz com seus descendentes é um documento de resultado, sujeito ao limite de 16 MB do BSON.
- **Escala.** Devolver o menu inteiro em uma resposta é o que limita o desenho, em qualquer modelo. Para volumes grandes, o caminho é carregar por nível (`GET` com o id do pai), cachear a árvore pronta e invalidar na escrita. Os números estão em "Medições".
- **Dependência de versão.** Em um cluster DocumentDB anterior ao 8.0.2 este desenho não roda; a alternativa seria o array de ancestrais.
- **Ciclos.** Criar exige que o pai já exista, excluir remove e promover aponta os filhos para um ancestral. Nenhuma dessas operações fecha um ciclo. Uma operação de "mover" precisaria checar, na mesma transação, que o novo pai não é descendente do item.
- A ordem por `_id` acompanha a criação dentro de um mesmo processo. Entre processos diferentes, no mesmo segundo, a ordem é determinística mas pode não ser a de chegada. Se a ordem do menu virar requisito de negócio, entra um campo de posição.

## Medições

Medido em 2026-11-19 com MongoDB 8.0.26 (replica set de um nó, em memória), na máquina de desenvolvimento, com nomes curtos (cerca de 54 bytes por item na resposta). Até 10 mil itens, mediana de 7 execuções; acima disso, uma execução. Servem para ordem de grandeza, não como benchmark.

| Itens | Forma | `GET` completo | Resposta | `find` projetado da coleção (só a leitura) |
|---|---|---|---|---|
| 1.000 | 10 raízes de 100 | 5 ms | 52 KB | 2 ms |
| 10.000 | 100 raízes de 100 | 27 ms | 529 KB | 7 ms |
| 10.000 | 1 raiz | 59 ms | 529 KB | 6 ms |
| 100.000 | 1.000 raízes de 100 | 1,0 s | 5,3 MB | 0,1 s |
| 100.000 | 1 raiz com 100 mil filhos | 2,6 s | 5,1 MB | 0,1 s |
| 200.000 | 1 raiz com 200 mil filhos | 9,9 s | 10,4 MB | 0,2 s |
| 400.000 | 1 raiz com 400 mil filhos | erro 500 (limite de 100 MB) | | 0,4 s |
| 1.000.000 | 1.000 raízes de 1.000 | 102 s | 53,6 MB | 1,0 s |

- Até 10 mil itens o `GET` responde em dezenas de milissegundos.
- O tempo do `GET` é quase todo do `$graphLookup` e cresce mais que linearmente com o número de descendentes de uma mesma raiz: dobrar os itens sob uma raiz multiplicou o tempo por 3,3 a 3,8.
- Sob uma única raiz, o `GET` falha em algum ponto entre 200 mil e 400 mil descendentes.
- Em Lambda com invocação síncrona a resposta é limitada a 6 MB, cerca de 110 mil itens com nomes curtos. O API Gateway (REST) limita a integração a 29 segundos por padrão e o payload a 10 MB. Documentação da AWS, conferida em 2026-11-19.
