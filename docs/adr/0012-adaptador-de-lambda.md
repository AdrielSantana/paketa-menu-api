# ADR 0012: O mesmo app Express atrás de um handler de Lambda

- **Status:** aceito
- **Data:** 2026-11-19

## Contexto

O enunciado fixa Express sobre a arquitetura do boilerplate, que sobe um servidor HTTP. A stack da vaga roda em Lambda, com DocumentDB. O serviço precisa rodar nos dois modos sem duplicar rota, validação ou regra.

## Decisão

**Um app, dois pontos de entrada.**

- `src/index.ts`: servidor HTTP, como no boilerplate. Desenvolvimento local e qualquer ambiente com processo de longa duração.
- `src/lambda.ts`: exporta `handler`, que entrega o evento ao mesmo `app` por meio de `@codegenie/serverless-express` 5.0.0.

`npm run build` compila `src/` para `build/`; o handler do Lambda é `build/lambda.handler`.

**O que o adaptador (`src/adapters/lambda.ts`) faz além de traduzir o evento:**

| Cuidado | Por quê |
|---|---|
| Conecta no banco uma vez por instância e reaproveita entre invocações | Conectar a cada requisição custa tempo e multiplica conexões no cluster |
| Se a conexão falha, responde 503 em Problem Details e tenta de novo na invocação seguinte | Uma instância que falhou no primeiro acesso não fica quebrada para sempre |
| Handler `async` com dois parâmetros, sem callback | O runtime Node 24 só aceita esse formato; handler com callback vale até o Node 22 (documentação da AWS, conferida em 2026-11-19). Com handler `async`, a resposta sai quando a promise resolve, e a conexão aberta não segura a invocação |
| Request id = id da invocação, quando o cliente não manda um `X-Request-Id` em formato seguro. Vale também para o 503 de conexão | É o id que o Lambda grava no CloudWatch; os logs do serviço e os da plataforma se encontram |
| `maxPoolSize: 2` | Uma instância atende uma requisição por vez; o padrão do driver é 100 |
| `MONGO_URL` obrigatória, conferida na inicialização | Falta de configuração aparece no deploy, não na primeira requisição |

O adaptador recebe a função de conexão por parâmetro. Os testes invocam o handler com eventos no formato do API Gateway (HTTP API e REST API) e do ALB com cabeçalhos multi-valor, contra o mesmo MongoDB em memória dos demais testes.

**Pacote.** `npm ci`, `npm run build` e depois `npm ci --omit=dev`: vão para o pacote `build/` e `node_modules/` só com as dependências de produção.

## Alternativas consideradas

- **`serverless-http`.** Equivalente e também sem dependências. Escolhemos a biblioteca que nasceu na AWS e cobre os mesmos tipos de evento.
- **Lambda Web Adapter** (camada da AWS que encaminha o evento a um servidor HTTP comum). Nenhum código novo, mas não é testável sem emular o Lambda e paga um salto HTTP local a cada requisição.
- **Adaptador próprio.** Tirava a dependência e colocava no lugar a tradução de três formatos de evento, escrita e mantida por nós.
- **Uma função Lambda por rota, sem Express.** É o desenho mais comum em serverless, mas abandona a arquitetura do boilerplate, que o enunciado pede.

## Consequências

- Entra uma dependência de produção, que exige Node 24 ou superior, a versão que o projeto já fixa.
- Os limites do ADR 0010 foram dimensionados para este modo: o teto de itens mantém a resposta abaixo dos 6 MB de uma invocação síncrona.
- O adaptador é HTTP. Consumo de eventos (SQS, EventBridge) pede outro handler, com lote, falha parcial e idempotência; ele reaproveitaria a conexão, a configuração, o logger e o domínio, não as rotas.

## O que foi verificado e o que não foi

Verificado em 2026-11-19:

- o handler compilado (`build/lambda.js`), carregado por Node puro e invocado com eventos de HTTP API contra o MongoDB do docker-compose: primeira invocação em 54 ms (com a conexão), as seguintes em 2 a 7 ms;
- sem `MONGO_URL`, o módulo falha ao carregar;
- em um clone limpo, a sequência do pacote (`npm ci`, `npm run build`, `npm ci --omit=dev`) termina sem erro e o handler compilado carrega só com as dependências de produção.

Não foi feito: deploy em uma conta AWS, infraestrutura como código e teste contra um cluster DocumentDB.

## Desenho do deploy (não executado)

- API Gateway HTTP API com integração de proxy para a função, runtime Node 24.
- Função na VPC do DocumentDB, em sub-redes privadas, com security group liberando a porta do cluster.
- Timeout da função acima de dois `DB_TIMEOUT_MS` (10 s) e abaixo dos 29 s da integração do API Gateway: 15 s.
- Concorrência reservada vezes `maxPoolSize` abaixo do limite de conexões da classe de instância do cluster.
- URL de conexão vinda de um cofre de segredos, com os parâmetros que a documentação da AWS indica (conferida em 2026-11-19): `tls=true`, o certificado `global-bundle.pem` em `tlsCAFile`, `replicaSet=rs0` e `retryWrites=false` em clusters anteriores ao 8.0.2.
