# Issue 17 — núcleo JPEG e contrato de integração

[Issue #17](https://github.com/glaucia86/revelumo/issues/17). Base do núcleo: `8b8aa98921760945b5d708f0f481b34d1423a314`. Este documento distingue decisões de produto aprovadas dos detalhes de engenharia adotados. O núcleo foi preparado isoladamente; a integração segue sobre a #16 (main `9d7bbea8ddc9be1e81eade099e4c7876708c844c`). Ver [evidências atuais](../evidence/issue-17/report.md) para gates executados e pendentes.

## Escopo aprovado

A responsável confirmou Temperatura e Matiz relativos, com prévia e salvamento automático. Nesta entrega, histórico continua somente de exposição; desfazer exposição preserva balanço de branco e recorte. A integração é sequencial após a #16, que introduz schema v6. Nenhuma nova dependência, motor, serviço, IA, custo ou formato RAW foi autorizado por este trabalho.

## Núcleo isolado implementado

`applyJpegAdjustments(base, { exposureTenths, temperature, tint })`, de `src/processing/jpeg-adjustments.ts`, transforma RGBA sRGB de 8 bits em uma cópia nova, sem alterar base/alpha e sem estado retido. O chamador deve fornecer sempre a base original de edição. A função não decodifica, orienta, reduz ou recorta e não escolhe um caminho de arquivo. Parâmetros inválidos e pixels RGBA incompletos geram `RangeError`; não existe coerção/clamp silencioso dos controles.

Detalhes de engenharia adotados e verificáveis, não escolhas individualmente atribuídas à usuária:

- T e M: inteiros de −100 a +100, passo 1, neutro 0. T positivo aquece, negativo esfria; M positivo puxa para magenta, negativo para verde.
- Exposição mantém décimos inteiros de −30 a +30.
- RGB é linearizado pela curva sRGB. Ganhos brutos são `[2^(T/200), 2^(−M/200), 2^(−T/200)]`; dividem-se pelo produto escalar desses ganhos com `[87098/409605, 175762/245763, 12673/175545]`, a linha Y sRGB→XYZ D65 do W3C.
- WB e ganho de exposição `2^(EV)` são compostos em linear RGB; aplica-se clipping só ao fim, antes da curva inversa e do arredondamento em 8 bits. Três LUTs pequenas implementam a operação.
- WB neutro pula normalização e preserva exatamente a exposição anterior para todos os valores canônicos. Tudo neutro devolve cópia byte a byte.
- A normalização preserva Y do cinza neutro antes de clipping, não a luminância de toda cor. Trata-se de um operador relativo próprio para JPEG já renderizado. Não há temperatura de captura, adaptação cromática física, recuperação de informação ausente ou promessa de compatibilidade com Lightroom/RAW. Highlights podem clipar e o resultado pode perder saturação/detalhes.

[Proveniência, fontes e fixtures](../test/fixtures/jpeg-adjustments-provenance.md).

## Contrato de integração implementado

A integração usa schema v7 e processingVersion 2 após a #16. O núcleo isolado continua sem dependências de catálogo/UI. Os parágrafos sobre recorte são requisitos de preservação para a próxima feature, ainda não implementada nesta entrega.

1. Receita: adicionar T/M canônicos com default zero e versão explícita do novo pipeline. Schema v7 após v6 e `processingVersion: 2` para toda receita normalizada, migrando v1 com WB neutro sem alterar sua aparência. A restrição SQL v1 atual exigirá migração transacional da tabela; rejeitar versões futuras. Não sobrescrever histórico, UUID, hash, caminho, estrelas, flags ou miniaturas. Futuro recorte adiciona seu próprio estado, preservado por todas as operações parciais.
2. IPC/main: uma sessão/revisão e a serialização existentes para a receita inteira. Payload estrito por UUID/sessão/revisão, sem paths livres, com valores canônicos. Salvar WB-only não altera EV, cursor, estados ou futuro Redo de exposição. Commit de EV/histórico atualiza somente os campos correspondentes, preservando T/M. Retry da mesma revisão deve conferir o mesmo snapshot; resposta confirma toda a receita solicitada. SHA-256 é revalidado ao persistir, sem decodificar a cada ajuste.
3. Autosave: ampliar a fila atual para snapshots completos, incluindo lote opcional de gestos EV; debounce 300 ms, uma gravação em execução e último rascunho coalescido. Não criar um salvador concorrente para WB. A #16 deriva o pedido de `last!.revision` da fila de gestos de exposição: alteração só de WB tem fila vazia e precisa ser tratada explicitamente. Lotes limitados de gestos devem associar cada snapshot à revisão correta, sem confirmar WB mais novo junto de lote antigo.
4. Undo/Redo: primeiro finalizar o gesto EV e flushar a receita inteira. O movimento do histórico altera somente EV e retorna a receita inteira atualizada; T/M e recorte permanecem. WB-only não cria passo EV nem apaga Redo. Uma falha mantém rascunho/sessão para retry; descarte afeta somente alterações ainda não confirmadas.
5. Worker: importar o módulo no worker existente e manter uma execução mais um último pedido esperando. `prepare` preserva o decoder Chromium, EXIF uma vez, conversão sRGB e base até 2048 px sem upscale. `render` recebe snapshot completo; cada resultado deriva da base, nunca da saída anterior. UUID/sessão e identificador monotônico do pedido de prévia descartam resultados obsoletos. O identificador de prévia precisa distinguir também comparação que não muda a revisão persistida. Fechar/cancelar sessão termina o worker e libera referências; não declarar cancelamento cooperativo da função pura síncrona.
6. UI controlada: labels “Temperatura”/“Matiz” e indicação “relativo”, sliders e campos numéricos inteiros. Texto em edição é separado do último número válido; `-`, vazio, fracionários e fora da faixa não criam revisão. Blur/Enter restauram valor canônico. Botão “Redefinir balanço de branco” zera T/M juntos preservando EV/recorte. Comparar com 0 EV mantém o WB atual e o recorte; se for adicionada comparação específica de WB, zera só T/M temporariamente. Campos individuais e nomes de funções são reversíveis; não adicionar conta-gotas, presets ou auto-WB.
7. Estado: reabrir e relocalizar JPEG de mesmo SHA recuperam T/M. Ausência/substituição do original mantém ajustes confirmados e impede novo commit quando a identidade não puder ser validada. Não regenerar base a partir de JPEG diferente sob o mesmo ID. Crash recupera apenas receita confirmada, sem nova promessa de recuperação de rascunhos.

## Sequência TDD e critérios de verificação

A seam pura foi explicitamente coordenada para preparação paralela; não substitui a fatia vertical completa. A integração foi iniciada no snapshot imutável da #16, após releitura de contratos/testes. Em cada linha abaixo: escrever um teste vermelho na seam pública, implementar o mínimo, executar verde antes da próxima linha.

1. Library/SQLite + renderer/IPC + worker: alterar T, ver a prévia correta, aguardar confirmação, fechar/reabrir e recuperar T; JPEG SHA idêntico. Incluir migração real v6→v7 com receita e histórico não neutros. Um primeiro slider sem o percurso persistido não encerra esta fatia.
2. Acrescentar M/reset/teclado ao mesmo percurso; mudança de WB sem gestos EV, interleaving rápido EV→WB→EV, gesto longo EV com WB e lotes EV. Conferir snapshot confirmado e exibido, sem segunda fila de autosave.
3. Undo/Redo depois de WB/recorte, inclusive futuro Redo existente, reinício e relocalização; não mudar campos alheios nem ampliar o histórico para WB. Testar original ausente/alterado, locks SQLite, resposta inválida e retry idempotente.
4. Corridas Electron: atrasar preview/save, navegar, comparar e encerrar; somente o último ID/sessão/pedido é mostrado, fechar aguarda flush e falhas retêm a sessão. Repetir descarte com commit em andamento sem prometer desfazer commit já concluído.
5. Cor real: fixtures sintéticas sRGB/P3, oito EXIF, grayscale/primárias/highlights e resolução limitada. Neutralidade deve ser exata sobre a mesma base; usar baseline decode conhecido e declarar tolerâncias de decoder separadamente. Confirmar hashes dos JPEGs antes/depois e que a base não acumula ajustes. Inspeção visual/AX do aplicativo permanece necessária; não chamar teste de pixels de validação perceptual.
6. Tipos, suíte completa, pacote, regressões #12/#16, reviews Standards e Spec independentes e CI do SHA final antes de merge coordenado. Linux cloud não comprova Windows/macOS, seletor nativo ou o alvo 8 GB sem GPU.
