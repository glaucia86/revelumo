# #55 — admissão parcial do envelope comprimido

## Decisão e alcance

Esta fatia mantém #55 aberta. O mecanismo limita o trabalho comprimido retido entre a preparação no main e o consumo/descarte pelo renderer/Worker. Não define orçamento de RAM, RSS ou heap, não mede GC e não protege contra um renderer comprometido. O orçamento de produção completo e os estágios de base reduzida/resultados temporários continuam pendentes.

Base funcional: `5ca817fee87e15c35d172bd61bb56be3f9c2b1de`; integrar a evidência #56 em `c0dbb6a1918d116ed5a0b8bc6d19a64497f8f63e` não altera essa árvore de produto. Ver também [estudo #56](../issue-56/report.md).

## Unidades e cálculo por estágio

Para um arquivo cujo `fstat` no descritor aberto informa N bytes:

1. Antes de ler: reservar N+1 para `Buffer.alloc`, cujo byte sentinela detecta crescimento concorrente, e N para a cópia exclusiva produzida por `jpegPreview`.
2. Durante leitura, SHA-256, validação e cópia: reter o envelope completo `2N+1`. Não reduzir créditos quando uma referência apenas sai de escopo.
3. Após a resposta IPC: continuar retendo o mesmo envelope conservador até o consumidor declarar que descartou sua entrada comprimida, ou até o encerramento confirmado do documento. Não há reserva adicional no simples transfer do renderer para o Worker.
4. Após consumo/descarte reconhecido: retirar essa reserva lógica exatamente uma vez. Isso não comprova a liberação física dos buffers pelo runtime.

O teto estrutural padrão é `(MAX_PREVIEW_BYTES+1)+MAX_PREVIEW_BYTES`, atualmente 67.108.865 unidades-byte. Ele deriva das duas alocações explícitas necessárias para **um** JPEG individual máximo já aceito, não de RAM disponível. Não introduz um novo tamanho máximo de arquivo nem justifica funcionamento em máquina de 8 GB. Até dois envelopes podem coexistir se a soma couber: um entregue e um sucessor em preparação. Esse limite de cardinalidade evita acumular leases de JPEGs minúsculos.

Cópias IPC/contextBridge, Blob, decodificador/nativeImage, surfaces full-frame, canvas, GPU, base reduzida, pixels temporários, exportação, importação e caches globais não estão incluídos. Nem mesmo a soma física de todas as cópias comprimidas está coberta. O custo nativo permanece O(W×H); nenhuma interpretação streaming é válida.

`REVELUMO_PREVIEW_CAPACITY_BYTES` permite reduzir o teto na inicialização para verificação determinística; inteiros fora de 1..teto estrutural são rejeitados. Os testes usam apenas fixtures pequenas. Não há ajuste de capacidade exposto ao renderer nem persistência de credenciais/permissões.

## Ownership e recuperação

- Main emite identificador aleatório efêmero por lease e associa documento e geração. Não aceita campos livres ou receipts de outra origem/frame/owner. ACK velho/duplicado não pode retirar reserva nova.
- O renderer coopera: se o payload nunca foi entregue, descartá-lo permite ACK. `take()` transfere a obrigação ao consumidor; o `release()` do parent não devolve crédito de um Worker ainda vivo.
- Worker apaga a referência `data.bytes`, consome a entrada em um frame separado e só anuncia ready após esse frame encerrar. Isso é consumo lógico das referências JS sob controle do app, não medição de Blob/nativo/GC.
- No erro/saída, o renderer chama `terminate()` antes da declaração de descarte. Main autentica a declaração, mas não observa de forma independente a morte de um Worker criado no renderer.
- Navegação iniciada e invalidação só aposentam a intenção. Navegação comprometida, `render-process-gone` e destruição confirmam encerramento de documento; operações main ainda iniciadas permanecem debitadas até efetivamente terminarem.
- Nenhum timeout devolve crédito. Uma operação iniciada mantém a autenticação e o erro real; sucesso de documento encerrado retorna canceled sem transportar payload.
- Preload mantém disposições ainda não confirmadas e repete a mesma identificação antes da próxima solicitação. Perda da resposta de ACK é recuperável por idempotência; não exige reiniciar sessão de edição nem descartar ajustes.

## Fila, erro e gravação

Preserva o scheduler existente: um ativo e um pendente substituível, prioridade à seleção mais recente e sem ultrapassar gravações já aceitas na fila serial. Não cria espera por capacidade dentro de `Library.serial`: falta de bytes ou de slot resulta imediatamente em `preview-capacity`, com mensagem PT-BR/EN/ES e o retry existente.

`originalStatus` e as releituras para saves/history ficam expressamente fora desse envelope. Elas verificam identidade de estado/commit; continuam serializadas e limitadas ao tamanho individual existente. Um gate somente em preview não equivale a limitar toda a abertura do editor. Não retiramos autenticações nem mudamos arbitragem identidade→commit; esses caminhos não aguardam o ACK da prévia para salvar ou encerrar edição.

O diagnóstico `retainedCompressedBytes` é somente leitura no objeto main e serve à investigação do trabalho retido/backpressure. Não fornece mutação nem um novo canal IPC; seus números são unidades do envelope, nunca memória física.

## Pendências da issue

- Orçamento completo de produção fundamentado por medições em ambiente com cota efetiva conhecida.
- Admissão de base reduzida, resultados temporários e hipóteses específicas de transporte/nativo.
- Corpus e evidências próximas aos limites de #44, ainda suspensos neste ambiente.
- Não fechar #44 nem #55 pelo sucesso desta fatia.
