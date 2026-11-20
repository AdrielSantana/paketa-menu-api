# Como configurar o projeto?

- Certifique-se que tem o [Node.js](https://nodejs.org/) 24 instalado (a versão está em `.nvmrc`) e o [Docker](https://www.docker.com/) para o banco local.
- Este projeto utiliza Node.js com [Typescript](https://www.typescriptlang.org/).
- Disponibilizamos duas coleções prontas localizadas na pasta `.docs` para importar no [Insomnia](https://insomnia.rest/) e no [Postman](https://www.postman.com/) para realizar os testes, porém sinta-se à vontade para utilizar qualquer plataforma de cliente de API que preferir.
- Crie um arquivo `.env` na raíz do projeto copiando o `.env.example` (`cp .env.example .env`). Qualquer variável de ambiente utilizada deve ser declarada neste arquivo e chamada no projeto através do comando `process.env` (ex. `process.env.MONGO_URL`).
- Instale as dependências com `npm ci` (usa as versões exatas do `package-lock.json`).
- Suba o [MongoDB](https://www.mongodb.com/) local com `npm run db:up` (docker compose). Para usar outro banco, ajuste `MONGO_URL` no `.env`.
- Inicialize o projeto através do comando `npm run start`.
- O projeto utiliza o [tsx](https://tsx.is/) em modo watch, logo as atualizações feitas ao código durante o desenvolvimento reiniciam o servidor sem intervenção manual (com exceção às alterações no arquivo `.env`. Neste caso é preciso encerrar a execução do servidor e executar o comando `npm run start` novamente).
- Caso tenha tudo ocorrido de acordo, o terminal deverá apresentar a seguinte saída (os logs do serviço são linhas JSON):

```sh
{"level":"info","time":"2026-11-20T00:58:44.336Z","message":"database connected"}
{"level":"info","time":"2026-11-20T00:58:44.337Z","message":"server listening","port":8000}
```

- `curl localhost:8000/health` deve responder `{"status":"ok"}`.

# Como validar uma mudança?

- `npm run check` roda, nesta ordem, formatação (Prettier), lint (ESLint), tipos (`tsc --noEmit`), testes (Vitest) e build. É o mesmo comando do CI.
- `npm test` roda só os testes. Eles sobem um MongoDB em memória e não precisam do Docker.
