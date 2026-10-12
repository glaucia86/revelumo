# Preparação da fonte autenticada de exportação JPEG

Issue #19, base `ab4c6965c63d68da512b32b144d487bc2735ea7c` (PRs #37/#38). Esta fatia **não integra exportação**: acrescenta somente `readVerifiedExportSource` no main. Não muda IPC, catálogo, editor, receita, idioma, recorte, decoder, encoder, publicação nem dependências. A issue continua aberta.

## Contrato da seam

`readVerifiedExportSource({ path, sha256, maximumBytes, signal? })` recebe um caminho interno resolvido pelo main, SHA-256 canônico previamente registrado, orçamento positivo inteiro seguro e sinal opcional. Retorna o próprio Buffer que foi comparado ao hash. Não reabre o caminho para decodificar. Não comprova validade JPEG; decoder e validação de metadados/dimensões são etapas posteriores. Não registra identidade de legado e não aceita nome, presença, tamanho ou data como substituto do SHA-256.

O contrato aceita symlink/hardlink **como fonte somente leitura** se os bytes correspondem ao hash. Isso não os autoriza como destino: o writer separado deve recusar qualquer destino existente, inclusive ambos os tipos de link, sem alterar inode/conteúdo original ou o link. O caso LightCraft observado preservou o original mas substituiu o hardlink de destino; aqui tal substituição não atende ao contrato de novo arquivo sem sobrescrita.

Abertura `O_RDONLY | O_NONBLOCK`; só arquivo regular. Tamanho maior que a cota falha antes da alocação. Aloca no máximo tamanho inicial + 1 byte (sentinela de crescimento), lê em pedaços de até 64 KiB, rejeita tamanho lido diferente, fecha o descritor e compara SHA-256 de todos os bytes. O objeto request é copiado antes do primeiro await. Código de erro é estável; mensagens técnicas não são UI localizada.

Erros: `IDENTITY_UNVERIFIED`, `INVALID_BUDGET`, `SOURCE_TOO_LARGE`, `NOT_REGULAR_FILE`, `SOURCE_CHANGED`, `IDENTITY_MISMATCH`, `SOURCE_UNREADABLE`, `CANCELED`. Falha de open/read/stat/close não devolve buffer. Causas de filesystem permanecem internas ao main, sem atravessar IPC diretamente.

## Memória, cancelamento e identidade no tempo

- O Buffer retornado pertence ao consumidor e é mutável; não é mapeamento do arquivo. O hash autentica o conteúdo no retorno, não mutações posteriores feitas pelo próprio consumidor. Consumidores confiáveis não devem alterá-lo antes de selecionar créditos/decodificar; pixels derivados ficam em outro buffer. Transferência para worker deve ser coordenada com a necessidade de metadados para não destacar prematuramente o buffer fonte.
- Uma chamada retém uma única alocação de entrada com um byte extra. Views compartilham essa alocação. Não há cache global nem retenção após terminar a chamada, exceto referências do consumidor. Liberar referências após erro/cancelamento/job concluído permite GC; não há promessa de coleta imediata ou sobrescrita segura da memória.
- `maximumBytes` é orçamento desta chamada, não uma nova política de produto. A integração mantém o limite existente de 32 MiB até decisão diferente e serializa jobs **antes** de chamar a seam. Não basta limitar chamadas individualmente para controlar a soma de memória. Decodificação full-res, pixels, metadados, encoder e cópia do writer demandam orçamento adicional ainda não medido.
- Cancelamento cooperativo antes do open, ao receber descritor, após stat/antes da alocação, entre leituras e após fechamento/antes do hash. Um syscall em andamento e o hash síncrono não são interrompidos. Não há prazo máximo garantido em filesystem lento. Nenhum arquivo é publicado por esta seam, portanto cancelamento nunca remove arquivo de saída.
- Os bytes retornados são autenticados; o caminho pode mudar logo depois. O consumidor processa esse snapshot, não usa uma verificação anterior seguida de nova abertura. Um novo job lê/verifica novamente. Não prometer uma fotografia atômica de mudanças concorrentes nem proteção absoluta contra processo malicioso com o mesmo UID: o hash final prova igualdade dos bytes efetivamente obtidos, não posse exclusiva do arquivo ou estabilidade futura do nome.

## Reuso e integração serial

`Library.readJpeg` já faz leitura limitada para importação, preview selecionado, relocalização e ajuste. A disponibilidade da grade só abre/stat, sem hash. O helper atual não pode ser chamado daqui porque é privado, retorna falhas já orientadas à UI, tem limite fixo e não aceita cancelamento. Esta preparação não altera Library enquanto #32 acrescenta descritores localizados. Depois de integrar #32, extrair apenas o transporte bounded readonly para módulo compartilhado, mantendo contratos e regressões das duas seams; não adicionar autenticação à grade nem obrigar leitura dupla para um job de exportação.

A próxima fatia no main deve congelar revisão/processingVersion após flush confirmado, resolver identidade/caminho do catálogo e chamar esta seam uma vez na fila protegida. Fonte desconhecida ou revisão incompatível bloqueiam. Encoder recebe estes mesmos bytes, aplica orientação uma vez e usa os ajustes completos vigentes; nunca a prévia reduzida a 2048 px. Crop ainda não integrado não deve ser descartado silenciosamente. Somente após validar JPEG full-res, sRGB, qualidade 90, dimensões, cotas e créditos se chama `publishNewExport` da preparação separada e40ff70. UI/job-id/cancelamento de publicação ficam fora deste módulo.

## Evidência e limites

Resultados desta fatia em `evidence/issue-19-source/`. Execução Node 24/Linux com filesystem real; falhas/cancelamentos determinísticos injetados somente na fronteira de filesystem. O empacotamento Electron Linux deste checkout isolado passou usando dependências copiadas e cache oficial; o módulo continua sem integração à app. Não houve execução de cenários empacotados, QA nativa Windows/macOS, verificação do encoder ou medição em 8 GB. O WIP de recorte e seus bloqueios separados não foram usados. Nenhum código LightCraft ou dependência externa foi copiado.
