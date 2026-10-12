# Issue #5 — verificação Windows

Branch local `feat/issue-5-ratings-flags`, baseada em `0fedfbd99152fd7ff0ef3c639fa79411d4d190d1`. Contrato documentado como [proposta reversível](../../docs-agents/proposals/0004-photo-classification.md), não aprovação definitiva da escala/estados. Sem push/merge/alteração externa de issues.

## Execução e resultados

- `npm ci`: 148 pacotes, auditoria sem vulnerabilidades.
- `npm test`: 64 testes, **61 pass, 0 fail, 3 skips**. Skips já existentes: alias symlink Windows e dois testes POSIX de named pipe.
- `npm run typecheck`: código 0.
- `npm run package`: código 0; pacote Windows x64 em `out/Revelumo-win32-x64`. Sem instalador/release.
- `electron test/electron-classification.cjs <diretório-temporário-isolado> first`, depois `reopen`: ambos código 0, [primeiro processo](classification-first.json) e [segundo processo](classification-reopen.json).
- Regressões empacotadas `electron-smoke.cjs` e `electron-relocation.cjs`, modos first/reopen, e `electron-availability.cjs`: todos código 0. Executados através do wrapper `hidden-regressions.cjs`, que cria janelas com `show:false`; as validações nativas da #4 não foram editadas. Somente a lista esperada das APIs do smoke ganhou as duas operações de classificação.

Node dos testes: 24.19.0; Electron 44.7.0 / Node 24.21.0 / Chromium 152.0.7977.130 / SQLite 3.53.4. Versões completas nos JSONs. Fixtures JPEG sintéticas do repositório e catálogos temporários; sem catálogo pessoal, fotos pessoais, captura de tela, mouse ou serviços pagos.

## Comportamento comprovado

Migração v1/v2/v3 preserva identidade, prées e miniaturas; começa em `rating:null`, `flag:neutral`. Atribuição de todas as cinco estrelas, troca/limpeza independente da flag e repetição preservam o par correto. Main recusa payloads inválidos, caminhos, valores fora da escala e UUID inexistente. Bloqueio SQLite real produz erro legível e mantém estado persistido e exibido. Grade/prévia, recarga do renderer, cancelamento de importação, reimportação do caminho canônico e segundo processo preservam classificação. Duas fotos retêm estados distintos (4/selecionada e 1/rejeitada). Cancelamento/relocalização também preservam o par na Library. SHA-256 dos originais sintéticos não muda.

Árvore Chromium de acessibilidade confirma nomes e estados `pressed`; Enter e Espaço acionam botões reais via protocolo Chromium, sem desktop. Enter exige `text:'\r'` além de keyDown, conforme a [API Input do Chromium](https://chromedevtools.github.io/devtools-protocol/tot/Input/) e [discussão oficial](https://github.com/ChromeDevTools/devtools-protocol/issues/45). A primeira tentativa sem o caractere gerava keydown mas não a ação padrão; instrumentação identificou e correção do harness passou.

## TDD e incidente do harness

Domínio vermelho: `library.classification is not a function`; verde após implementação SQLite/Library. IPC vermelho: parser retorna null para operação nova; verde após payload estrito e rotas. Validação Library vermelha: valor inválido retorna catalog-error em vez de invalid-request; verde após validação antes do SQLite. UI vermelha no pacote real: `classification controls ready` false; verde após controles.

A primeira adaptação do harness usou `Object.defineProperty` no export não configurável `BrowserWindow`, causando o modal relatado pela usuária. Sessão correspondente foi encerrada por Ctrl+C; consultas Win32_Process filtradas especificamente pelo caminho deste harness retornaram **nenhum processo pendente**. Nenhum outro Electron/Codex foi encerrado. Corrigido: substituição temporária de `Module._load` apenas durante carga do entrypoint, retornando um adaptador Electron com janelas ocultas desde criação, sem redefinir o export. Antes de qualquer código suscetível a falha, handlers de uncaughtException/unhandledRejection e showErrorBox enviam falhas ao console e `app.exit(1)`. `electron test/electron-classification.cjs --fail-bootstrap` verificou falha intencional com código 1 em menos de um segundo, sem processo bloqueado. Não afirmar que a primeira tentativa ficou oculta: o modal ocorreu e foi corrigido.

Sandbox Windows restringiu rede para clone/package e rename de fixture: execuções autorizadas fora do sandbox resolveram esses limites. Não houve rejeição de auto-review.

## Limites

Somente Windows x64 foi verificado nesta fatia; Linux/macOS e CI remoto não foram executados. Janelas ocultas/DOM/árvore acessível não substituem inspeção visual humana, leitor de tela ou seletor Windows real. Diálogo substituído na fronteira externa dos testes. Contrato continua proposta; aprovação da responsável e publicação coordenada permanecem fora desta entrega.
