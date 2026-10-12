# Spec — revisão independente

Base: `8b8aa98921760945b5d708f0f481b34d1423a314`. Revisão inicial e recheck feitos por agente distinto do implementador, sem alterações de arquivos. O diff revisado era WIP efetivo, não `base...HEAD` vazio. Snapshot final: SHA-256 `275022102e995a3b599b4a39a8e4c0eb6a8ab182b6791d51b899c87bfa567edb`; documentação de evidências adicionada depois não altera produto/harness.

## Achados iniciais e correções

- Confirmação perdida de save seguida por novo gesto: corrigida. O renderer conserva o snapshot original até confirmação antes de enviar alterações posteriores. Reproduzido RED e verificado GREEN no pacote real.
- Fila acima de 1024 gestos: corrigida. O prefixo usa EV/revisão do seu último gesto; a confirmação remove somente revisões abrangidas, preservando atualizações posteriores do gesto ativo. RED/GREEN real.
- Fragmentação por tecla não relacionada: corrigida. Pointer/key são separados, teclas relevantes rastreadas e o gesto é encerrado na perda de foco. RED/GREEN real, incluindo a perda de keyup ao sair da janela.

## Recheck final — parecer do revisor

Nenhum novo bloqueador confirmado. Retenção continua decisão aberta, não defeito inferido. Nenhuma expansão indevida de escopo identificada. O limite 1024 está explicitamente restrito ao transporte; não limita a retenção histórica.

Verificação independente: 81/81 testes core passaram. Probe com Library/SQLite reais: confirmação perdida de checkpoint incompleto → retry idêntico → conclusão sem mudança preservando Redo → reabertura. Probe com 1026 gestos distintos em lotes limitados, repetição idempotente do prefixo, 1026 operações Undo e reabertura: valores, cursor e contagem de Redo preservados.

O revisor também inspecionou interações entre flush, requisição de histórico pendente, descarte e aposentadoria da sessão, sem regressão nova demonstrável. Electron/CUA não foram executados por esse revisor. No momento do parecer, regressão Electron final, QA visual e CI eram gates ainda pendentes; os resultados posteriores pertencem ao [relatório do implementador](report.md).

Resumo Spec: três achados iniciais corrigidos; zero bloqueadores remanescentes confirmados no recheck. Retenção e gates externos continuam explicitamente abertos.

## Delta após aprovação da retenção

Snapshot SHA-256 `24d8b87e9f5f0b3988d8aaeb48c643ec3c0ecadc36181406359dab24b6f7e6b8`, contra `872d609`: nenhum requisito parcial, escopo extra ou achado bloqueante confirmado no delta. Publicação/CI são gates externos, não executados por esse revisor.

Até 101 valores representam 100 transições e baseline. Redo é descartado antes de limitar um ramo novo. Materializar apenas mudanças efetivas preserva no-op/checkpoints; disponibilidade é limitada a 100 e a transação permanece atômica. Não há expiração, snapshots de WB/recorte ou alterações de originais.

Verificação independente: 84/84 core passaram. Probe Library/SQLite com 1026 gestos em dois lotes e retry idempotente do primeiro disponibilizou exatamente 100 Undo; o 101º não ultrapassou o baseline. Reabertura conservou 100 Redo. Checkpoint/no-op no meio conservou 50 Undo/50 Redo; novo ramo nesse ponto gerou 51 Undo/0 Redo sem perder baseline. JPEG byte a byte inalterado.

Limitação confirmada: bancos v6 ilimitados de versões preparatórias inéditas não são normalizados. Eram exclusivamente sintéticos e descartáveis; a migração suportada e pública é v5→v6. Não é defeito desta entrega. Nenhum arquivo alterado, sem Electron/CUA nessa revisão. A aprovação de retenção substitui a pendência do parecer inicial.
