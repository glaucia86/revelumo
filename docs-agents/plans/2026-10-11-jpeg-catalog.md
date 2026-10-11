# Primeira fatia JPEG — plano de implementação

> Execução local, tarefa por tarefa, com TDD e revisão final independente.

**Objetivo:** selecionar um JPEG, visualizá-lo e reencontrar sua referência após reiniciar, preservando o original.
**Arquitetura:** SQLite somente no main; serviço de catálogo isolado da UI; preload com três operações tipadas; React sem Node/FS.
**Stack:** Electron, React, TypeScript e Forge; Node 24 e node:sqlite no núcleo.
**Especificação:** ../adr/0001-local-catalog-ipc.md e escopo aprovado na conversa de 11/10/2026.

## Restrições
- Sem gasto, IA no produto, backend ou sincronização cloud.
- Sem push, publicação, merge ou mudança de visibilidade.
- Não mover nem modificar originais; não implementar fatias 2–4.
- Snapshot tem proveniência registrada, mas não é clone nem contém histórico remoto.

## Revisão prioritária
Cancelamento sem registro; JPEG inválido/ilegível; original ausente após importação; payload IPC malformado; reabertura de schema incompatível. Testes correspondentes pertencem às tarefas abaixo.

## 1. Catálogo e importação testáveis
Arquivos: src/main/catalog.ts, src/main/library.ts, src/shared/contracts.ts, test/catalog.test.ts, test/library.test.ts.
Interface: Catalog.list(), Catalog.find(id), Catalog.add(path), Catalog.close(); Library.importSelected(path|null), Library.preview(id).
- [x] Testes de persistência, integridade, cancelamento, rejeição, ausência e schema futuro; observar RED.
- [x] Implementar mínimo e observar GREEN no conjunto inteiro.

## 2. Fronteira IPC e shell
Arquivos: src/shared/requests.ts, src/main/index.ts, src/preload.ts, src/renderer/App.tsx e configurações Forge/Vite.
Interface pública: importJpeg(), listPhotos(), previewPhoto(id); resultados serializáveis com falhas conhecidas.
- [x] Testar validação de payload antes de implementar.
- [x] Scaffold mínimo; fluxo React de biblioteca, importação e preview; impedir navegação e novas janelas.
- [x] Verificar TypeScript, build, runtime node:sqlite do Electron e reinício real quando dependências/desktop estiverem disponíveis.

## 3. Verificação e entrega
- [x] Rodar suíte Node completa; revisar código independentemente; registrar bloqueios e comandos não executados.
- [x] Teste Electron ponta a ponta: seleção, preview, fechar processo, abrir novamente, preservar hash.
- [x] Não declarar fatia concluída enquanto o caminho Electron real não tiver evidência.

Estado: gate da primeira fatia verificado no pacote Linux x64. Typecheck, build, importação, prévia e reinício do processo Electron passaram; relatório em ../../evidence/e2e-linux/report.md. Windows/macOS, modo dev e distribuição permanecem fora dessa evidência.
