# Issue #17 — integração WB JPEG

12/10/2026, Linux cloud. Base integrada da #16: `9d7bbea8ddc9be1e81eade099e4c7876708c844c` (tree `d676211c866b289a63f644be19d73e58776763e4`). Núcleo e revisões isoladas: [relatório anterior](../issue-17-core/report.md). [Contrato e plano TDD](../../docs-agents/issue-17-core-integration.md), [ADR 0005](../../docs-agents/adr/0005-jpeg-white-balance.md).

## Resultado local

- `npm test`: 100 aprovados, zero falhas/skips; `npm run typecheck`: exit 0.
- `npm run package`: exit 0, Electron 44.7.0 Linux x64. Cache existente em pasta gravável via `electron_config_cache`; sem novas dependências/instalações.
- Doze processos Electron reais sobre o pacote, diretório sintético novo, todos exit 0: `first`, `reopen`, `controls`, `preview-race`, `save-race`, `history-ack`, `keyboard`, `many-pending`, `close-race`, `close-reopen`, `color`, `layout`. Relatórios JSON anexos registram runtime/checks.
- SQLite real: migração v6→v7, WB-only/reset preservando futuro Redo, retry idempotente, sessões/revisões inválidas, lock, relocalização, ausência/substituição, identidade e originais preservados.
- Fila única EV/WB: ACK atrasado/perdido/incorreto, 1025 gestos EV em falha SQLite com snapshots WB intermediário/final, Undo/Redo após flush WB e fechamento antes de debounce. Asserção exige lote real de 1024, evitando um falso teste de estresse.
- Preview: oracle literal cinza128 aquecido `[146,124,106]`; T/M100 `[161,117,117]`; neutro +1EV `[176,176,176]`. Replay de resposta antiga na comparação reproduziu falha antes do ID próprio de prévia; o mesmo teste passa após correção.
- Teclado Chromium via CDP e árvore AX: sinal incompleto/pausas, limites, fracionário/vazio rejeitados, blur/reset, sliders e campos numéricos nomeados. Janela oculta usa foco emulado explicitamente.

## TDD

Seam pública Library: teste de salvar/reabrir WB falhou sem `saveAdjustments`, passou após implementação transacional. Electron: primeiro teste falhou pela ausência do controle Temperatura, depois confirmou pixels/SQLite/reabertura. Reset teve RED próprio. O teste de resposta obsoleta revelou uma falha real: a revisão persistida não distinguia comparação 0 EV; uma sequência exclusiva de preview corrigiu o caso. Testes do núcleo usam fixtures Decimal independentes, corpus congelado dos 61 EVs anteriores e mutações registradas no relatório isolado.

Dois erros de harness foram diagnosticados, não tratados como bugs do produto: blur em campo sem foco; loop de 1025 gestos em janela oculta sem foco não encerrava cada gesto. A versão atual ativa foco CDP e exige lote 1024 antes de aceitar a cobertura.

## Gates por snapshot

Os registros abaixo distinguem cada snapshot. A aprovação para merge exige CI verde associado ao head corrente do [PR #28](https://github.com/glaucia86/revelumo/pull/28), além das revisões independentes; resultados históricos não substituem esse gate. Este documento não é uma publicação/release.

Limites: dados sintéticos, diálogo substituído, sem leitor de tela/teclado físico, sem Windows local/macOS, sem teste no hardware-alvo de 8 GB. Sem instaladores, lançamento, IA, RAW, exportação, recorte ou nova stack. O README está fora desta alteração por coordenação do estudo visual.

## Revisão e correções verificadas

- Spec independente do snapshot inicial: dois P2, ACK histórico sem validar T/M e controles cortados na janela mínima. [Parecer](code-review.md). Ambos tiveram RED real no Electron e regressão GREEN no pacote corrigido: `history-ack` rejeita alteração de T e M nos ACKs de Undo/Redo, preserva draft e retry; `layout` exige hit-test/alcance dos controles em 760×540. O pedido de histórico agora congela T/M após flush; o painel tem rolagem contida.
- Cor integrada: sRGB/P3 + WB100/100 e EV−1 contra Decimal/LittleCMS (tolerância 4); EXIF1–8 com quadrantes (tolerância 6), ordem/dimensões exatas. Reset exige recuperar a base exatamente; dez hashes preservados. [Proveniência](../../test/fixtures/jpeg-adjustments-provenance.md).
- Inspeção visual no aplicativo Linux cloud (captura de conteúdo 1180×784) mostrou labels/valores/reset e status legíveis, sem sobreposição. O teste de tamanho mínimo revelou o problema corrigido acima; a inspeção final confirmou WB legível e alcançável na janela mínima 760×540 (captura de conteúdo 760×512), com rolagem necessária para alternar prévia/controles nessa altura.
- Primeiro CI: [run 38269097695](https://github.com/glaucia86/revelumo/actions/runs/38269097695): Ubuntu passou; Windows encontrou EPERM no teardown de um teste, pois o segundo Catalog fechava num after-hook posterior à remoção do diretório. Corrigido com finally que fecha a conexão antes do teardown. Nenhum assert funcional foi removido nem erro mascarado. O [CI seguinte 38270569588](https://github.com/glaucia86/revelumo/actions/runs/38270569588), head `4375f7fa4925940e9ca96f006f5e8b956e2e8bef`, passou Windows/Ubuntu incluindo os doze processos WB.
- Após fixes: core 100/100, typecheck e package exit 0; sequência WB completa de doze processos em diretório novo passou. Sem flags para desativar sandbox/GPU.

## Fechamento da verificação local

- Spec reconferiu os dois P2 no snapshot corrigido e não encontrou remanescentes. Standards: zero violações documentadas, uma heurística P3 de nomes internos, resolvida por renomeação mecânica sem mudança de API pública. [Pareceres separados](code-review.md).
- Após as correções funcionais, 28 processos de regressão completos passaram: importação, relocalização, filtros, classificação, exposição e histórico. [Resumo reproduzível](regression-summary.json). Os doze processos WB passaram em diretório novo. Após renomeação, core100/typecheck/package passaram novamente; o CI do head final permanece a fonte de seu resultado multiplataforma.
- Base README atualizada para main `54a2881c66fd46da7656d84730b0154b13529875`, tree `6fc35575a0dbc598a01825272a4d94ceb16513ae`. Os três READMEs aprovados foram preservados byte a byte; nenhuma alteração de narrativa/visual foi feita por esta fatia.
