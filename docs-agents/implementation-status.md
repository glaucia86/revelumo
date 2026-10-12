# Estado da implementação

## Issue #32: tradução do editor existente — 12/10/2026

- Fatia parcial: exposição, WB relativo, Undo/Redo, comparação 0 EV, classificação, disponibilidade/relocalização e recuperação/saída usam o contexto PT-BR/EN/ES existente. Recorte (#18) e exportação não foram inventados; a issue continua aberta para seu escopo restante.
- Erros/status são descritores tipados renderizados na língua ativa. Mensagens legacy do domínio continuam disponíveis; receitas, UUIDs, nomes e caminhos não são traduzidos. Nenhum algoritmo ou migração mudou.
- [Evidência e limites por plataforma](../evidence/editor-language/report.md). Sem novas dependências, instalador/release ou promessa de macOS.

## Issue #30: idioma persistente e catálogo — 12/10/2026

- Português do Brasil, inglês e espanhol no catálogo/importação e shell; escolha global em preferences.json no userData, independente do catálogo/fotos. Detecção ordenada do SO e fallback inglês, escrita atômica/serializada, arquivo futuro ou não legível preservado em modo somente leitura com tentativa após reparo.
- Mensagens tipadas com parâmetros, plurais e Intl; catálogo não depende de comparar frases portuguesas. Troca de idioma mantém seleção/filtros/página, rascunho numérico e salvamento em voo. Editor/exportação continuam fora desta fatia.
- [Verificação, revisões e limites](../evidence/language-catalog/report.md). Sem instalador/release, novas dependências ou validação macOS.

## PR #6: disponibilidade leve na grade - 12/10/2026

- Corrigido o comentário Copilot sobre I/O de `originalStatus` por página/foco/refresh. Grade usa `originalAvailability`: abre/confere/fecha descritor sem ler bytes, hash, decode ou identificação do legado; presença é explicitamente não verificada. Verificação completa e política SHA-256 continuam nas operações protegidas. Sem cache de identidade baseado em nome/tamanho/mtime.
- RED Electron com 96 leituras em 48 itens em cache; GREEN com zero conteúdo/hash/decode em página, navegação, foco e refresh. Substituto com metadados iguais continua bloqueado ao abrir. Windows: 56 aprovações, zero falhas, três skips (59 testes), typecheck/pacote e runners afetados passaram. [Evidências](../evidence/availability-windows/report.md).
- Medição delimitada já executada: pacote de ~367,8 MiB, sem instalador; memória de quatro processos em cenários sintéticos, sem somar RSS como RAM única. [Método, dados e limites](../evidence/availability-windows/resources.md). Sem otimizações especulativas ou validação no alvo de 8 GB.

## Issue #4: relocalização por identidade - 12/10/2026

- Decisão SHA-256/legado aprovada e registrada na [ADR 0003](adr/0003-original-identity-relocation.md) e na [issue #4](https://github.com/glaucia86/revelumo/issues/4), que permanece aberta. Base funcional `b82e1f2`; preparação oficial Matt Pocock separada em `ce3cbdc`; feature em `feat/issue-4-relocate`, sem publicação.
- Schema v3, hash imutável por registro, estado de ausência/diferença, relocalização de uma foto por diálogo no main, atualização atômica da referência e UI/IPC restritos implementados. Legado sem hash e já ausente é bloqueado com opção de nova importação; candidato não vira prova retroativa.
- Windows: 58 testes do núcleo, 55 aprovados/zero falhas/três skips, typecheck e pacote passaram. Electron real verificou migração v2, ausência no renderer, cancelamento, JPEG diferente com nome/tamanho iguais, conflito, sucesso por conteúdo, preservação de ID/nome/cache e reabertura em segundo processo. Cinco arquivos sintéticos mantiveram hashes.
- Regressão do lote/grade/teclado anteriores também passou em dois processos, com 52 arquivos sintéticos inalterados. Diálogo nativo substituído na fronteira do teste; sem inspeção visual Windows, leitor de tela ou Linux/macOS desta nova fatia. [Evidências e limites](../evidence/relocation-windows/report.md).
- Revisão oficial independente concluída sobre diff WIP indexado desde `ce3cbdc`, antes do commit: Standards encontrou uma divergência documental baixa e dois julgamentos de manutenção, resolvidos e reconferidos; Spec não encontrou falhas funcionais ou aumento indevido de escopo. [Relatórios por eixo](../evidence/relocation-windows/code-review.md). Suíte/typecheck e integração reverificados após as correções; #5 não iniciada.

## Preparação da terceira fatia e review Windows - 12/10/2026

- Base autoritativa `main` em `9fcef67`; PR #1 confirmado integrado. Relocalização aguarda coordenação do critério de identidade SHA-256 e de registros antigos sem hash.
- Corrigida semântica dos botões da grade com RED/GREEN na árvore de acessibilidade do Chromium Electron. Dois ajustes de README e limpeza dos bancos de teste no Windows concluídos, sem redesenho/capa alterada.
- Windows: `npm test` passou com 39 aprovados, zero falhas e três skips explicitados; typecheck e pacote x64 passaram. Smoke automatizado sobre `app.asar` verificou 51 IDs em dois processos Electron, lote misto, miniaturas, prévia, paginação e integridade de 52 fixtures sintéticas. Sandbox/isolamento preservados.
- Limites: diálogo nativo substituído no teste, sem screenshot/inspeção visual Windows; `Revelumo.exe` produzido, sem teste por duplo clique ou instalador. Linux não reexecutado; macOS pendente. [Relatório, regressão e evidências](../evidence/missing-originals-windows/review-windows.md).

## Segunda fatia: lote e grade verificados — 11/10/2026, 23:05 UTC

- 42/42 testes, typecheck e empacotamento Linux passaram. Revisão independente encontrou dois P2 de cancelamento/EXIF, corrigidos com regressões RED/GREEN.
- Seleção múltipla, progresso por arquivo, fila serial antes da leitura, erro individual, cache derivado SQLite v2 e grade de 48 itens por página implementados. Migração do catálogo anterior verificada no app real.
- E2E Linux: lote misto, reimportação, orientação miniatura/preview, 300 JPEGs sintéticos de 12 MP, paginação, reinício e encerramento durante lote novo. Oito itens do lote interrompido sobreviveram; os demais não foram retomados automaticamente.
- Originais sintéticos preservados (603 hashes iguais). [Relatório, logs e capturas](../evidence/batch-jpeg/report.md). [ADR 0002](adr/0002-batch-jpeg-thumbnails.md).
- Limites: sem benchmark no alvo 8 GB; sem Windows/macOS, matriz real de cor/câmeras ou E2E automatizado. Cache corrompido não é automaticamente regenerado; substituição externa do original não invalida miniatura até reimportação. Capa do README preservada.

## Checkpoint atual: gate Linux verificado — 11/10/2026, 22:44 UTC

- Dependências instaladas pelo registro npm com cache em pasta gravável; lockfile incluído. Electron 44.7.0, Forge 8.0.1, React 19.3.0, Vite 8.3.4 e TypeScript 5.9.3 efetivamente instalados.
- Typecheck TypeScript real passou (exit 0), suíte Node 25/25 passou e `npm run package` gerou o pacote Linux x64 (exit 0).
- Executável Linux abriu no desktop cloud, sem flags de desativação de sandbox. Testados diálogo/cancelamento, importação por referência, preview, reimportação, arquivo inválido, original ausente, EXIF6/8 e encerramento/reabertura real do processo.
- Fotografias sintéticas e referências persistiram; hashes SHA256 dos originais permaneceram iguais. Relatório e nove capturas em [e2e-linux/report.md](../evidence/e2e-linux/report.md).
- A configuração Forge aceita opcionalmente `electron_config_cache` como cache de downloads; sem alteração de HOME, credenciais ou controles de segurança. O script `install:electron` usa o instalador oficial incluído no pacote Electron.
- Capa/identidade visual aprovadas preservadas. Sem push, merge, publicação ou mudança de visibilidade.
- Auditoria de dependências não foi executada nesta etapa; a instalação não apresentou relatório de vulnerabilidades. `npm ls --depth=0` foi registrado, mas não substitui auditoria.

## Limites e próximos passos

O gate funcional da primeira fatia foi demonstrado no pacote Linux x64 deste ambiente, com fixtures sintéticas. Não significa MVP completo ou suporte multiplataforma. Pendentes: Windows/macOS, modo de desenvolvimento `npm start`, matriz real de fotografias/cor, desempenho de 8 GB, instaladores e E2E automatizado reutilizável. O caminho de digitar endereço + Enter no seletor nativo teve comportamento inconclusivo sob CUA; seleção por cliques e Open foi validada. Avisos DBus do ambiente não impediram os testes.

## Histórico da tentativa inicial (limitações abaixo foram superadas onde indicado acima)

11/10/2026. Aprovação recebida para executar localmente a primeira fatia e SQLite/IPC. Smart zone/dumb zone aplicada como contexto por responsabilidade, fontes curtas e handoff factual; sem percentuais mágicos ou leitura indiscriminada.

Base: snapshot GitHub ca4ae00e18b21b1bcca69e217e4034c4a1f5d0c2; branch local feat/jpeg-catalog-local; sem remoto.

Ambiente: Node 24.19 executa node:sqlite e node:test. Codex CLI instalado/autenticado, mas execução falha por filesystem read-only; não será contornado. Consulta npm cancelada pela revisão automática; dependências não instaladas. DISPLAY, tsc, vitest e Electron não detectados.

Regra de execução: avançar núcleo sem dependências externas; scaffold pode ser escrito, mas typecheck/build/E2E ficam pendentes até ambiente apto. Nenhum aplicativo pronto é alegado.

## Pesquisa técnica
- Electron 44.7.0 / Node 24.21: https://releases.electronjs.org/?channel=stable
- Forge 8.0.1: https://github.com/electron/forge/releases/tag/v8.0.1
- Configuração Vite/saídas .cjs verificadas no código oficial Forge 8.0.1: https://github.com/electron/forge/tree/v8.0.1/packages/plugin/vite/src/config
- React 19.3: https://react.dev/blog/2026/09/09/react-19-3
- Segurança Electron: https://www.electronjs.org/docs/latest/tutorial/security

## Evidências de execução
TDD do núcleo: stubs sem comportamento → testes falhando → implementação → suíte passando. Registros RED foram preservados no pacote de evidências. Tests de filesystem/SQLite usam dados reais; decodificador Electron é uma porta substituída nos testes de serviço. Isso não prova a UI ou o runtime Electron.

Não executados: instalação npm, typecheck com TypeScript, build Forge, aplicativo Electron, decodificação nativa real, E2E com seletor nativo/reinício, empacotamento ou testes Windows/macOS. Nenhuma conclusão de desempenho no alvo de 8 GB.

## Checkpoint final desta sessão
- 25/25 testes Node passaram no código atual em Linux com Node 24.19, incluindo reabertura em dois processos Node distintos, hashes do original e rejeição de FIFO sem bloqueio na importação e na prévia. A suíte não valida Electron nem outros sistemas operacionais.
- `npm test` também executou com sucesso; advertência do ambiente sobre `http-proxy` não é erro do aplicativo.
- `npm run typecheck` foi tentado e bloqueado por `tsc: not found` (exit 127). Nenhum typecheck foi concluído; execução TypeScript pelo Node remove tipos e não os valida.
- Revisão independente encontrou dois problemas: comparação da URL dev com/sem barra final e re-encode descartando EXIF. Ambos corrigidos, com testes de regressão e conferência independente das correções.
- A prévia agora preserva os bytes JPEG/EXIF/ICC para o renderer; não há redução de resolução nesta fatia. Orientação visual real ainda não testada.
- Nenhum outro bloqueio concreto foi encontrado na revisão de SQLite/preservação de originais/rotas restritas; isso não substitui testes no Electron.
- Os arquivos Electron, React e Forge são scaffold não verificado no runtime. Não houve RED/GREEN do adaptador Electron ou da UI, pois dependências estão indisponíveis. TDD executado cobre apenas o núcleo e helpers registrados nos testes.

## Verificação adicional de arquivos especiais

Em 11/10/2026, a leitura passou a abrir descritores com `O_RDONLY | O_NONBLOCK`, mantendo a rejeição de arquivos não regulares por `stat`. Dois testes de regressão com FIFOs reais verificam que importar ou abrir uma prévia não espera indefinidamente por um escritor. A suíte completa passou com 25 testes e nenhum skip neste ambiente Linux. Esses dois testes são ignorados no Windows e podem ser ignorados se `mkfifo` estiver ausente; portanto, o resultado não estabelece compatibilidade multiplataforma.

## Próximo passo original — superado parcialmente
O gate de typecheck, build e execução do pacote Linux foi cumprido no checkpoint acima. Permanecem as validações descritas em “Limites e próximos passos”. Os registros históricos foram preservados para distinguir tentativas bloqueadas dos resultados posteriores.
# Issue #13: filtros de biblioteca — 12/10/2026

Fatia local na branch `feat/issue-13-library-filters`, base `5aa6693`: estrelas mínimas 1–5/sem avaliação e flag por AND, consulta SQL restrita, filtros de sessão e retorno da prévia preservado. Sem schema/receitas/autosave novos. Windows: 67 testes Node (64 aprovados, três skips), typecheck/pacote e Electron oculto de filtros/grade/classificação/relocalização/disponibilidade/recursos passaram. Revisão independente Standards sem violações documentadas (uma observação baixa aceita); Spec sem achados. [Evidências, comandos e limites](../evidence/filters-windows/report.md). Commit local sem push/PR; integração com #12 e revalidação combinada ficam para o pai.
