# Medição delimitada do pacote corrigido

12/10/2026. Uma execução Windows x64 no Intel Core i7-12700H (20 CPUs lógicas), Windows 10.0.26200, RAM reportada pelo sistema 33.961.971.712 bytes (~31,6 GiB). Electron 44.7.0, Node 24.21.0, Chromium 152.0.7977.130. Não é validação no alvo de 8 GB.

## Tamanho

Pasta empacotada: **385.655.508 bytes (~367,8 MiB)** em 73 arquivos. Executável: 246.302.208 bytes (~234,9 MiB). `resources/app.asar`: 251.523 bytes (~245,6 KiB). São somas dos tamanhos lógicos dos arquivos existentes, não espaço ocupado em clusters nem tamanho de download. Não existe instalador/release nesta medição; não estimar seu tamanho.

Tamanhos conferidos com stat do filesystem do sistema. O primeiro stat no Electron apresentou o arquivo `.asar` como diretório virtual com zero bytes; os campos de pacote do resultado foram corrigidos pela medição física, sem alterar amostras de memória. O runner agora usa `original-fs` para reprodução.

## Memória observada

[`app.getAppMetrics()`](https://www.electronjs.org/docs/latest/api/structures/process-metric), com [MemoryInfo em KB](https://www.electronjs.org/docs/latest/api/structures/memory-info), por processo. Os dados brutos preservam working set, pico e privateBytes separadamente. A tabela soma **privateBytes reportados**, convertidos de KB para MiB; não representa RAM física única. Não foi feita soma de working sets/RSS, que pode duplicar páginas compartilhadas. Memória dedicada da GPU e consumo global da máquina não foram medidos.

| Cenário, na ordem executada | Amostras | Soma privateBytes observada (MiB) |
| --- | ---: | ---: |
| Catálogo vazio | 3 | 170,8 |
| Importação de 48 JPEGs, 12 MP cada | 18 | 218,5–642,2 |
| Grade com 48 miniaturas após o lote | 3 | 595,9 |
| Prévia de uma foto de 12 MP | 3 | 233,7 |
| Voltar à grade, prévia removida do DOM | 3 | 233,2 |
| Cinco segundos após voltar | 3 | 232,9 |

Quatro processos observados: Browser/main, GPU, Utility e Tab/renderer. A memória maior do main ao terminar o lote caiu em uma fase posterior; esta execução não determina causa, vazamento ou pico absoluto. Não houve GC forçado nem otimizações aplicadas a partir desses números.

Método: runner [electron-resources.cjs](../../test/electron-resources.cjs), conteúdo real do app.asar, janela oculta, diálogos substituídos. Três amostras a cada 250 ms em fases estáveis; lote amostrado a cada 100 ms. Preparação das imagens em processo separado. São 48 cópias de uma matriz sintética de 4000×3000, JPEG de 774.676 bytes, não 48 fotografias distintas. Todos os hashes finais coincidiram; sandbox/contextIsolation/webSecurity assertados.

[Dados brutos e método](resources-result.json). Para reproduzir com diretório novo: `electron test/electron-resources.cjs <diretório-isolado> prepare`, seguido de `measure` no mesmo diretório. Nenhuma dependência nova. Uma sessão oculta, fixtures iguais, estado do allocator/cache e carga externa limitam a generalização; não há benchmark de uso prolongado, disco lento ou máquina de 8 GB. Um aviso GPU ocorreu ao encerrar sem falhar o runner.
