# Issue #7 — CI preparado, execução GitHub pendente

12/10/2026, Windows x64 local. Branch `ci/issue-7` em checkout isolado; nenhuma alteração no checkout anterior, em fotografias pessoais, credenciais ou configurações do GitHub.

## Base e entrega

- `main` revalidada: `b350629da67bde5cc7a625e9d34d7ed42ea96716`. O PR #6 foi realmente integrado às 03:41:38 UTC, head `0f2c1b560d828f534b171ae7dea288b2a44a4ca5`. A branch CI foi avançada por fast-forward da base inicialmente empilhada para essa `main`, preservando todo o WIP. Árvore funcional idêntica ao head da #6; diff desta issue contém somente workflow, documentação atual e evidências.
- [Spec #7](https://github.com/glaucia86/revelumo/issues/7): workflow Windows/Ubuntu standard, Node 24, instalação reproduzível, testes/types/pacote e smokes Windows. [Workflow](../../.github/workflows/ci.yml) e [reprodução/limites](../../docs-agents/ci.md).
- SHA final do commit CI: obter por `git log -1 --format=%H -- .github/workflows/ci.yml` na branch entregue. Checks locais abaixo foram executados sobre o código funcional de `b350629` com o WIP de CI; não são checks de um run remoto.
- Repositório confirmado público via API (`private: false`). `package.json` conserva o bloqueio de publicação npm (`private: true`) e versão `0.0.1`. Licença continua pendente.

## Validação local real

| Comando/verificação | Resultado |
| --- | --- |
| `npm ci` (lockfile, cache local em diretório autorizado) | exit 0, 148 pacotes instalados; npm informou zero vulnerabilidades |
| `npm run install:electron` | exit 0, binário oficial Electron instalado explicitamente |
| `npm run typecheck` | exit 0 |
| `node --test test/library.test.ts` | 8 aprovados, zero falhas/skips |
| `npm test`, com TEMP/TMP autorizados | exit 0; 59 testes, 56 aprovados, zero falhas, 3 skips |
| `npm run package` | exit 0; `out/Revelumo-win32-x64/resources/app.asar`, sem instalador |
| `npm run test:electron -- <electron> first`, depois `reopen` | dois processos aprovados, 10 e 6 checks; [first](electron-first.json), [reopen](electron-reopen.json) |
| `npm run test:relocation -- <relocation> first`, depois `reopen` | dois processos aprovados, 6 e 3 checks; [first](relocation-first.json), [reopen](relocation-reopen.json) |
| actionlint 1.7.12 sobre `.github/workflows/ci.yml` | exit 0; YAML, estrutura e expressões GitHub válidos |
| Parser PowerShell | quatro blocos multiline válidos |
| Execução local do bloco de summary | exit 0; [reprodução local](local-summary.md), com outcomes fornecidos conforme checks locais observados; não é summary do GitHub |
| `git diff --check` | exit 0 |

Node local `24.19.0`, npm `12.0.2`; Electron `44.7.0`, Node embarcado `24.21.0`, Chromium `152.0.7977.130`. Versões completas nos JSONs dos smokes. Os cenários receberam pastas novas separadas sob Temp, com catálogos/fixtures exclusivamente sintéticos e reabertura somente na pasta do próprio cenário. Houve mensagem de GPU no encerramento do primeiro smoke; resultados e os quatro códigos de saída permaneceram aprovados.

[Log da suíte](local-tests.txt) · [Log do pacote](local-package.txt). Dois skips são testes POSIX FIFO (`mkfifo`) indisponíveis no Windows; o terceiro é alias de symlink, pois o ambiente negou sua criação. O workflow explica essas condições no summary e preserva os motivos emitidos nos logs.

A primeira tentativa da suíte usou a pasta temporária virtualizada do sandbox: 44 aprovados, 12 erros `EPERM` em renomeação de fixtures e 3 skips. [Tentativa preservada](local-tests-sandbox.txt). A única mudança para a segunda execução foi `TEMP`/`TMP` apontando a uma pasta autorizada no workspace; não houve alteração em código/testes nem retry para ocultar falhas no workflow. A suíte passou nesse ambiente. Isso não comprova permissões ou execução no runner GitHub.

Actionlint baixado do [release oficial v1.7.12](https://github.com/rhysd/actionlint/releases/tag/v1.7.12); arquivo Windows amd64 conferido pelo SHA-256 da API GitHub `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`. Actions oficiais v5.0.0 conferidas via `git ls-remote`: checkout `08c6903cd8c0fde910a37f88322edcfb5dd907a8`, setup-node `a0853c24544627f65ddf259abe73b1d18a591444`; input `package-manager-cache: false` confirmado no `action.yml` desse SHA.

## Pendências e execução coordenada

**CI ainda não executado no GitHub. Sem link de run, sem alegação de CI verde.** Ubuntu não foi executado localmente. Workflow, dependências e scripts foram preparados/validados, mas os critérios de aceite de execução remota da #7 permanecem pendentes.

Depois de coordenação autorizar a publicação:

1. Conferir `origin/main` e o SHA final local; se a base avançou, reconciliar e validar o diff da #7 sem trazer trabalho de outra issue.
2. `git push -u origin ci/issue-7` e criar PR para `main`, com título da #7 e descrição dos checks locais/limites. Anexar o PR à tarefa. Nenhum merge automático.
3. Aguardar o run `CI` de `pull_request`; exigir ambos os jobs aprovados, ler logs/summary, verificar os quatro resultados Windows e skips reais. Registrar link do run, head final da PR, merge SHA efetivamente testado, data e ambientes. Uma aprovação de review não substitui esse run.
4. `workflow_dispatch` só fica disponível após o workflow existir em `main`. Até lá, a validação da PR é pelo merge ref. Quando disponível, executar manualmente na branch desejada se precisar comprovar seu head exato.
5. Após eventual merge autorizado separadamente, conferir o run de `push` em `main` no SHA integrado. Acrescentar links/evidências sem reescrever históricos. Não fechar a #7 antes de satisfazer esses critérios.

Sem cache persistente ou upload, secrets novos, mudanças de billing/segurança/branch protection, tags/releases, versão nova ou instalador. A matriz não promete suporte macOS/multiplataforma ao usuário. Diálogo nativo substituído: sem inspeção visual, teclado físico, leitor de tela ou duplo clique no executável. [Revisão independente Standards/Spec](code-review.md): zero achados em cada eixo; aceite remoto continua aberto.
