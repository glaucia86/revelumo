# Revisão independente — issue #17

## Spec — snapshot inicial

Base `9d7bbea8ddc9be1e81eade099e4c7876708c844c`, local `58dcdfb3d988b3b8ae26ba346e841714a56dfd67`, tree `9cd3b2d2adb1aa774a5df8144c0835b22b0e119c` igual ao primeiro head remoto `eda1fb339ab7662c60f2b4581463505f7a02f222`. Eixo executado sem receber parecer Standards.

1. **P2 — Undo/Redo aceita alteração indevida de WB na confirmação.** `ExposureEditor.tsx:93–106`, validação 70–73. Contrato: histórico muda apenas EV; T/M permanecem; resposta inválida/retry devem ser testados. Pedido só com revisão/direção ignora comparação de T/M. Probe independente reproduziu SQLite T100, UI T99/Salvo após ACK adulterado; gesto EV seguinte gravou T99. Capturar/validar campos preservados após flush.
2. **P2 — WB encoberto na janela mínima.** `style.css:9–16`, painel `ExposureEditor.tsx:294–304`. Controles/previews acessíveis exigidos pela issue/contrato. Em 760×540, Temperatura y360–376 ficou sob classificação y331; hit-test false. Acomodar conteúdo sem sobreposição.

Sem outros requisitos ausentes, escopo extra ou erros confirmados. Migração, WB-only, lotes/revisões, Redo/identidade e processamento coerentes. Reexecução independente: 100 testes Node e typecheck passaram. Parecer não aprova alterações posteriores/CI. Correções implementadas e testes RED/GREEN registrados. Reconferência Spec independente de `0b1efe32041466842e1e1b0d32093f9c20ad746d`: os dois P2 corrigidos, nenhum remanescente. O revisor reexecutou 100 testes e typecheck em snapshot isolado, conferiu testes/logs Electron, cor/EXIF e capturas. Não reexecutou Electron nessa reconferência.

## Standards

Snapshot `0b1efe32041466842e1e1b0d32093f9c20ad746d`, tree `44770aa99c6bd4cfc6e76a0f2b5f561b48c3346a`. Eixo independente, sem consultar Spec. Zero violações documentadas. Reexecução de 33 testes JPEG/WB/exposição/histórico em snapshot isolado: todos passaram. CI remoto e Electron não reexecutados pelo revisor.

Uma heurística **P3 não bloqueante — possível Mysterious Name** em `Catalog.saveExposure`/`changeExposureHistory`: nomes restringiam verbalmente a transação, que passou a incluir WB. A API pública `Library.saveExposure` permanece; métodos internos foram renomeados para `saveAdjustmentCheckpoint` e `changeRecipeAndExposureHistory`, com os chamadores atualizados. Nenhuma semântica mudou; core 100/100, typecheck e package novamente aprovados. Sem outras observações de manutenção justificadas nesta fatia.

Resumo por eixo: Spec 2 P2 corrigidos e reconferidos; Standards 0 violações, 1 P3 não bloqueante corrigido por renomeação. CI é gate separado, não substituído por estes pareceres.
