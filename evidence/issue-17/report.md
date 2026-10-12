# Issue #17 — integração WB JPEG

12/10/2026, Linux cloud. Base integrada da #16: `9d7bbea8ddc9be1e81eade099e4c7876708c844c` (tree `d676211c866b289a63f644be19d73e58776763e4`). Núcleo e revisões isoladas: [relatório anterior](../issue-17-core/report.md). [Contrato e plano TDD](../../docs-agents/issue-17-core-integration.md), [ADR 0005](../../docs-agents/adr/0005-jpeg-white-balance.md).

## Resultado local

- `npm test`: 100 aprovados, zero falhas/skips; `npm run typecheck`: exit 0.
- `npm run package`: exit 0, Electron 44.7.0 Linux x64. Cache existente em pasta gravável via `electron_config_cache`; sem novas dependências/instalações.
- Nove processos Electron reais sobre o pacote, diretório sintético novo, todos exit 0: `first`, `reopen`, `controls`, `preview-race`, `save-race`, `keyboard`, `many-pending`, `close-race`, `close-reopen`. Relatórios JSON anexos registram runtime/checks.
- SQLite real: migração v6→v7, WB-only/reset preservando futuro Redo, retry idempotente, sessões/revisões inválidas, lock, relocalização, ausência/substituição, identidade e originais preservados.
- Fila única EV/WB: ACK atrasado/perdido/incorreto, 1025 gestos EV em falha SQLite com snapshots WB intermediário/final, Undo/Redo após flush WB e fechamento antes de debounce. Asserção exige lote real de 1024, evitando um falso teste de estresse.
- Preview: oracle literal cinza128 aquecido `[146,124,106]`; T/M100 `[161,117,117]`; neutro +1EV `[176,176,176]`. Replay de resposta antiga na comparação reproduziu falha antes do ID próprio de prévia; o mesmo teste passa após correção.
- Teclado Chromium via CDP e árvore AX: sinal incompleto/pausas, limites, fracionário/vazio rejeitados, blur/reset, sliders e campos numéricos nomeados. Janela oculta usa foco emulado explicitamente.

## TDD

Seam pública Library: teste de salvar/reabrir WB falhou sem `saveAdjustments`, passou após implementação transacional. Electron: primeiro teste falhou pela ausência do controle Temperatura, depois confirmou pixels/SQLite/reabertura. Reset teve RED próprio. O teste de resposta obsoleta revelou uma falha real: a revisão persistida não distinguia comparação 0 EV; uma sequência exclusiva de preview corrigiu o caso. Testes do núcleo usam fixtures Decimal independentes, corpus congelado dos 61 EVs anteriores e mutações registradas no relatório isolado.

Dois erros de harness foram diagnosticados, não tratados como bugs do produto: blur em campo sem foco; loop de 1025 gestos em janela oculta sem foco não encerrava cada gesto. A versão atual ativa foco CDP e exige lote 1024 antes de aceitar a cobertura.

## Gates ainda em andamento neste checkpoint

Regressão completa #12/#16, verificações adicionais de WB em perfis/EXIF, inspeção visual, revisões independentes Standards e Spec da integração e CI Windows/Ubuntu do SHA publicado. Este relatório não declara merge nem entrega final enquanto esses gates estiverem pendentes.

Limites: dados sintéticos, diálogo substituído, sem leitor de tela/teclado físico, sem Windows local/macOS, sem teste no hardware-alvo de 8 GB. Sem instaladores, lançamento, IA, RAW, exportação, recorte ou nova stack. O README está fora desta alteração por coordenação do estudo visual.
