# Issue #13 — filtros da biblioteca

Base: `5aa6693d05bbfea1c538a9360c84ee69ce195a68`. Branch local: `feat/issue-13-library-filters`. Design aprovado reconsultado no GitHub antes do código; [snapshot](spec.md). Implementação e evidências em Windows x64, Node 24.19.0, npm 12.0.2, Electron 44.7.0 (Node 24.21.0 / Chromium 152.0.7977.130). Sem push, PR, merge, tag ou release.

## Comportamento

Estrelas mínimas 1–5 ou `unrated`/null ou todas, combinadas por AND com uma flag opcional. Consulta SQL parametrizada retorna UUID/nome e total do catálogo na ordem existente, sem schema novo, leitura/hash/decode dos originais ou novos estados de classificação. `queryPhotos` usa o canal/origem/preload restritos existentes; payload exato `query/rating/flag`, sem caminhos livres.

Estado React da sessão preserva filtros entre grade/prévia; novo processo começa sem filtros. Mudar classificação mantém a foto atual e consulta os estados confirmados ao voltar. Filtro explícito reinicia página; atualização mantém ou limita a página válida, com 48 miniaturas. Importação mantém critérios e informa IDs importados ocultos, inclusive durante prévia. Erro de consulta, catálogo vazio e filtro sem resultados têm estados distintos; erro oferece retry e vazio filtrado oferece limpeza. Sequência e cleanup recusam respostas antigas.

## TDD e verificação

- Library RED: `node --test test/filters.test.ts` falhou com `TypeError: library.query is not a function`; GREEN após consulta pública/SQL. Fronteira filesystem/crypto bloqueada nos testes comprova zero open/stat/realpath/hash para filtrar; decoder proibido após importar. Originais ausentes continuam correspondendo. Matriz pública cobre sete critérios de estrelas × quatro critérios de flag e preserva classificação.
- Renderer RED no pacote anterior: [falha por controles ausentes](renderer-red.txt). GREEN: [first](filters-first.json), [reopen](filters-reopen.json). Renderer, preload, IPC, SQLite e nativeImage reais, janelas ocultas desde criação, contextIsolation/sandbox/webSecurity preservados.
- `npm test`: 67 testes, 64 aprovados, zero falhas, três skips Windows (symlink requer permissão; dois FIFO não aplicáveis). [Saída](node-tests.txt).
- `npm run typecheck`: exit 0. [Saída](typecheck.txt).
- `npm run package`: exit 0, `out/Revelumo-win32-x64/resources/app.asar`; sem instalador. Lockfile e dependências do produto inalterados. `npm ci` auditou 149 pacotes e informou zero vulnerabilidades naquele momento.
- Grade/lote/UUIDs/miniaturas: [first](gallery-first.json), [reopen](gallery-reopen.json); 52 fixtures preservadas.
- Classificação: [first](classification-first.json), [reopen](classification-reopen.json); duas fixtures preservadas.
- Relocalização: [first](relocation-first.json), [reopen](relocation-reopen.json); cinco fixtures preservadas.
- Disponibilidade: [resultado](availability.json); 49 fixtures e zero leitura/hash/decode na grade em cache. Runner aceita uma execução por pasta, não possui modo reopen.
- Recursos: `prepare` e `measure` em processos separados; [resultado](resources.json), 48 JPEGs sintéticos de 12 MP. Medição do ambiente, não gate de desempenho nem prova no alvo de 8 GB.
- [Revisão independente Standards/Spec](code-review.md) sobre WIP indexado, base fixa, sem confundir diff vazio com revisão.

Os smokes antigos de classificação/relocalização precisaram aguardar o estado público pronto da grade após retorno: `aria-busy=false` ou import habilitado. A mudança introduz consulta assíncrona onde antes a grade aparecia imediatamente. As falhas iniciais do harness foram resolvidas com essas esperas; nenhum comportamento do produto foi relaxado. O teste de atraso corrigiu o tempo de instalação do adaptador IPC, e a fixture adicional de preview passou a usar uma foto da página visível.

## Reprodução e SHA final

Use uma pasta nova por cenário e execute na raiz, após `npm ci`, `npm run install:electron`, `npm run typecheck`, `npm test`, `npm run package`. No Windows, configure `TEMP`/`TMP` para uma pasta temporária canônica autorizada (como na CI).

```powershell
node_modules/.bin/electron.cmd test/electron-filters.cjs <pasta-nova> first
node_modules/.bin/electron.cmd test/electron-filters.cjs <mesma-pasta> reopen
node_modules/.bin/electron.cmd test/electron-hidden.cjs test/electron-smoke.cjs <outra-pasta> first
node_modules/.bin/electron.cmd test/electron-hidden.cjs test/electron-smoke.cjs <mesma-outra-pasta> reopen
```

Repita o padrão para `electron-classification.cjs` e `electron-relocation.cjs`; disponibilidade usa somente uma execução/pasta. Recursos usa `prepare` e `measure`. `electron-hidden.cjs` substitui o módulo Electron apenas durante o carregamento e força `show:false`; nunca redefine o export BrowserWindow. Erros modais viram falha do processo. Filtros também têm bootstrap standalone oculto.

Após o commit, a verificação do SHA final fica na pasta local ignorada `sha-verification/`, com `manifest.json` identificando o commit, comandos, exits e resultados. Isso evita afirmar um SHA autorreferente dentro do próprio commit. Fixtures/catálogos intermediários ficam em subpastas ignoradas; apenas evidências textuais/JSON são versionadas.

## Integração e limites

Checkout exclusivo: `C:\Users\glauc\Documents\Codex\2026-10-12\task-7\revelumo`. Não foram lidos/escritos checkouts alheios. Compartilhados com #12: contratos e requests (novo tipo/op apenas), catalog/library (método query), main/preload (rota query), App (estado de consulta/filtros/importação/retorno), CSS. Schema, receitas, scheduler/autosave e ClassificationControls não foram alterados. Integrar preservando os dois contratos e reexecutar testes sobre o SHA combinado. A tentativa de checkpoint via thread de origem retornou “thread not found”; handoff pelo resultado da delegação.

Não verificados nesta execução: Linux/macOS, inspeção visual humana, leitor de tela, teclado físico, seletor Windows nativo (substituído na fronteira), abertura por duplo clique, instaladores, alvo 8 GB sem GPU dedicada e integração com a branch paralela #12. Nenhum desses limites foi tratado como prova de suporte ou de desempenho.
