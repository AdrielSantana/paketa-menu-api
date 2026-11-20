# ADR 0008: Serialização do menu sem recursão

- **Status:** aceito
- **Data:** 2026-11-19

## Contexto

O requisito é aninhamento infinito. O `res.json` do Express usa `JSON.stringify`, que é recursivo. Medido no Node 24, em uma cadeia de itens com um filho cada:

- `JSON.stringify` funciona até 3.078 níveis de menu e lança `RangeError: Maximum call stack size exceeded` a partir daí (o número exato depende do tamanho da pilha do processo);
- `JSON.parse` leu 1 milhão de níveis sem erro.

Ou seja, o limite está em quem escreve o JSON, não em quem lê. Sem tratamento, um menu fundo o bastante faria o `GET` devolver 500.

## Decisão

O `GET /api/v1/menu` não usa `res.json`. A resposta é montada por `serializeMenuTree`, que percorre a árvore com uma pilha explícita e produz exatamente o mesmo texto que `JSON.stringify` produziria.

A montagem da árvore (`buildMenuTree`) também não usa recursão.

## Alternativas consideradas

- **Limitar a profundidade na criação.** Simples, mas contraria o enunciado e exigiria calcular a profundidade do pai a cada `POST`.
- **Aumentar a pilha do Node** (`--stack-size`). Só empurra o limite, e depende de como o processo é iniciado, o que não se controla em Lambda.
- **Aceitar o limite e documentar.** Três mil níveis sobram para qualquer menu real, mas o custo de removê-lo foi pequeno: cerca de 25 linhas, cobertas por teste de propriedade.

## Consequências

- A equivalência com `JSON.stringify` é garantida por um teste de propriedade (árvores e nomes arbitrários, incluindo caracteres que exigem escape) e não por inspeção.
- Há testes com 100 mil níveis na função pura e com 5.000 níveis de ponta a ponta, passando pelo banco e pelo HTTP.
- O formato dos nós está fixo no serializador (`id`, `name`, `submenus`). Um campo novo na resposta precisa ser acrescentado ali.
- "Infinito" continua limitado por outros fatores: os limites do `$graphLookup` na cascata (ADR 0009), a memória do processo e a capacidade do cliente de ler a resposta.
