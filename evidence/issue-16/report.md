# Histórico persistente de exposição — verificação local

12/10/2026. Base `8b8aa98921760945b5d708f0f481b34d1423a314`; branch local `feat/persistent-exposure-history`. [Contrato aprovado](../../docs-agents/issue-16-contract.md). A responsável confirmou 100 passos por foto sem expiração; retenção implementada e verificada após o checkpoint preparatório.

## Resultado observado

- Typecheck aprovado; 84/84 testes core, zero falhas e zero skips nesta execução Linux.
- Pacote Linux gerado; 28 processos Electron reais passaram na regressão final do mesmo artefato: 12 histórico, 8 exposição, 2 catálogo, 2 relocalização, 2 filtros e 2 classificação.
- Standards e Spec independentes reavaliaram o patch depois das correções, sem bloqueador remanescente confirmado. Relatórios separados nesta pasta.
- QA visual cloud independente aprovada nos fluxos descritos abaixo. CI remoto pendente da publicação do PR; merge depende de aprovação no SHA remoto.

Ambiente: máquina cloud Linux x64; Electron 44.7.0, Chromium 152.0.7977.130, SQLite Electron 3.53.4. Node core 24.19.0; Node Electron 24.21.0. [Identidade do artefato e snapshot revisado](artifact.json).

## TDD e defeitos encontrados

Os logs [red/](red/) preservam falhas reais anteriores às implementações/correções. O código foi construído em fatias, com execução RED antes de cada GREEN, não pela criação tardia de asserções já verdes.

1. Ausência de Undo persistente e disponibilidade: testes falharam por operação inexistente/contagens ausentes; implementação de histórico/cursor e migração tornou-os verdes.
2. Autosave durante o mesmo gesto criava um passo intermediário: Undo voltava a 1 EV em vez do início. Checkpoint separado e fronteira explícita de gesto corrigiram o caso, incluindo dois gestos no mesmo debounce.
3. Reapresentar ID de gesto concluído em revisão nova era aceito: agora rejeitado, preservando a receita confirmada.
4. UI não tinha controles de histórico e digitação numérica pausada fragmentava o gesto: testes do pacote falharam antes dos controles e agrupamento; pixels e reabertura passaram depois.
5. Resposta de Undo perdida depois do commit não tinha recuperação inequívoca: retry conserva direção/revisão e não aplica Undo duas vezes.
6. Resposta de save perdida seguida por nova edição ficava permanentemente rejeitada: o snapshot original agora é repetido até ACK antes de enviar o gesto posterior. Ambos os passos permanecem uma única vez.
7. Mais de 1024 gestos pendentes após bloqueio excediam o limite do transporte e não salvavam: drenagem em prefixos usa EV/revisão do último gesto de cada lote, conservando alterações posteriores.
8. Soltar uma tecla alheia fragmentava um arraste; perder foco da janela sem keyup unia gestos de teclado seguintes. Pointer/teclado foram separados, teclas relevantes são rastreadas e blur conclui o gesto.

Uma tentativa inicial do teste de arraste não movia o controle porque o evento CDP mouseMoved indicava `button: none`. O harness foi corrigido para `button: left`; isso era um defeito do teste e não foi contado como correção de produto.

## Evidências e reprodução

- [core-retention-tests.txt](core-retention-tests.txt): execução final da suíte Node com SQLite/filesystem reais.
- [package-retention.txt](package-retention.txt): saída da geração do pacote final com retenção.
- [electron-retention-results.json](electron-retention-results.json): resultados e códigos de saída dos 28 processos; interrupção forçada da regressão anterior é comprovada pelo processo seguinte e pode não emitir JSON próprio.
- `npm run typecheck`; `npm test`; `npm run package`.
- Em uma sessão gráfica, executar `npm run test:history -- <diretório-isolado> <modo>` em processos separados e nesta ordem: `first`, `reopen`, `gestures`, `history-failure`, `history-reopen`, `interrupt`, `interrupt-reopen`, `save-failure`, `many-pending`, `key-chord`, `retention`, `retention-reopen`.
- A regressão de exposição usa `first`, `reopen`, `interrupt`, `reopen`, `discard-race`, `reopen`, `race`, `race-reopen`, com outro diretório. Catálogo, relocalização, filtros e classificação usam `first`/`reopen` em diretórios próprios.
- A configuração de CI inclui os doze modos de histórico em Windows com timeout de cinco minutos e diretório isolado. A configuração foi revisada; sua execução remota ainda está pendente. As permissões, matriz, pins e ausência de upload/cache foram preservadas.

## Fronteiras, substituições e limites

Core observa Library com filesystem e SQLite reais. SQL nos testes prepara schema legado e bloqueios externos; não consulta tabelas privadas para provar efeitos. O decoder no core é substituído; a regressão Electron usa decoder, worker, Canvas, IPC, SQLite e pacote reais, com JPEGs sintéticos.

Os testes de resposta perdida/concorrência envolvem o handler IPC real e alteram apenas a entrega externa de sua resposta. Não substituem o commit. Eventos de mouse/teclado da suíte são enviados ao Chromium, não equivalem a inspeção visual, teclado físico ou leitor de tela. Os diálogos de arquivo da regressão são substituídos na fronteira do seletor.

O checkpoint recupera somente o último estado persistido. Não há promessa adicional sobre falha de energia, corrupção, memória de máquinas de 8 GB ou fidelidade profissional universal. Nenhum benchmark pesado foi repetido nesta fatia; o histórico armazena valores/metadados e não frames. Não houve uso da máquina Windows da responsável, validação macOS, instalador.

## QA visual independente

Antes do delta de retenção (que alterou somente o catálogo no produto), outro agente operou mouse/teclado e observou screenshots do pacote imutável inicial (SHA em artifact.json) na máquina cloud. A inspeção confirmou controles legíveis, disponibilidade de Undo/Redo e mudança visível de luminosidade, sem afirmar precisão colorimétrica pela captura.

- Entrada `1`, pausa até “Salvo”, continuação para `1.2` e Enter: um Undo voltou a `0.0`, Redo restaurou `1.2`.
- Arraste contínuo de aproximadamente dois segundos com ponto intermediário mantido: terminou em `2.3` EV; um Undo voltou diretamente ao estado anterior `-2.0`.
- Redefinir `2.3 → 0.0` pôde ser desfeito para `2.3`.
- Entrada `-1`, pausa, continuação para `-1.5` e Tab: agrupada em um único passo.
- Voltar à grade e reabrir preservou `2.3` e Redo. Fechar o processo e lançar outro preservou esse estado; Redo restaurou `-1.5`.
- Nenhum defeito novo observado nesses fluxos. Não houve teste de leitor de tela ou plataforma Windows.

Capturas locais de entrada pausada e novo processo com Redo disponível foram inspecionadas; imagens não incluídas na publicação. A foto cinza pequena é fixture sintética de 64×32 px, mostrada sem upscale. A prova de comportamento usa a interface visível; dados internos lidos durante a inspeção não substituem os testes pelos seams públicos.

## Retenção aprovada: RED → GREEN

O primeiro teste core observou 101 passos onde o contrato exige 100; o checkpoint no teto também anunciava 101. O pacote anterior falhou na nova asserção de retenção pela bridge real. Os três REDs estão em red/retention-*.txt.

O corte ocorre somente ao finalizar mudança efetiva, conserva 100 transições mais baseline e integra a transação existente. Checkpoint não corta prematuramente a história que um no-op precisa preservar. Treze testes de histórico (84 core no total) cobrem 101 ajustes, 100 Undo/Redo, reabertura nos dois extremos, checkpoint recuperado, no-op no teto, ramo novo, bloqueio/retry e isolamento por UUID. Dois novos processos Electron verificam o limite pela bridge, 100 cliques de Undo, pixels do baseline e Redo em novo processo. A regressão de 28 processos passou no artefato final.

Standards e Spec independentes aprovaram também o delta de retenção; seus pareceres estão nos relatórios separados. Migração suportada: catálogo público v5→v6. Bancos sintéticos descartáveis do checkpoint local v6 ilimitado nunca publicado não são um formato de entrada suportado.
