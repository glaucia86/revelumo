# Plano de implementação: histórico de exposição JPEG

Base: `8b8aa98921760945b5d708f0f481b34d1423a314`. Execução na máquina cloud. Contrato completo aprovado em 12/10/2026; publicação e merge autorizados após gates e CI.

## Contrato recebido

- Histórico persistente por UUID após reabrir; um arraste/edição numérica por passo; Redefinir desfazível; novo ajuste após Undo remove Redo.
- Apenas valores e metadados de exposição. Originais somente leitura; pipeline e identidade do contrato #12 preservados.
- Retenção aprovada: últimos 100 passos por foto, sem expiração por tempo.
- Enter/blur encerra entrada numérica; pointerup/cancel/blur encerra arraste; keyup encerra sequência de teclas do slider. Comparação e gestos sem mudança não acrescentam passos.

## Fronteiras e arquitetura

Seams: `Library` com filesystem/SQLite reais; API preload/IPC no Electron empacotado; DOM/Canvas/teclado Chromium. Não testar métodos privados nem consultar tabelas para inferir efeitos; SQL somente prepara fixtures antigas e bloqueios externos.

`catalog.ts`: v5→v6 transacional, estados de exposição e cursor por foto; checkpoint ativo separado preserva o futuro enquanto um gesto pode retornar ao início. Receita, histórico e cursor são gravados na mesma transação. Receita antiga torna-se baseline sem inventar 0→EV.

`library.ts`: sessão e revisão continuam serializadas; mutação revalida SHA-256 no commit. Retry da mesma revisão/operação retorna confirmação anterior; uma operação diferente na mesma revisão é recusada.

`contracts.ts`, `requests.ts`, `preload.ts`, `main/index.ts`: exposição aceita lote estrito de gestos pequenos e comando limitado Undo/Redo. Gestos concluídos entre autosaves não desaparecem; ticks do gesto ativo são coalescidos.

`ExposureEditor.tsx`: revisão de rascunho separada da identidade do gesto; apenas uma gravação em execução; preserva gestos concluídos pendentes, texto numérico incompleto, flush/retry/descarte e respostas associadas à sessão/foto/revisão. Undo/Redo aguardam flush antes da transição persistida.

## Fatias TDD

- [x] RED→GREEN: ajuste completo pode ser desfeito/refeito depois de reabrir SQLite.
- [x] RED→GREEN: disponibilidade e migração v5 com receita não neutra e metadados preservados.
- [x] RED→GREEN: checkpoint não fragmenta gesto; dois gestos no mesmo autosave permanecem distintos.
- [x] Probes: cursor persistente, reset, novo ramo, no-op preservando Redo, checkpoint interrompido, bloqueio e retry idempotente.
- [x] RED→GREEN: controles acessíveis → pixels → receita → reabertura no pacote Electron.
- [x] RED→GREEN: gestos reais de mouse/teclado, pausas >300 ms, Enter/blur, undo durante autosave, falhas/retry/descarte/fechamento e isolamento por foto.
- [x] Payloads adversariais, replay, confirmação perdida e fila maior que um lote IPC.
- [x] Typecheck, 81 testes core, pacote e regressão final em 26 processos Electron; Standards/Spec independentes e recheck sem bloqueadores.
- [x] QA visual cloud independente: entrada pausada, arraste, reset, grade e novo processo conservando Redo.
- [x] Retenção 100 aprovada e implementada com RED→GREEN em Library/SQLite; checkpoint, no-op, overflow, novo ramo e isolamento cobertos.
- [x] Retenção no pacote final: 84 core e 28 processos Electron; recheck independente Standards/Spec sem bloqueadores.
- [ ] Publicação draft, CI do SHA final, merge e CI de main (resultados no PR).

Contrato local preparado: [issue-16-contract.md](issue-16-contract.md). Evidências e limites: [relatório](../evidence/issue-16/report.md). O limite de 1024 gestos por mensagem IPC protege o transporte; a fila é drenada em lotes e isso não define retenção.

## Casos de revisão

1. Confirmação perdida depois do commit não pode duplicar gesto ou Undo.
2. Dois gestos rápidos não podem virar um só por causa do debounce.
3. Voltar ao valor inicial após checkpoint não deve destruir Redo.
4. Último EV é insuficiente para declarar Salvo: a fronteira do gesto também precisa persistir.
5. Reabertura após checkpoint recupera somente o persistido, sem prometer rascunhos não confirmados.
