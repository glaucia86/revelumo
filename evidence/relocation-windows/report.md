# Issue #4: relocalização do original — Windows

12/10/2026. [Issue #4](https://github.com/glaucia86/revelumo/issues/4), aberta; sem push, merge, deploy ou mudança de visibilidade. Nenhuma fotografia pessoal ou credencial usada. Este relatório descreve execução local, não publicação nem validação visual/nativa Windows completa.

## Base e fluxo oficial

Base funcional explícita `b82e1f2c69d1e6324d6b56d01500c2c1ae765895` (review/Windows), preservada. Main confirmado em `9fcef67b61df6ae77678b0eff7185ead1e7cec2f`. Preparação oficial Matt Pocock separada em `ce3cbdc`, com três skills e oito arquivos verificados de `mattpocock/skills@49dd158`. Branch: `feat/issue-4-relocate`.

Ticket lido/anunciado e política aprovada registrada na [ADR 0003](../../docs-agents/adr/0003-original-identity-relocation.md). Aplicadas `implement` e `tdd` nas interfaces públicas de Library/arquivos/SQLite e API/renderer Electron. Testes focados e typechecks recorrentes durante as fatias, suíte completa ao fim. A revisão oficial em dois eixos está registrada no [relatório separado](code-review.md).

## Comportamento

- Schema v3 adiciona `sha256` nullable preservando registros e miniaturas. Novas importações registram os bytes validados; conteúdo diferente não sobrescreve hash, UUID, nome ou cache.
- Original consultado na página atual, ao abrir, voltar o foco e por `Verificar originais`. Leituras/hashes serializados, somente da página de até 48 fotos. Sem watcher, busca no disco ou hash de todo o catálogo durante migração.
- Estado distingue ausência (`ENOENT`/`ENOTDIR`), ilegibilidade/não regular e conteúdo diferente. Cache continua disponível sem original. Falha da consulta não é falsamente apresentada como ausência.
- Legado recebe hash somente do original acessível e validado, por estado, prévia, geração de miniatura ou reimportação. Não há comprovação histórica anterior ao primeiro hash. Registro já ausente/sem hash fica bloqueado e pode coexistir com nova importação em outro caminho.
- `relocate` recebe UUID via IPC; diálogo no main escolhe um JPEG. Leitura limitada e SHA-256 completo validam o candidato. Um `UPDATE` SQLite atômico muda só `path`, condicionado ao hash e à unicidade do caminho; UUID/nome/posição/cache ficam iguais.
- Cancelamento, incompatibilidade, conflito ou falha de gravação preservam a referência. Fechamento interrompe relocalização ainda enfileirada. O aplicativo nunca move, escreve ou apaga originais.

## Núcleo e TDD

58 testes: **55 aprovados, zero falhas, três skips** no Windows, Node 24.19.0. Typecheck TypeScript 5.9.3 passou. Suíte e typecheck repetidos após as correções da revisão: [log do núcleo](node-tests.txt), [typecheck](typecheck.txt). Pacote Windows x64 final gerado com exit 0: [build](build.txt). Novos testes: [relocation.test.ts](../../test/relocation.test.ts) e [requests.test.ts](../../test/requests.test.ts).

RED observados: reimportação diferente aceita; prévia do substituto; APIs de estado/relocalização ausentes; identidade não capturada por estado v2 ou prévia/miniatura v1; operação enfileirada gravava após fechamento; miniatura gerada do substituto; parser recusava novas rotas. Cada novo comportamento foi implementado após seu RED e reverificado. Guardas já existentes de cancelamento/conflito/legado ausente receberam verificações adicionais, sem alegar RED próprio para testes inicialmente verdes.

Quinze verificações de serviço usam filesystem/SQLite reais e decodificador substituído na fronteira, sem mocks do serviço ou banco. Falha real de gravação usa outra conexão com `BEGIN IMMEDIATE`: reabrir preserva referência/cache, e repetir após liberar o lock funciona.

Skips: alias por symlink (`EPERM` Windows), importação de FIFO e prévia de FIFO (POSIX/`mkfifo`, já ignorados). Nenhum novo teste de movimento foi ignorado. AppContainer retornou `EPERM` em `rename` da fixture; execução dos testes sintéticos fora do contêiner foi autorizada pelo runtime, sem alterar segurança ou desativar sandbox.

## Electron: RED e GREEN

[Runner](../../test/electron-relocation.cjs) carrega main/preload/renderer do `app.asar` com dados de usuário/sessão/crash isolados. Sandbox, isolamento, webSecurity e Node desabilitado são assertados. `dialog.showOpenDialog` fornece a seleção sintética e `dialog.showErrorBox` converte o diálogo de erro em falha do runner. São as duas substituições na fronteira de diálogo; serviço, SHA-256, SQLite, nativeImage e Chromium são reais.

Primeiro RED: ponte `originalStatus` ausente ([log](ipc-red.txt)). Segundo: ausência ainda sem badge no renderer ([log](renderer-red.txt)). GREEN completo:

1. Migrar catálogo v2 sintético com dois UUIDs, nomes e cache. Original acessível ganha hash; original movido antes do processo permanece bloqueado. Grade mostra ausência apesar do cache; abrir explica nova importação sem oferecer ação insegura.
2. Importar dois JPEGs: quatro registros. Runner move um original por `fs.renameSync`, fora do app; foco simulado atualiza a badge. Selecionar a foto oferece o botão acessível `Localizar original`. [Árvore AX resumida](locate-accessibility.json).
3. Cancelar mantém referência/lista. JPEG diferente, nativamente decodificável, com mesmo nome/tamanho é recusado. Caminho registrado com bytes idênticos também é recusado. Mensagens verificadas no renderer.
4. Candidato correto com outro nome restaura prévia decodificada e preserva UUID/nome/ordem/cache. Dialog adapter recebe `['openFile']`, sem seleção múltipla.
5. Legado antes acessível é movido depois de identificado e religado via API/main. Os cinco JPEGs sintéticos, incluindo candidato incorreto, mantêm bytes/hashes.
6. Segundo processo Electron preserva quatro IDs, referências atualizadas, cache/prévias, bloqueio do legado sem hash e cinco hashes.

[Primeiro resultado](first-result.json) · [Segundo processo](reopen-result.json). Electron 44.7.0, Node 24.21.0, Chromium 152.0.7977.130, SQLite 3.53.4. Ambos executados novamente sobre o pacote final após a revisão, com exit 0: [primeiro log](electron-first.txt), [reabertura](electron-reopen.txt).

## Regressão anterior

`test:electron` passou em dois processos: lote de 51 válidos/uma falha, 48 e três miniaturas decodificadas por página, papéis dos tiles, Enter simulado, prévia, cancelamento/deduplicação, cache com original temporariamente ausente e fixture EXIF6. Os 52 arquivos terminaram com bytes e caminhos iguais. Snapshot da ponte inclui somente os dois métodos autorizados novos.

Repetido sobre o pacote final após as correções, em catálogo sintético novo, com exit 0 nos dois processos: [primeiro log](regression-first.txt), [reabertura](regression-reopen.txt), [primeiro resultado](regression-first-result.json) e [segundo resultado](regression-reopen-result.json).

## Reprodução e limites

Depois de instalar dependências/Electron e gerar `npm run package`:

```powershell
npm test
npm run typecheck
npm run test:relocation -- <diretório-sintético-novo> first
npm run test:relocation -- <mesmo-diretório> reopen
```

`first` exige pasta nova; `reopen` reutiliza a mesma. Nunca usa catálogo padrão da pessoa. Fixtures movidas são cópias próprias do runner. Pasta `out/Revelumo-win32-x64` produzida, sem instalador/release. Integração requer execução Electron permitida pelo executor.

Limites nativos: `node_repl` não exposto, CUA nativo desabilitado e duas tentativas `cua.getState` encerraram o runtime; screenshot oculto falhou antes com `UnknownVizError`. Sem diálogo nativo real, inspeção visual, teclado físico, leitor de tela ou duplo clique em `Revelumo.exe`. Código empacotado é carregado no Electron oficial; foco/teclado são simulados no Chromium. Nenhuma configuração de segurança foi alterada.

Linux/macOS da #4 não executados; as 42 aprovações/E2E Linux anteriores são da base. Sem benchmark/8 GB, cor ou matriz de câmeras. Um arquivo pode mudar externamente depois de uma verificação: novas consultas/prévias/relocações verificam os bytes lidos, sem aceitar hash diferente silenciosamente.

## Revisão oficial e publicação

Revisão oficial concluída antes do commit local, sobre snapshot WIP indexado e não vazio desde `ce3cbdc`. Standards: uma divergência documental baixa e dois julgamentos de manutenção, corrigidos e reconferidos; zero pendentes. Spec: zero achados concretos. [Relatórios separados por eixo](code-review.md). Política aprovada, #5 não iniciada. A #4 permanece aberta para coordenação de publicação/verificação depois do commit local.
