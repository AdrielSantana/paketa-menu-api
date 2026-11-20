# ADR 0006: Unicidade do nome por chave normalizada

- **Status:** aceito
- **Data:** 2026-11-19

## Contexto

O enunciado exige `name` único e não-nulo, sem dizer se "Apple", "apple" e " Apple " são o mesmo nome. Para quem navega no menu, são.

Checar a unicidade só na aplicação (consultar e depois inserir) não resiste a duas requisições simultâneas: as duas consultam, nenhuma encontra, as duas inserem.

## Decisão

**A unicidade é global**, como diz o enunciado, e é garantida por um **índice único no banco** sobre um campo derivado, `nameKey`.

Uma função pura (`normalizeMenuName`) produz dois valores a partir do nome recebido:

| Valor | Regra | Exemplo para `"  Smart   TV "` |
|---|---|---|
| `name` (exibido) | Unicode NFC, sem espaços nas pontas, espaços internos repetidos viram um | `"Smart TV"` |
| `nameKey` (unicidade) | o `name` em NFKC, sem caracteres invisíveis e em minúsculas | `"smart tv"` |

- Caracteres de formato (categoria Unicode Cf: espaço de largura zero, hífen opcional, inversores de direção) não aparecem na tela. Ficam no nome exibido, porque emojis compostos e algumas escritas dependem deles, mas saem da chave: "LCD" seguido de um caractere invisível é o mesmo nome que "LCD", e um nome só com eles é vazio.
- Acentos fazem diferença: "Informática" e "Informatica" são nomes distintos.
- `name` aceita de 1 a 100 caracteres depois da normalização, sem caracteres de controle nem Unicode malformado (ADR 0010).
- A violação do índice (erro 11000) vira 409.

## Alternativas consideradas

- **Índice único com collation insensível a maiúsculas.** Dispensa o campo extra, mas só existe no DocumentDB 8.0, toda consulta precisa repetir a collation para usar o índice e não resolve espaços nem formas Unicode.
- **Unicidade por pai** (mesmo nome permitido em ramos diferentes). É mais natural para um menu ("Cabos" em Apple e em Dell), mas contraria o enunciado.
- **Comparação exata**, só com trim. Deixaria "LCD" e "lcd" coexistirem.
- **Checagem na aplicação.** Tem a corrida descrita acima. O índice é a única garantia real.

## Consequências

- O nome é devolvido como foi digitado, só com os espaços arrumados; a caixa original é preservada.
- A regra de normalização vive em um lugar só e tem teste unitário. Mudá-la depois exige migrar o `nameKey` dos documentos existentes.
- A chave não resolve todos os nomes visualmente iguais: letras de alfabetos diferentes com o mesmo desenho ("A" latino e "А" cirílico) continuam distintas. Isso pediria a tabela de confundíveis do Unicode.
- `toLowerCase()` não cobre todos os casos de equivalência entre idiomas (o "ß" alemão, o "İ" turco). Para um menu em português é suficiente.
- A unicidade global é restritiva para catálogos grandes. Trocar para unicidade por pai seria mudar o índice para `{ relatedId, nameKey }`.
