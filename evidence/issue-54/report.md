# Prévia original binária — issue #54

Base: `118a486295d7f68ed956450a39db9db795e0220d`. Escopo: transporte e
ownership, sem novo motor, dependência, MessagePort, alteração de scheduler,
miniatura, encoder, limites de produto ou originais.

## Inventário antes/depois

Para um JPEG autenticado de N bytes (máximo 32 MiB):

| Fronteira/representação | Antes | Agora |
| --- | --- | --- |
| Leitura main | Buffer N+1, view N para detectar crescimento | Igual; somente view N autorizada |
| Validação main | Dimensões + nativeImage; criava string mesmo quando descartada por import/legado | Dimensões + nativeImage sem construir transporte |
| Payload main | Data URL + base64, 4×ceil(N/3) caracteres + prefixo | Uma cópia Uint8Array.from(view), ArrayBuffer exato N |
| invoke main→preload | Serialização/clonagem da string | Clonagem do ArrayBuffer; main não é destacado |
| contextBridge preload→renderer | Cópia da string | Cópia do ArrayBuffer; sem transfer list |
| Renderer retido | PreviewSource guarda string até release | PreviewSource guarda buffer até take, entrega uma vez; release idempotente |
| Renderer→Worker | postMessage clona string | Transfer list com o buffer N; byteLength do remetente vira 0 |
| Worker antes de decode | split, atob e string binária N, reconstrução Uint8Array N | View Uint8Array sem cópia de bytes; sem base64/atob |
| Blob, native decode, canvas | Representações nativas e base reduzida sRGB | Inalterados; Blob pode copiar, decode inicial continua full-frame O(W×H) |
| Miniatura/SQLite/grade | Data URL persistida | Inalterados, tipo Thumbnail separado |

Nenhum ganho quantitativo de RSS é inferido. Cópias/coletores nativos podem
coexistir; retirar referências não promete coleta imediata ou adequação a 8 GB.
O payload main não expõe bytes do backing store fora da view. Renderer e Worker
não recebem caminho/Node/IPC genérico. UUID, sessão, geração privada do preload,
token de documento privado do main, ownership/frame/origin e fila continuam
inalterados. Erro de preparo não deixa uma base antiga sob identidade nova.

## Reprodução e limites

- Node 24, `npm ci`, `npm run install:electron`, `npm run typecheck`, `npm run check:docs`, `npm run package`.
- Suite local limitada: `node --test --test-concurrency=1 --test-skip-pattern='bounds original input bytes independently|oversized JPEG is rejected' test/*.test.ts`.
- O filtro omite dois testes de fronteira de 32 MiB. Os testes completos continuam no CI; nenhuma cobertura removida. Cargas novas de 20/40 MP e fronteira de 32 MiB suspensas localmente por quota cloud não verificada. Não é benchmark de memória.
- `test/preview.test.ts`: bytes EXIF exatos, view com offset/sentinelas e backing store maior, independência após mutação do armazenamento de origem.
- `test/preview-source.test.ts`: entrega única, transfer/detach real via structuredClone, release antes/depois e idempotência.
- `test/preview-bytes.test.ts`: inválido/vazio/shared/resizable/detached/excessivo com orçamento artificial de poucos bytes; o limite de produto não é alterado.
- `test/preview-worker.test.ts`: fronteira real do handler com substitutos explícitos de decode/canvas nativos; bytes e rejeição antes do decode. Não prova pixels nativos.
- `npm run test:preview-memory -- <pasta nova> first`, depois `reopen`: produto empacotado, IPC/contextBridge/Worker reais, sandbox/contextIsolation/webSecurity mantidos. Cada envio verifica transfer list e detach imediato; tamanho deve coincidir com original. Fixtures sintéticas pequenas, retry explícito e original alterado, falhas, ACK tardio, troca/saída, sessão/histórico, EV/WB, persistência e hashes. Diálogo nativo substituído; não é QA Windows manual.
- Smokes existentes de exposição/WB mantêm os oráculos de EXIF 1–8, sRGB/P3, EV/WB e sem upscale; smoke/relocation agora verificam bytes binários exatos.

Resultados locais e CI final registrados no PR. CI Windows/Ubuntu e pós-merge
são gates distintos; uma passagem local não é evidência de outro sistema.

## Resultado local de 13/10/2026

Typecheck, documentação e package passaram. A suíte limitada passou 332 testes;
os dois testes excluídos pelo filtro não entram nessa contagem (Node não os
contabiliza como skipped). Treze processos Electron passaram: preview-memory,
preview-queue, smoke, relocation, exposure e white-balance em first/reopen, mais
WB color. O [registro de resultados](local-verification.json) inclui cada saída
e as transferências do lifecycle; todas destacaram o remetente. As fixtures de
exposição verificaram EXIF 1–8/sRGB/P3/sem upscale e WB color passou seus oráculos.
Os únicos avisos nativos foram conexão indisponível ao D-Bus do container.
