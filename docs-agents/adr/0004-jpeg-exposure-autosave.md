# 0004: Exposição JPEG sRGB e autosave

Contrato aprovado: [issue #12](https://github.com/glaucia86/revelumo/issues/12). Exposição canônica em décimos inteiros de −30 a +30, versão de processamento 1. Schema v5 adiciona receitas associadas ao UUID; migração v4→v5 transacional, neutro quando não existe receita. Identidade, caminho, miniatura, estrelas e flags permanecem associados à foto.

A visualização de edição agora é uma **derivação sRGB até 2048 px**, mantendo proporção e sem upscale. O main ainda valida o JPEG e transmite seus bytes originais (com EXIF/ICC) uma vez ao abrir a foto. O worker empacotado usa `createImageBitmap` com orientação EXIF e conversão de cor padrão, desenha em OffscreenCanvas sRGB e guarda somente a base reduzida. A API `previewPhoto` preserva o JPEG original; o canvas mostrado para edição não é aquela prévia original de resolução completa. Não há exportação nem modificação das miniaturas.

Cada ajuste parte dos pixels neutros sRGB de 8 bits, lineariza RGB, multiplica por `2^EV`, limita a 1 e recodifica em sRGB de 8 bits. 0 EV copia exatamente a base. Comparar com 0 usa essa mesma base. Cores fora do gamut sRGB não são preservadas universalmente pela conversão; ganho de exposição pode fazer clipping irreversível na prévia, e redução/quantização em 8 bits podem perder detalhes. O JPEG já é uma imagem renderizada: isto não revela RAW nem recupera informação ausente. Os testes com perfis sRGB e matriz Display-P3 e oito orientações delimitam a compatibilidade observada, sem prometer fidelidade profissional universal.

O renderer mantém uma prévia em execução e somente o pedido mais recente esperando. Respostas carregam UUID, sessão e revisão. Encerrar a sessão termina o worker e libera suas referências e o canvas; não há cache de fotos editadas. A redução limita o trabalho por ajuste, mas **não limita a RAM da decodificação inicial**: `nativeImage` no main e Chromium ainda podem decodificar a resolução completa. Os working sets e sua retenção estão no relatório de evidências; não equivalem a RAM física exclusiva nem comprovam adequação a 8 GB.

Autosave tem debounce de 300 ms, uma gravação pendente por vez e coalescência do rascunho mais recente. O main cria/encerra sessões e serializa leitura de identidade, commit e relocalização; revisões antigas e sessões encerradas não podem substituir o valor atual. Salvo exige confirmação da transação para a revisão atual. Salvar revalida SHA-256 sem decodificar o JPEG; mover o controle não lê/hash/decode o original. Navegação e fechamento normal aguardam flush; falhas preservam a sessão e oferecem retry, permanecer ou descarte explícito. Um commit em execução pode concluir antes do descarte: descartar remove apenas o rascunho ainda não confirmado, não desfaz ajustes já persistidos.

Crash, encerramento forçado e interrupção durante o debounce recuperam somente a receita já persistida. Não há promessa de recuperar rascunhos, resistência adicional a falha de energia ou corrupção. Banco e originais permanecem locais; renderer isolado, IPC estrito, sem novos serviços/motor nativo. QA nativa/visual Windows da #4 continua pendente separadamente.

O campo numérico mantém seu texto de edição separado do último EV válido. A edição por caracteres preserva o sinal e o separador decimal em andamento. Textos sem número válido (como sinal isolado ou campo vazio) e entradas fora da faixa/passo não criam revisão, prévia ou gravação. Um prefixo que o controle nativo já reconhece como número válido pode atualizar o ajuste enquanto a digitação continua. Ao perder foco, o campo volta ao último EV válido, formatado com uma casa decimal. Slider e redefinição substituem também o texto em edição; a confirmação do autosave não o reformata durante a digitação.

## Bytes e ownership — issue #54

A abertura usa bytes comprimidos em `ArrayBuffer` de tamanho exato, preservando
EXIF/ICC, sem data URL/base64 no caminho da prévia original. `invoke` clona dados
main→preload e `contextBridge` copia dados preload→renderer; essas fronteiras não
transferem ownership. `PreviewSource.take()` entrega o buffer uma única vez e
remove a referência retida, antes de `postMessage(..., [bytes])` transferi-lo ao
Worker e destacar o buffer remetente. O Worker verifica tipo, tamanho (até 32 MiB)
e assinatura antes de criar o Blob; o decode nativo verifica o conteúdo completo.
Blob/decoder/canvas têm suas próprias representações: não é zero-copy ponta a
ponta nem decode streaming.

ACK atual, erro, substituição e saída mantêm `release()` idempotente e descarte
do Worker/base/superfície. ACK antigo continua sem alterar a tentativa atual.
Retry explícito pede novos bytes autenticados do original, preservando a sessão,
rascunho, receita confirmada e Undo/Redo; não reutiliza um buffer destacado.
Não mudam o algoritmo, cor, EXIF, limite de 2048 sem upscale, identidade,
persistência ou garantias de WB da ADR 0005. Inventário reproduzível:
[evidências da issue #54](../../evidence/issue-54/report.md).
