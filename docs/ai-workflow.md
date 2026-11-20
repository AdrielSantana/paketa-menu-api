# Como usei IA neste desafio

Fiz o desafio com o Claude Code, um agente que lê o repositório, roda comandos e escreve código. Este documento descreve como o guiei, o que as guardas pegaram e onde eu intervim. Tudo aqui pode ser conferido no histórico de commits e nos ADRs.

## O acordo de trabalho

Comecei a sessão com um briefing escrito, antes de qualquer código. Os pontos principais:

- **Eu decido.** Em decisão de modelagem ou de arquitetura, o agente para, apresenta opções com trade-offs curtos e uma recomendação, e espera.
- **Toda decisão vira um ADR curto** antes do código, com as alternativas descartadas. Eu preciso conseguir defender cada linha.
- **Commits pequenos**, um assunto por commit, com o porquê no corpo.
- **Escopo:** primeiro o que o enunciado pede; extras só depois, e só com justificativa.
- **Nada de afirmar sem rodar.** Para compatibilidade com DocumentDB, conferir a documentação da AWS e registrar a data da consulta.
- **Proibições:** nenhum push no repositório da Paketá e nenhum acesso às branches `develop`, `feature/refact-aggregate` e `feature/refact-recursive`, que parecem conter uma solução pronta.

Essas regras estão em [AGENTS.md](../AGENTS.md), que o agente lê no início de cada sessão.

## As guardas

Regra escrita em prosa o agente pode esquecer. Por isso, o que dá para verificar por máquina está em três camadas, todas rodando o mesmo `npm run check` (formatação, lint, tipos, testes e build):

| Quando | O que roda | Onde |
|---|---|---|
| Antes de um comando do agente | Bloqueia `git commit --no-verify`, push no upstream e comandos git que toquem as branches proibidas | `.claude/hooks/guard-bash.mjs` |
| Depois de cada arquivo editado pelo agente | Prettier e ESLint no arquivo | `.claude/hooks/format-edited-file.mjs` |
| Antes de o agente encerrar um turno | `npm run check`; se falhar, ele não encerra | `.claude/hooks/check-before-stop.mjs` |
| Em cada commit | lint-staged e typecheck | `backend-desafio/.husky/pre-commit` |
| Em cada push | `npm ci` e `npm run check` | `.github/workflows/ci.yml` |

O remoto da Paketá também foi configurado só para leitura da branch `boilerplate`, com a URL de push inválida.

## O método

1. **Ambientação.** Antes de mudar qualquer coisa, o agente rodou o boilerplate e escreveu testes para o comportamento existente. Assim apareceram quatro defeitos, todos reproduzidos: o `PUT` e o `DELETE` de `user` filtravam por um campo errado; uma rejeição em handler assíncrono derrubava o processo; a compilação quebrava em uma instalação limpa; e um JSON malformado devolvia uma página HTML com stack trace.
2. **Decisão antes de código.** Cada tema passou por uma rodada de opções, e a minha escolha foi para um ADR.
3. **Especificação antes de implementação.** A especificação de aceitação da API (41 testes, só HTTP) foi commitada antes da implementação, marcada como falha esperada, para a suíte seguir verde.
4. **Conferência por mutação.** Um teste que passa de primeira não prova nada. Depois de cada entrega, o agente injetou defeitos de propósito no código e conferiu se os testes pegavam: 52 de 54.
5. **Medir antes de afirmar.** Limites e comparações de desempenho foram medidos, e o script de medição está no repositório (`npm run bench:read`).
6. **Teste com o servidor real.** Além da suíte, os fluxos foram executados com `curl` contra o servidor e o MongoDB do docker-compose, incluindo parar o banco no meio.

## Onde eu intervim

Estas decisões foram minhas. Em duas delas (marcadas) decidi contra a recomendação do agente:

| Tema | O que estava na mesa | O que eu decidi |
|---|---|---|
| Hierarquia | O agente recomendou um array de ancestrais em cada item | **Contra a recomendação:** só a referência ao pai, com o banco percorrendo o grafo. Perguntei pelo custo de promover e mover em milhões de registros |
| Consistência | O agente recomendou não usar transação, para simplificar o ambiente | **Contra a recomendação:** transação em tudo que for possível, mesmo exigindo replica set em desenvolvimento e teste. É uma fintech |
| Excluir item com filhos | Apagar a subárvore ou reposicionar os filhos | Nenhuma das duas por padrão: é decisão de negócio. A API devolve 409 e o cliente escolhe `cascade` ou `promote` |
| Id | Sequencial, como no exemplo do enunciado, ou ObjectId | ObjectId. Os motivos contra id sequencial foram para o ADR |
| Unicidade do nome | Comparação exata ou normalizada | Sem diferenciar maiúsculas e com espaços tratados |
| Paginação do `GET` | Pergunta minha, depois de ver que o `$graphLookup` devolve uma lista | Não paginar, porque o enunciado pede tudo. Pedi a medição que levou ao ADR 0009 |
| Leitura do menu | O agente propôs trocar o `$graphLookup` por `find` | Só aceitei depois de ver a comparação medida com array de ancestrais: tempo, CPU, memória, idas ao banco e armazenamento |
| Limites | O agente propôs um teto de itens | Tudo que for possível como guarda e tratativa: tempo máximo no banco, 503 quando o banco cai, corpo limitado |
| Lambda | Quatro opções de adaptador e quatro de escopo | Biblioteca pronta, e nada de infraestrutura que não tenha sido executada |

O caso da leitura do menu é o que melhor mostra o processo. Eu tinha escolhido `$graphLookup` para tudo. A medição mostrou que, para devolver o menu inteiro, ele era de 2 a 90 vezes mais lento que um `find`, conforme o volume, e tinha um teto de memória. Mantive o modelo de dados e mudei o operador do `GET`. A decisão antiga e a nova estão nos ADRs 0003 e 0009; não reescrevi a história.

## O que as guardas e os testes pegaram

Erros do agente que não chegaram ao resultado, e o que cada um mudou no processo:

- **Dois commits com o check vermelho.** O agente encadeou comandos com `;`, e o commit rodou depois de uma etapa que falhou. Corrigido antes de qualquer push. Daí veio a regra de nunca commitar com o check vermelho e a ampliação do lint-staged para JSON e YAML.
- **Um teste que falhava pelo motivo errado.** Um teste marcado como falha esperada falhava por um e-mail inválido no próprio teste, não pelo bug que deveria provar. Daí veio a regra "confira que o teste falha pelo motivo certo".
- **Uma afirmação tirada da documentação e desmentida pela medição.** O ADR 0003 dizia que o `$graphLookup` passa a usar disco acima de 100 MB. Na versão fixada do MongoDB ele devolve erro. O ADR foi corrigido com o número medido.
- **Uma guarda incompleta.** O teste que confere o tempo máximo das consultas mostrou que a contagem usada no teto de itens saía sem ele.
- **Código redundante e asserção fraca.** A conferência por mutação mostrou uma opção duplicada em uma agregação e um teste que comparava dois valores ausentes como iguais.
- **Uma linha fora do formato no log.** O teste com o servidor real mostrou a biblioteca de variáveis de ambiente escrevendo texto livre na saída que deveria ter só JSON.

### A revisão independente

Com tudo pronto, rodei uma revisão automática de código sobre todo o trabalho, feita por um agente separado, sem o contexto de quem escreveu. Ela apontou 10 problemas que os testes e a conferência por mutação não tinham pegado, porque estavam em caminhos que nenhum teste exercitava:

- o `.env` era lido depois da configuração no modo de desenvolvimento, então um valor inválido era ignorado;
- o servidor registrava "ouvindo" mesmo quando a porta estava ocupada;
- o handler de Lambda declarava um parâmetro de callback, que o runtime Node 24 não aceita, e quebrava o formato de resposta do ALB com cabeçalhos multi-valor;
- uma URL com codificação inválida virava erro 500;
- o motivo real de uma falha no health check não chegava ao log;
- um caractere invisível no nome burlava a unicidade;
- a instalação só com dependências de produção falhava por causa do husky;
- o hook que barra comandos proibidos tinha brechas (`git commit -n`, por exemplo).

Cada achado foi primeiro reproduzido em um teste que falhava, e só então corrigido. O ponto de entrada do servidor ganhou testes que sobem o processo de verdade.

## Limites do que foi feito

- Nada foi executado em DocumentDB nem em uma conta AWS. O que os ADRs dizem sobre os dois vem da documentação, com a data da consulta.
- As medições são de uma máquina, com MongoDB em memória. Servem para ordem de grandeza.
- Dois erros do banco (tempo esgotado e limite de memória do `$graphLookup`) são testados com o erro simulado. Os dois foram observados de verdade nas medições.
- Eu revisei as decisões e os ADRs. O código foi escrito pelo agente e lido por mim a cada entrega.
