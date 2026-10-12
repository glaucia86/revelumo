## What to build

Abrir um JPEG catalogado, ajustar sua exposição com prévia reduzida e salvar automaticamente a receita no catálogo local. Ao fechar normalmente e reabrir o aplicativo, recuperar o último ajuste confirmado, mantendo os bytes do original intactos.

Uma única fatia vertical, da interface ao processamento, IPC, catálogo e testes. A responsável aprovou iniciar a preparação desta primeira edição não destrutiva e escolheu salvamento automático como no Classic. Essa referência define o comportamento de autosave; não implica paridade com Lightroom.

## Design proposto e escopo aprovado

- Exposição de −3,0 a +3,0 EV, passo de 0,1, padrão 0. Representação canônica em décimos inteiros.
- Controle acessível com slider e valor numérico. Redefinir aplica 0 EV e participa do mesmo autosave. Não há botão obrigatório de salvar.
- Receita associada ao UUID estável: exposição e versão do processamento. Migração transacional do catálogo v4 para v5; registros antigos começam neutros. Preservar caminho, identidade SHA-256, miniatura, estrelas e flags. Recusar schemas futuros desconhecidos sem sobrescrever dados.
- Exposição aplicada ao JPEG já renderizado: normalizar para sRGB, linearizar canais RGB, multiplicar por 2^EV, limitar ao intervalo exibível e codificar novamente em sRGB. Não usar CSS brightness como substituto. Não se trata de revelação RAW nem recuperação de informação que o JPEG não contém.
- Prévia até 2048 px no maior lado, mantendo proporção, sem upscale; orientação EXIF aplicada exatamente uma vez. Todo ajuste parte da mesma base neutra reduzida. Comparação com 0 EV utiliza esse mesmo pipeline.
- Usar capacidades existentes do Chromium, Canvas sRGB e worker empacotado, sem nova dependência nativa nem troca de stack. A compatibilidade e o resultado de cor devem ser demonstrados no Electron real; se isso exigir nova decisão de motor/dependência, retornar com evidência antes de ampliar escopo.
- Não substituir a prévia original preservadora de EXIF/ICC silenciosamente: documentar que a prévia de edição é uma derivação sRGB de resolução limitada, com limites de gamut, clipping e quantização. Não prometer fidelidade profissional universal.
- Manter Electron, React, TypeScript e SQLite local no main, renderer isolado, originais somente leitura, sem IA ou serviços pagos.

## Autosave e concorrência

- O controle atualiza o rascunho e solicita prévia imediatamente; persistência usa debounce inicial de 300 ms após a última mudança. Esse intervalo é uma hipótese reversível de interação, não promessa de durabilidade.
- Coalescer mudanças por foto e revisão: no máximo uma gravação em execução e o estado mais recente aguardando. Não enfileirar uma gravação para cada tick.
- Associar pedidos e respostas à foto, sessão de edição e revisão. Uma confirmação antiga nunca marca como salvo um rascunho mais novo, altera outra foto ou restaura pixels obsoletos. A última revisão aceita deve prevalecer; não permitir que gravação antiga sobrescreva a nova.
- Mostrar alteração pendente/salvando enquanto o rascunho atual não foi confirmado. Mostrar Salvo somente quando a transação correspondente à revisão atual tiver sido confirmada pelo main. Não usar conclusão do debounce ou resposta da prévia como prova de persistência.
- Antes de sair da foto, navegar à grade ou fechar normalmente, cancelar o atraso do debounce, enviar o último rascunho e aguardar a confirmação da revisão mais recente. Alterações durante uma gravação exigem novo flush do estado mais recente.
- Enquanto o flush estiver pendente, não desmontar/perder a sessão. Falha deve manter rascunho e último estado persistido, exibir mensagem compreensível e oferecer tentar novamente, permanecer ou descartar explicitamente o não persistido. O fechamento/navegação não pode descartar silenciosamente.
- Foco, refresh e respostas de leitura atrasadas não apagam um rascunho mais novo.
- Encerramento inesperado, encerramento forçado ou crash só permitem recuperar o que já foi efetivamente persistido. Não prometer recuperação de rascunhos ainda pendentes, nem garantias adicionais contra falha de energia/corrupção.
- Revalidar a identidade SHA-256 do original no commit protegido/serializado do main, antes de confirmar a receita. Uma verificação anterior de disponibilidade não é prova de identidade. Não fazer leitura/hash/decode do original a cada evento do slider. Ausência, ilegibilidade, identidade diferente ou erro do catálogo preservam o último estado persistido e deixam o rascunho recuperável na sessão.

## Pipeline limitado e recursos

Manter os tetos atuais de 32 MiB por JPEG e 40 megapixels. Processar somente a foto selecionada, com um trabalho de prévia em execução e somente o estado mais recente aguardando; descartar respostas obsoletas por identidade e revisão.

Preparar e reutilizar a base neutra por sessão. Arrastar exposição não deve reler, decodificar ou transportar novamente o JPEG completo por IPC. Liberar bitmaps, buffers e worker quando a sessão terminar; não reter várias fotos editadas em cache.

O limite de 2048 px controla o trabalho do ajuste, mas não prova um teto de RAM para a decodificação inicial. A implementação atual transfere o JPEG completo e usa nativeImage na validação. Medir pico e retenção no pacote real, incluindo ciclos repetidos, sem declarar adequação a 8 GB nem somar RSS de processos como RAM física exclusiva.

## Acceptance criteria

- [ ] Abrir foto disponível mostra exposição salva ou 0 EV para foto sem receita; slider/entrada têm nome acessível, valor e operação por teclado.
- [ ] Aceitar somente valores de −3,0 a +3,0 EV em passos de 0,1; entradas inválidas não alteram o último estado válido.
- [ ] A exposição usa ganho 2^EV em RGB linear, com resultado numérico verificável e clipping explícito. 0 EV preserva os pixels da base neutra; alternar valores não acumula degradação.
- [ ] Prévia respeita proporção, EXIF e limite de resolução. Fixtures sintéticas com perfil de cor conhecido verificam normalização no decoder/canvas reais; registrar tolerâncias e limites.
- [ ] Mudanças rápidas são coalescidas; após o período de inatividade, o último valor é persistido. Redefinir para 0 EV também é salvo automaticamente.
- [ ] Salvo aparece somente após confirmação da revisão atual. Confirmação atrasada de revisão anterior não apaga pendência/falha nem marca o valor mais novo como salvo.
- [ ] Não existem filas crescentes de prévias ou gravações; resultados fora de ordem nunca mostram outra foto, revertem a exposição ou sobrescrevem uma revisão mais recente.
- [ ] Navegação, troca de foto e fechamento normal forçam flush e aguardam a última revisão. A reabertura em segundo processo recupera esse valor.
- [ ] Falha durante autosave/flush mantém o rascunho e o último valor salvo. Tentar novamente funciona; sair sem persistir exige descarte explícito. Foco/refresh não perdem alterações.
- [ ] Teste de interrupção antes da persistência demonstra apenas recuperação do último valor persistido; nenhuma alegação de recuperação do rascunho é feita.
- [ ] Salvar revalida a identidade no main; original ausente, ilegível ou alterado produz falha compreensível e não altera a receita persistida nem qualquer original.
- [ ] Reimportação e relocalização do mesmo original preservam receita e UUID. Estado salvo permanece consultável quando o original está indisponível, sem inventar uma prévia nova.
- [ ] Migração de catálogos anteriores preserva fotos, miniaturas, identidade e classificação; novos registros são neutros; schema futuro é recusado sem sobrescrita.
- [ ] IPC valida origem, UUID e payload estrito: rejeita caminhos livres, campos extras, versões não suportadas e valores inválidos; UUID desconhecido não cria registros.
- [ ] Movimentos do controle não provocam leitura/hash/decode do original por tick. Recursos da sessão anterior são liberados e a grade mantém a verificação leve existente.
- [ ] SHA-256 dos originais sintéticos permanece igual após edição, autosave, redefinição, erros, relocalização e reinício.
- [ ] Testes, typecheck, pacote e integração Electron passam no SHA final; memória e responsividade têm medição delimitada, com comandos, plataforma, skips e limites reais registrados.
- [ ] Regressões de importação, grade, classificação, disponibilidade e relocalização continuam passando. Não declarar encerrada a QA nativa/visual Windows de outra issue.

## Testing decisions

Preferir comportamento externo nas interfaces públicas já usadas pelo projeto; não testar métodos privados ou consultar tabelas como atalho para verificar resultados.

1. Library com filesystem/SQLite reais: ler/salvar receita, falha de SQLite bloqueado, validação, identidade, migração, reimportação, relocalização e reinício. Preparar catálogos antigos como fixtures; verificar efeitos pela API pública.
2. API limitada preload/IPC no pacote Electron: payloads públicos, origem/isolamento, persistência e erros. Não substituir catálogo real por mock.
3. UI/Chromium e pixels de canvas reais: controle, cor/orientação, autosave e estados. Fixtures numéricas independentes da implementação distinguem exposição linear de multiplicação sRGB; por exemplo, canal sRGB 128 fica aproximadamente 176 em +1 EV e 92 em −1 EV, conforme tolerância definida.
4. Concorrência controlada nas fronteiras assíncronas: rajada de mudanças, resposta antiga após nova revisão, alteração durante gravação, tentativa de navegar/fechar durante debounce e durante commit, troca de foto, falha seguida de retry e descarte explícito. Asserções observam UI e estado reaberto; não dependem de detalhes privados do scheduler.
5. Dois processos reais para first/reopen, incluindo fechamento normal após última alteração; teste separado para interrupção inesperada com último valor confirmado conhecido. Hashes dos originais antes/depois.
6. Medição de recursos em JPEGs sintéticos grandes dentro dos limites, arraste e ciclos abrir/fechar; registrar pico, retenção e responsividade sem extrapolar para hardware não testado.

Seguir TDD vertical: um comportamento vermelho, implementação mínima, verde; revisão independente Standards/Spec e reverificação antes do commit final. Esta issue é preparação e não comprova execução desses testes.

## Blocked by

None — can start immediately após completar a revisão de design/plano exigida pelo fluxo de implementação.

As fundações já estão integradas. [Importar um JPEG e reencontrá-lo ao reabrir](https://github.com/glaucia86/revelumo/issues/2), lote/grade e classificação são contexto concluído, não novos bloqueadores. A pendência de QA nativa/visual Windows de [Relocalizar uma foto movida sem perder seu registro](https://github.com/glaucia86/revelumo/issues/4) não bloqueia esta fatia e permanece aberta separadamente.

Não há issue pai nem dependência aberta a configurar.

## Out of scope

RAW, escolha de motor definitivo, exportação, atualização das miniaturas com ajustes, presets, histórico/undo geral, edição em lote, balanço de branco, recorte, outros ajustes, GPU/WebGL obrigatório, IA, nuvem, assinatura, serviços pagos, release, tag ou instalador.

## Baseline e referências

Base inspecionada: main em 5aa6693d05bbfea1c538a9360c84ee69ce195a68. Revalidar main e o ticket antes de implementar.

- [Contrato de catálogo e isolamento IPC](https://github.com/glaucia86/revelumo/blob/5aa6693d05bbfea1c538a9360c84ee69ce195a68/docs-agents/adr/0001-local-catalog-ipc.md)
- [Lote, fila e prévias](https://github.com/glaucia86/revelumo/blob/5aa6693d05bbfea1c538a9360c84ee69ce195a68/docs-agents/adr/0002-batch-jpeg-thumbnails.md)
- [Identidade e relocalização](https://github.com/glaucia86/revelumo/blob/5aa6693d05bbfea1c538a9360c84ee69ce195a68/docs-agents/adr/0003-original-identity-relocation.md)
- [Filter Effects: funções CSS operam em sRGB](https://www.w3.org/TR/filter-effects-1/#FilterProperty)
- [Canvas: espaços e conversão de cor](https://html.spec.whatwg.org/multipage/canvas.html#colour-spaces-and-colour-space-conversion)
- [ImageBitmap: conversão e orientação](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html)
- [Conversões sRGB](https://www.w3.org/TR/css-color-4/#color-conversion-code)
