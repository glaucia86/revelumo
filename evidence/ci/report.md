# Issue #7 — CI executada em Windows e Ubuntu

12/10/2026. Branch `ci/issue-7` em checkout isolado; [PR #9 em rascunho](https://github.com/glaucia86/revelumo/pull/9). Publicação e execução autorizadas explicitamente depois da entrega local. Nenhuma alteração no checkout anterior, em fotografias pessoais, credenciais ou configurações do GitHub; nenhum merge desta PR.

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

## Execução GitHub real — 12/10/2026

`main` revalidada antes de publicar: `b350629da67bde5cc7a625e9d34d7ed42ea96716`. Commit original `b7a209dbdc661d05dd37dc9d17d07887e00b0ae8` preservado na ancestralidade, sem amend/reset.

| Run | Head da PR | Merge ref verificado | Resultado |
| --- | --- | --- | --- |
| [Primeiro run](https://github.com/glaucia86/revelumo/actions/runs/38201526072) | `b7a209dbdc661d05dd37dc9d17d07887e00b0ae8` | `822d08aaedf5dfe31e3da1751f0ef64b7241106f` | Ubuntu aprovado; Windows falhou em `npm test` |
| [Run após correção](https://github.com/glaucia86/revelumo/actions/runs/38201738902) | `f16451fb07fd51597759ec783aeed28c0ce989ee` | `72fc723f4b485030918e5ae493e363d1c995530e` | Ambos os jobs concluídos com `success` |

A primeira falha Windows foi uma comparação entre o diretório temporário padrão com alias 8.3 `RUNNER~1` e o caminho canônico `runneradmin` do mesmo arquivo. O step da suíte agora define `TEMP`/`TMP` como `runner.temp`. Correção exclusivamente de ambiente; código do produto, asserções, timeout e propagação de falhas permanecem intactos, sem retries ou skips novos. Actionlint e revisão focal independente Standards/Spec aprovaram o ajuste antes de publicar `f16451f`.

O segundo run terminou às 03:57 UTC: Windows Server 2025 x64 (`windows-2025-vs2026`, imagem `20260925.250.1`), Ubuntu 24.04.5 x64 (imagem `20261004.327.1`), Node `24.21.0`, npm `11.19.0`. Ambos executaram `npm ci`, `npm run install:electron`, `npm run typecheck`, `npm test` e `npm run package`, todos aprovados.

- [Windows](https://github.com/glaucia86/revelumo/actions/runs/38201738902/job/114656428259): 59 testes, 57 aprovados, zero falhas e 2 skips POSIX FIFO. O caso de symlink passou nesse runner. `test:electron` e `test:relocation` passaram em `first` e `reopen`, quatro processos e dois diretórios novos sob RUNNER_TEMP; JSONs `ok: true` nos logs/summary. Electron `44.7.0` preservou sandbox, contextIsolation e webSecurity.
- [Ubuntu](https://github.com/glaucia86/revelumo/actions/runs/38201738902/job/114656428079): 59 aprovados, zero falhas/skips; pacote Linux gerado. Smokes Electron ignorados intencionalmente porque esta fatia os valida no Windows; motivo explícito no summary.
- Summaries concluíram nos dois jobs. Sem upload de artefatos ou cache persistente. Pacotes efêmeros descartados com os runners. O aviso de futura migração de `ubuntu-latest` para Ubuntu 26 não é falha do job.

Esta atualização documental sucede o run verde acima e dispara nova CI ao ser publicada. O [PR #9](https://github.com/glaucia86/revelumo/pull/9) registra o SHA final e o respectivo run terminal, sem reescrever estes resultados históricos. PRs verificam o merge ref; não confundir head da PR com SHA efetivamente checado. `workflow_dispatch` só fica disponível depois que o workflow existe em `main`.

**Pendência de integração:** após eventual merge autorizado separadamente, conferir o run de `push` em `main` no SHA integrado e acrescentar sua evidência. PR permanece em rascunho; nenhuma alteração de branch protection, fechamento da issue ou merge automático.

Sem cache persistente ou upload, secrets novos, mudanças de billing/segurança/branch protection, tags/releases, versão nova ou instalador. A matriz não promete suporte macOS/multiplataforma ao usuário. Diálogo nativo substituído: sem inspeção visual, teclado físico, leitor de tela ou duplo clique no executável. [Revisão independente Standards/Spec](code-review.md): zero achados em cada eixo; aceite remoto continua aberto.
