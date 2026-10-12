# 0005: Balanço de branco relativo JPEG

Contrato de produto aprovado na [issue #17](https://github.com/glaucia86/revelumo/issues/17): Temperatura e Matiz relativos, prévia e autosave. Histórico permanece exclusivamente de exposição, preservando WB. O [contrato técnico](../issue-17-core-integration.md) registra fórmula, limites e fontes; estes são decisões verificáveis de engenharia, não uma escala Kelvin ou uma simulação RAW.

Schema v7 migra transacionalmente receitas v1 para processingVersion 2 com T/M neutros; EV, histórico, identidade, localização, miniaturas e classificação permanecem. `saveAdjustments` transporta snapshot completo com lote opcional de gestos EV. Uma única fila, sessão e revisão protegem EV/T/M. WB-only usa lote vazio e não avança/apaga Undo/Redo. A operação restrita `saveExposure` permanece para clientes internos e preserva WB.

Cada gesto EV pendente carrega o snapshot associado à sua revisão. Lotes de 1024 gestos não podem confirmar WB mais novo junto de uma revisão antiga. Retry guarda o pedido exato até confirmação integral. Undo/Redo primeiro faz flush da receita, altera somente EV e devolve a receita completa. Fechamento, retry e descarte mantêm a política da ADR 0004.

O worker reaproveita a base sRGB orientada/reduzida até 2048 px; nunca reaplica à saída anterior. WB e EV são compostos em linear antes do clipping único. WB neutro mantém exatamente o caminho anterior de exposição. Além da revisão persistida, cada pedido de prévia tem sequência própria, inclusive comparação 0 EV, impedindo que resposta antiga substitua a visualização mais recente. Não há cancelamento cooperativo do loop síncrono: descarta-se resultado obsoleto e termina-se o worker ao encerrar a sessão.

A UI preserva texto numérico incompleto e só aceita inteiros −100…100; blur/Enter restauram o último válido. Reset zera T/M juntos e preserva EV. Comparar com 0 EV mantém WB. A aparência dos controles segue a interface existente; nenhuma reformulação visual ampla está incluída.

Esta decisão evolui as receitas e o worker da ADR 0004. Mantém seus limites de decoder, memória, 8 bits, gamut e clipping. Não introduz RAW, conta-gotas, preset, auto-WB, exportação, recorte, serviço ou dependência. [Verificação e limites atuais](../../evidence/issue-17/report.md).
