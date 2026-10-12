# Revisão independente — issue #17

## Spec — snapshot inicial

Base `9d7bbea8ddc9be1e81eade099e4c7876708c844c`, local `58dcdfb3d988b3b8ae26ba346e841714a56dfd67`, tree `9cd3b2d2adb1aa774a5df8144c0835b22b0e119c` igual ao primeiro head remoto `eda1fb339ab7662c60f2b4581463505f7a02f222`. Eixo executado sem receber parecer Standards.

1. **P2 — Undo/Redo aceita alteração indevida de WB na confirmação.** `ExposureEditor.tsx:93–106`, validação 70–73. Contrato: histórico muda apenas EV; T/M permanecem; resposta inválida/retry devem ser testados. Pedido só com revisão/direção ignora comparação de T/M. Probe independente reproduziu SQLite T100, UI T99/Salvo após ACK adulterado; gesto EV seguinte gravou T99. Capturar/validar campos preservados após flush.
2. **P2 — WB encoberto na janela mínima.** `style.css:9–16`, painel `ExposureEditor.tsx:294–304`. Controles/previews acessíveis exigidos pela issue/contrato. Em 760×540, Temperatura y360–376 ficou sob classificação y331; hit-test false. Acomodar conteúdo sem sobreposição.

Sem outros requisitos ausentes, escopo extra ou erros confirmados. Migração, WB-only, lotes/revisões, Redo/identidade e processamento coerentes. Reexecução independente: 100 testes Node e typecheck passaram. Parecer não aprova alterações posteriores/CI. Correções implementadas e testes RED/GREEN registrados; reconferência pendente.

## Standards

Pendente no novo snapshot corrigido. Nenhum parecer de outro eixo é entregue ao revisor.
