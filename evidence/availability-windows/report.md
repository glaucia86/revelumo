# PR #6: disponibilidade leve da grade

12/10/2026, Windows. Base fixa `4d8326bbcf6a24f48f1d7fdddc53f5d0a13a6607`. Correção do [comentário de review](https://github.com/glaucia86/revelumo/pull/6#discussion_r4244364363), dentro da #4. Sem mudanças de capa, RAW, edição, exportação, estrelas, CI ou visibilidade.

## Problema e resultado

A grade chamava `originalStatus` para cada item da página, ao recuperar foco e na atualização manual. Esse método lê todo o JPEG, calcula SHA-256 e pode decodificar/identificar legado. No pior limite admitido, 48 × 32 MiB resulta em 1,5 GiB de leitura serial antes de atender outras operações.

Agora, `originalAvailability` recebe só UUID e usa o probe público de Library. Ele abre o original somente para leitura, verifica arquivo regular e fecha, sem ler conteúdo, decodificar, calcular hash, guardar estado de integridade ou identificar legado. Não espera a fila de operações que mantêm buffers JPEG. `present` significa acessível, com `contentVerified: false`; `identityRecorded` significa apenas hash registrado, não verificação atual. Metadados iguais não comprovam identidade. O botão se chama “Verificar disponibilidade”.

Foto selecionada, prévia e relocalização mantêm verificação completa. Original legado em cache não ganha hash ao navegar; abertura explícita, importação ou geração necessária de miniatura ausente podem estabelecer identidade. Cache ausente ainda precisa ler/decodificar o original para gerar a miniatura; a correção elimina a leitura extra de estado, não o trabalho necessário à geração.

## TDD e regressões

- RED no pacote anterior: página com 48 miniaturas legadas em cache fez **96 chamadas de leitura de JPEG** (duas por arquivo), em vez de zero. [Log RED](electron-red.txt).
- RED da interface pública Library: `availability` inexistente. RED do parser: operação `availability` recusada. Implementação mínima seguida de testes focados e typecheck.
- GREEN real no Electron: página inicial com 48 itens, próxima página, foco e atualização manual: **zero bytes de original, zero chamadas de leitura, zero hashes e zero decodificações no main**. As aberturas de descritor foram 48/1/1/1. [Resultados com contadores](availability-result.json).
- O observador é instalado nas fronteiras Node filesystem/crypto e Electron nativeImage; delega ao runtime real. Não substitui Library, catálogo, IPC ou renderer. Uma prévia explícita comprova a sensibilidade dos contadores: 633 bytes lidos, duas chamadas de leitura, dois hashes e uma decodificação.
- Legado não identificado após navegar continua bloqueado se movido. Depois de uma prévia explícita, um substituto com mesmo nome/tamanho/mtime continua `present`/não verificado no probe, mas é recusado pela prévia e detectado como `changed` pela consulta completa. Os 49 JPEGs e os resumos de catálogo terminam preservados.
- Núcleo Windows: **59 testes, 56 aprovados, zero falhas, três skips** herdados (symlink EPERM e dois FIFOs POSIX). Typecheck e pacote passaram.
- Relocalização repetida em dois processos: movimento, cancelamento, candidato distinto, conflito, legado identificado por prévia explícita, persistência e cinco hashes preservados. Regressão anterior de lote/grade/teclado também passou em dois processos, preservando os 52 JPEGs sintéticos. A ponte restrita ganhou somente `originalAvailability`, além das operações já aprovadas.

## Limites

Revisão independente oficial antes do commit, contra o snapshot indexado desde `4d8326b`: Standards sem violações documentadas e uma sugestão opcional baixa de utilidade compartilhada entre runners (mantidos autocontidos); Spec sem achados concretos. [Relatórios separados por eixo](code-review.md). Nenhum bloqueio identificado.

Electron 44.7.0, Node 24.21.0, Chromium 152.0.7977.130. Integração carrega main/preload/renderer do app.asar com catálogo e fotos sintéticas isolados. Os dois métodos de diálogo são substituídos como nos runners anteriores; sandbox, isolamento e webSecurity permanecem ativos. Janelas ocultas; foco/ações simulados no Chromium. Sem diálogo nativo, inspeção visual Windows, teclado físico ou leitor de tela. Um aviso GPU ocorreu sem falhar os testes; isso não valida desempenho gráfico.

Não executados Linux/macOS desta correção. Contadores demonstram ausência de leitura extra no cenário com cache, não benchmark em disco lento nem validação de máquina de 8 GB. Presença pode mudar após o probe; operações protegidas verificam os bytes efetivamente lidos. Evidências anteriores descrevem o código de seus respectivos commits; este relatório substitui a descrição de hash na grade.
