import * as dotenv from 'dotenv'

// Carrega o .env. Precisa ser o primeiro import do ponto de entrada: os
// módulos são avaliados na ordem dos imports, e a configuração é lida de
// process.env assim que `config.ts` carrega.
// quiet: o dotenv não escreve na saída padrão, que é só de logs em JSON.
dotenv.config({ quiet: true })
