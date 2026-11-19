# ADR 0005: Transações nas escritas que dependem de outro documento

- **Status:** aceito
- **Data:** 2026-11-19

## Contexto

Duas escritas deste serviço leem um documento e gravam outro com base nessa leitura:

- **criar um sub-item** confere que o pai existe e insere o filho;
- **excluir** confere os filhos e depois apaga ou promove.

Sem transação, uma requisição concorrente pode invalidar a leitura antes da escrita. O caso típico: o pai é apagado entre a conferência e o `insert`, e o filho nasce órfão, invisível no menu e ocupando um nome único.

No MongoDB, transação exige replica set. O contexto da vaga é uma fintech, em que consistência pesa mais do que simplicidade de ambiente.

## Decisão

**Usar transação sempre que a escrita depende do estado de outro documento.**

- `POST` com `relatedId`: transação.
- `DELETE`: sempre em transação.
- `POST` de item de primeiro nível: um único `insert`, que já é atômico, sem transação.

**Travar o pai com uma escrita.** A transação roda em isolamento de snapshot, que só detecta conflito entre escritas no mesmo documento. Ler o pai não basta: a criação do filho e a exclusão do pai gravariam em documentos diferentes e as duas confirmariam (*write skew*). Por isso a criação do filho atualiza o `updatedAt` do pai dentro da transação. Qualquer exclusão concorrente que toque no pai passa a conflitar; o driver refaz a transação que perdeu, e ela enxerga o estado novo.

**Replica set de um nó em todos os ambientes:** `MongoMemoryReplSet` nos testes e MongoDB com `--replSet` no docker-compose.

Um helper único (`withTransaction`) abre a sessão, usa a API de callback do driver, que refaz a transação em erro transitório, e encerra a sessão.

## Alternativas consideradas

- **Sem transação, com a corrida documentada.** Ambiente mais simples, mas deixa órfãos possíveis.
- **Sem transação, com limpeza periódica de órfãos.** Corrige depois do fato e deixa uma janela de inconsistência.
- **Trava por documento de controle** (um documento de "lock" por subárvore). Funciona sem replica set, mas é reimplementar o que a transação já entrega.

## Consequências

- A criação de sub-item faz uma escrita a mais, no pai. Em troca, o `updatedAt` de um item passa a refletir a última mudança nos seus filhos diretos.
- Criações concorrentes sob o mesmo pai conflitam entre si e são refeitas pelo driver. Para um menu, em que escritas são raras, o custo é irrelevante.
- O ambiente de desenvolvimento precisa de replica set. O `docker-compose` inicia o replica set sozinho, e a URL de conexão passa a incluir `replicaSet=rs0`.
- **Limites no DocumentDB** (documentação da AWS, conferida em 2026-11-19): transações a partir da versão 4.0, isolamento de snapshot, log de transação menor que 32 MB e execução de até 1 minuto. Coleções não podem ser criadas dentro de uma transação, então o serviço garante coleção e índices no boot.
- A mesma página diz que o DocumentDB não suporta cursores dentro de transação. A agregação da cascata devolve um documento só, mas isso precisa ser validado em um cluster real antes de ir para produção.
- No DocumentDB anterior ao 8.0.2, `retryWrites` precisa estar desligado na URL de conexão.
