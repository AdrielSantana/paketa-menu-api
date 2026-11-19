# ADR 0003: Modelo de dados com referência ao pai, ObjectId e `$graphLookup`

- **Status:** aceito
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

**O `GET` usa um pipeline só:** `$match` nos itens de primeiro nível, `$graphLookup` descendo por `relatedId` e `$project` com `_id`, `name` e `relatedId`. O banco devolve, para cada raiz, a lista plana dos seus descendentes; uma função pura (`buildMenuTree`) transforma essa lista no JSON aninhado.

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
- **Uma consulta `find` da coleção inteira e montagem em memória.** É a opção mais simples e, para devolver o menu inteiro, lê os mesmos documentos. Descartada porque deixaria a aplicação responsável por percorrer o grafo também na exclusão, carregando a coleção para apagar uma subárvore.
- **N consultas recursivas** (uma por nível ou por item). Uma ida ao banco por nível; cresce com a profundidade.

## Consequências

- Promover, e um futuro "mover", custam uma escrita por filho direto.
- **Limites do `$graphLookup`.** No DocumentDB o estágio tem limite de 100 MB de memória, não aceita `allowDiskUse` e devolve erro ao ultrapassar. No MongoDB ele passa a usar disco. Em ambos, cada raiz com seus descendentes é um documento de resultado, sujeito ao limite de 16 MB do BSON.
- **Escala.** Devolver o menu inteiro em uma resposta é o que limita o desenho, em qualquer modelo. Para volumes grandes, o caminho é carregar por nível (`GET` com o id do pai), cachear a árvore pronta e invalidar na escrita.
- **Dependência de versão.** Em um cluster DocumentDB anterior ao 8.0.2 este desenho não roda; a alternativa seria o array de ancestrais.
- **Ciclos.** Criar exige que o pai já exista, excluir remove e promover aponta os filhos para um ancestral. Nenhuma dessas operações fecha um ciclo. Uma operação de "mover" precisaria checar, na mesma transação, que o novo pai não é descendente do item.
- A ordem por `_id` acompanha a criação dentro de um mesmo processo. Entre processos diferentes, no mesmo segundo, a ordem é determinística mas pode não ser a de chegada. Se a ordem do menu virar requisito de negócio, entra um campo de posição.
