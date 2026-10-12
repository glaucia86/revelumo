# Correção da digitação de exposição

Contrato: [issue #12](https://github.com/glaucia86/revelumo/issues/12). Execução em 12/10/2026, somente na máquina cloud; nenhum teste novo no computador da responsável. Base final: `d4f224503610b9d7b4cd8e0e4fe2a635bacd0253`.

## Resultado e causa

O campo controlado sempre voltava ao EV canônico com uma casa decimal. Isso eliminava o sinal/separador antes da próxima tecla. A correção separa texto transitório do último EV válido; somente números válidos entram no pipeline/autosave. Blur restaura/formata o último valor válido. Slider/reset substituem ambos. Não altera IPC, scheduler, faixa ou processamento.

[RED](red.txt): no Electron empacotado, Ctrl+A → `-` → `1` manteve `0.1`, em vez de `-1`, antes da mudança. A mesma regressão passou após o fix. Os testes anteriores de atribuição de números completos não reproduziam a edição por caracteres.

## Verificações locais

- Node 24.19.0: `npm run typecheck` e `npm test`: 71 testes, 71 aprovados, 0 falhas, 0 skips.
- `npm ci`, `npm run install:electron` e `npm run package`: aprovados, Electron Forge/Vite padrão. Cache Electron configurado em diretório autorizado; sem dependência nova.
- Linux x64, Electron 44.7.0, Chromium 152.0.7977.130, sandbox/contextIsolation/webSecurity preservados. Janelas do harness ocultas, catálogo/arquivos sintéticos, SQLite e worker reais.
- Sequência de oito processos: `first`, `reopen`, `interrupt`, `reopen`, `discard-race`, `reopen`, `race`, `race-reopen`: todos aprovados. JSONs nesta pasta registram resultados finais; reaberturas repetidas verificaram 2,3 EV após cada cenário. Interrupção recupera somente o valor previamente persistido.
- Novo teclado Chromium: negativos, decimais, pausa após sinal, foco/refresh/autosave com prefixo decimal; entradas fora de faixa/passos e vazias não alteram receita/revisão/prévia; blur, limites ±3, slider/reset. Confirmação atrasada com valor novo digitado e fechamento com flush também cobertos.
- Regressões existentes do harness mantidas: valores de pixels, perfis sRGB/P3, EXIF1–8, isolamento/payload IPC, coalescência, erro SQLite, ausência/identidade, retry/descarte, corridas e SHA-256 do original.

## QA visual cloud independente

Interface Electron visível, controles operados por teclado/mouse: `-1`, `1.2`, `-0.7`; rascunhos `-` e `1.` preservados; apagar deixa campo vazio sem mudar a prévia; Tab restaura -0,7; reset aplica 0; um novo processo reabriu -0,7 como Salvo. Sem novo bloqueador observado. Somente fotografias sintéticas.

SHA-256 do fonte verificado no QA: `6c85bd07aea21ce1725fbe6e9805cfc3d6be09b23a6c566621e04e9328591094` (`ExposureEditor.tsx`). Pacote testado: `5da856eee136bbcae17594cb625fdff03ea4bd1ea24431d2c9250cee446de524` (`app.asar`).

[Revisões independentes Standards e Spec](review.md): ambas aprovadas, zero achados.

## Reprodução e limites

Depois de empacotar, em um diretório novo: `npm run test:exposure -- <diretório> first`, seguido dos modos acima, reutilizando só o diretório desse cenário. No terminal gráfico cloud, foi usado diretamente `node_modules/electron/dist/electron test/electron-exposure.cjs <diretório> <modo>` porque aquele terminal não tem Node no PATH.

O executor shell não disponibilizou os sockets locais necessários ao Electron; o harness rodou no terminal gráfico cloud, sem relaxar sandbox. Logs Linux têm avisos ambientais D-Bus/portais, sem falhas de asserção.

CI Windows/Ubuntu deve ser aprovado no SHA remoto antes de merge. O workflow já executa este mesmo harness no Windows; Ubuntu executa core/types/pacote. Resultados e SHA do CI ficam no PR. QA cloud Linux não encerra a pendência nativa/visual Windows da issue #4, nem comprova macOS, leitor de tela, RAW ou fidelidade universal de cor.
