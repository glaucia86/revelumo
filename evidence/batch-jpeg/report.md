# Segunda fatia JPEG: lote, miniaturas e grade

11/10/2026, aproximadamente 22:50–23:05 UTC. Pacote Electron 44.7.0 / Forge 8.0.1, Linux x64, no desktop cloud. Comando gráfico: `./out/Revelumo-linux-x64/Revelumo`. Sem flags de desativação de sandbox. Fixtures sintéticas, sem fotos particulares. Nenhum push/release é parte deste relatório.

## Verificações automatizadas

- `npm test`: 42/42 passaram, nenhum skip. Logs RED/GREEN preservados para migração/cache, lote misto, symlink/caminho canônico, serialização de requests concorrentes, interrupção, geração de cache ausente, orientação EXIF 1–8, IPC e paginação.
- `npm run typecheck`: exit 0.
- `npm run package`: exit 0, pacote Linux produzido. Logs `typecheck.log` e `build.log`.
- Mantidos todos os testes da primeira fatia, inclusive filesystem/SQLite real, reinício em processo Node separado, FIFO e preservação do original.
- Revisão independente encontrou dois P2: importação aguardando fila podia continuar após fechar; leitura EXIF não aceitava FF de preenchimento JPEG. Três regressões falharam antes da correção, depois a suíte completa passou (logs 14/15). Não houve outro bloqueio concreto na revisão.

## Fluxo Electron real

1. Catálogo da primeira fatia abriu com suas duas referências. Migração v1→v2 manteve IDs/nomes e gerou miniaturas EXIF6/8 sob demanda: [11](11-migrated-grid.png).
2. Seletor nativo selecionou três arquivos da pasta `mixed`: duas matrizes coloridas JPEG EXIF6/8 e um arquivo com extensão JPEG/conteúdo inválido. Resultado: duas novas referências, erro individual `02-invalid.jpg`, quatro fotos totais: [12](12-mixed-result.png). Os válidos não foram descartados por causa do inválido.
3. Clicar na miniatura `01-orientation-6.jpg` abriu o JPEG correspondente na mesma orientação: [13](13-preview-original.png). Retorno à grade funcionou.
4. Abrir e cancelar seleção manteve quatro referências: [16](16-cancel.png).
5. Fechar encerrou o processo e devolveu o prompt do terminal. Nova execução mostrou as quatro fotos com miniaturas: [17](17-reopened-grid.png). Reimportar o mesmo lote manteve quatro referências, sem duplicação: [18](18-reimport-deduped.png).
6. Seleção nativa de 300 JPEGs sintéticos de 4000×3000 (12 MP, aproximadamente 203 kB cada) mostrou progresso 1/300 e depois 168/300: [19](19-batch-start.png), [20](20-preview-during-batch.png). Durante o lote, o clique em uma foto anterior mudou a interface para a prévia; ela terminou de carregar. O lote terminou com 300 válidos/0 falhas e 304 fotos: [21](21-batch-completed.png). Esta primeira tentativa de fechar ocorreu depois do fim; não é evidência de interrupção.
7. Nova execução restaurou 304 fotos: [22](22-large-grid-reopened.png). Navegação à segunda página de sete funcionou: [23](23-page-two.png). Clicar em `batch-090.jpg` abriu esse original: [24](24-page-two-preview.png).
8. Novo lote `stop-case`, com 300 caminhos ainda não catalogados: a captura mostra 3/300 antes de fechar: [25](25-interruption-active.png). A janela desapareceu e o terminal voltou ao prompt. Nova execução abriu 312 referências: 304 anteriores mais oito itens confirmados entre a captura e o encerramento: [26](26-reopened-after-interruption.png). A última página contém `stop-000.jpg` até `stop-007.jpg`: [27](27-confirmed-items-after-interruption.png). Os outros 292 itens não foram retomados automaticamente. A prévia de `stop-007.jpg` abriu corretamente: [28](28-interrupted-item-preview.png).
9. Todos os 603 caminhos sintéticos preparados para esses dois lotes e o lote misto mantiveram SHA256 e localização; nenhum hash divergiu: [resultado](integrity-result.json), [manifesto anterior](integrity-before.json). Os 600 JPEGs grandes são hardlinks de uma imagem sintética; isso exercita caminhos distintos, sem alegar diversidade fotográfica.

## Limites

- É um roteiro E2E manual via mouse/teclado, com aplicativo e SQLite reais. Ainda não é suíte E2E automatizada reutilizável. Os testes de núcleo usam uma porta de decodificação substituída; não substituem as observações do Electron.
- A navegação durante lote foi observada funcionando, mas não houve benchmark de latência, pico de memória ou avaliação em máquina de 8 GB sem GPU dedicada. Esse alvo permanece não validado. A fila serial e paginação são limites de implementação, não prova de desempenho.
- NativeImage reduz a miniatura; a orientação é preservada explicitamente. Prévia preserva JPEG/EXIF/ICC original. Fidelidade de cor, ampla matriz real de câmeras, Windows/macOS, modo `npm start`, instaladores e assinatura continuam pendentes.
- Cache ausente regenera. Cache corrompido não tem recuperação automática e alteração externa do original não invalida a miniatura até reimportação. Estes limites estão na ADR 0002.
- O desktop produziu avisos DBus e a automação de texto no seletor estava indisponível; navegação por cliques e Open funcionou.
