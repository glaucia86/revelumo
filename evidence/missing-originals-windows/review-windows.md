# Review e smoke automatizado Windows

12/10/2026. Base `9fcef67b61df6ae77678b0eff7185ead1e7cec2f`, branch local `feat/locate-missing-originals`. Relocalização permanece pendente da coordenação do critério de identidade com a usuária. Nenhum push, merge, deploy, mudança de visibilidade, credencial, configuração de segurança ou fotografia pessoal foi usado nesta execução.

## Correções

- A grade mantém `role="list"`, com `role="listitem"` num contêiner ao redor de cada botão. O botão conserva sua semântica nativa e `aria-label="Abrir <nome>"`. CSS só preserva o preenchimento da célula; nenhum redesenho ou mudança na capa.
- README documenta `importProgress`/`thumbnailPhoto` e as operações IPC `progress`/`thumbnail`; reconhece o cache SQLite já implementado.
- Fixtures de catálogo/lote fecham conexões SQLite antes de remover o banco. Isso corrige sete falhas de teardown no Windows que o Linux tolerava. O teste de alias ignora apenas `EPERM` de symlink em Windows; outros erros continuam falhando.

## TDD de acessibilidade no aplicativo empacotado

Runner: [test/electron-smoke.cjs](../../test/electron-smoke.cjs). Carrega o main, preload e renderer de `resources/app.asar`, com origem `app://revelumo/index.html`, catálogo e dados de sessão isolados no workspace. O diálogo nativo é substituído na fronteira do adaptador para selecionar somente fixtures sintéticas.

**RED:** antes da correção, o Chromium expôs `Abrir synthetic-00.jpg` como `listitem`; a asserção que exige `button` falhou. [Falha original](accessibility-red.txt).

**GREEN:** depois da correção e novo pacote, os 48 tiles da primeira página foram expostos como botões com seus nomes acessíveis. Cada botão é focável e está dentro de um item de lista. O Enter enviado ao Chromium ativa o botão focado e abre a prévia real. [Papéis antes/depois extraídos da árvore AX real](accessibility-before-after.json).

O primeiro smoke passou com 10 grupos de verificações: sandbox/isolamento, origem e ponte limitada, lote misto, papéis e nomes acessíveis, focabilidade/estrutura, ativação por Enter, prévia decodificada, paginação, cancelamento/reimportação e integridade dos originais. Os dados incluem 50 JPEGs sintéticos pequenos, uma fixture JPEG EXIF6 e um arquivo de conteúdo inválido: 51 fotos válidas, uma falha individual e 52 arquivos inalterados. A paginação mostra 48 e depois três fotos, com miniaturas reais do nativeImage; todas as miniaturas exibidas devem ter `complete` e `naturalWidth > 0` no Chromium.

Um segundo processo Electron abriu os mesmos 51 UUIDs, a miniatura cacheada e a prévia. O runner deslocou temporariamente apenas uma fixture sintética e comprovou que a miniatura cacheada continuou disponível, a prévia retornou `unreadable` e a lista não mudou. O arquivo foi restaurado em `finally`; todos os 52 hashes e caminhos finais permaneceram iguais. O decodificador nativo aceitou a fixture EXIF6, e a data URL da prévia preservou exatamente seus bytes JPEG. Isso não comprova orientação visual ou fidelidade de cor. [Primeira execução](electron-first-result.json) e [reabertura](electron-reopen-result.json).

## Comandos e resultados

- `npm ci --cache <workspace>/npm-cache --no-audit --no-fund`: exit 0, 148 pacotes, lockfile inalterado. Auditoria de vulnerabilidades não foi executada.
- `npm run install:electron`, com cache autorizado no workspace: exit 0, binário oficial Electron 44.7.0 instalado.
- `npm run package`: exit 0, pasta `out/Revelumo-win32-x64`, arquivo `resources/app.asar` e executável `Revelumo.exe`. Não é instalador nem release. [Log do pacote final](build.txt).
- `npm test`: exit 0, 42 testes, **39 aprovados, zero falhas, três skips**. [Log](node-tests.txt).
- `npm run typecheck`: exit 0. [Log](typecheck.txt).
- `node --check test/electron-smoke.cjs` e `git diff --check`: exit 0.
- `npm run test:electron -- <diretório-isolado-novo> first`: exit 0 no pacote final, catálogo e fixtures novos. [Log](electron-first.txt).
- `npm run test:electron -- <mesmo-diretório> reopen`: exit 0 em novo processo com o catálogo do pacote final. [Log](electron-reopen.txt).

O runner requer a pasta de pacote da plataforma/arquitetura atual e um diretório de teste novo para `first`. `reopen` requer a mesma pasta da primeira execução. Não usa o catálogo normal da usuária. Deve ser executado depois de `npm run package` e não faz parte de `npm test`, pois requer o runtime Electron real.

## Três skips exatos

1. `canonical path deduplication includes symlink aliases and preserves identifier`: Windows retornou `EPERM` ao criar symlink; exige permissão específica do SO, que não foi alterada. Deduplicação do mesmo caminho passou nos testes e no Electron; o caso de alias por symlink não foi validado neste ambiente.
2. `import rejects a named pipe without waiting for a writer`: teste POSIX usa `mkfifo` e já ignorava Windows. Não é validação de named pipes Windows.
3. `preview rejects a named pipe without waiting for a writer`: mesma limitação POSIX/Windows.

## Dependências disponíveis

[Lista completa instalada](dependencies.txt). Forge CLI/plugin/shared-types 8.0.1; Electron 44.7.0; React/ReactDOM 19.3.0; TypeScript 5.9.3; Vite 8.3.4; @types/node 24.19.2; @types/react e @types/react-dom 19.3.0. Node do terminal 24.19.0. Electron executou Node 24.21.0, Chromium 152.0.7977.130 e SQLite 3.53.4. O runner utiliza somente dependências oficiais já presentes no projeto e módulos nativos; nenhum pacote adicional foi instalado.

## Limites e falhas de ambiente

- O build sem acesso de rede falhou em `fetch failed`; a repetição com autorização do runtime para consultar artefatos oficiais passou.
- Electron dentro do AppContainer do terminal encerrou antes de executar o runner (`0x80000003`). A execução fora desse contêiner foi autorizada pelo runtime; o sandbox da janela da aplicação, isolamento de contexto, `webSecurity` e Node desabilitado no renderer permaneceram habilitados e foram assertados em cada processo. Nenhuma flag de desativação de segurança foi usada.
- A tentativa de screenshot pela janela oculta falhou com `UnknownVizError`. O passo opcional foi retirado; não há captura nem inspeção visual Windows nesta evidência. O teste consulta DOM e árvore de acessibilidade do Chromium real.
- Depois da solicitação para testar o executável e diálogo nativo, as capacidades foram inspecionadas novamente. A skill Computer Use instalada exige `node_repl` com `@oai/sky`, mas nenhuma ferramenta `node_repl` está exposta. As instruções da ferramenta `cua_repl` informam que APIs nativas estão desabilitadas. Duas chamadas válidas de inicialização `await cua.getState()` encerraram o runtime com `trusted Node process exited unexpectedly; kernel reset, rerun your request`. Portanto, tela/mouse/teclado nativos não estão utilizáveis nesta sessão; o teste visual e seletor nativo não foram realizados, nem substituídos por mocks como nova comprovação. As evidências de smoke anteriores mantêm explicitamente seu diálogo substituído no adaptador.
- A primeira tentativa de teclado por `sendInputEvent` não ativou a janela oculta porque dependia do foco do desktop. O runner passou a enviar os eventos ao Chromium, sem capturar foco do SO. Isso é teclado simulado, não teste de teclado físico ou leitor de tela Windows.
- O executável `Revelumo.exe` foi produzido; o smoke inicia o Electron oficial e carrega diretamente o código de `app.asar`. Não foi exercitado duplo clique no executável nem um instalador. O diálogo nativo, GPU/renderização visível, orientação visual, cor, desempenho em 8 GB, encerramento durante lote e matriz de câmeras permanecem fora desta verificação Windows.
- Linux não foi executado aqui. As 42 aprovações e E2E Linux anteriores pertencem ao PR integrado; macOS continua pendente.

## Continuidade

A revisão independente não encontrou falhas concretas no diff. Identificou duas lacunas de comprovação no runner, fechadas antes do resultado final: verificar a decodificação das miniaturas e exigir cache disponível quando o original sintético está temporariamente ausente. Syntax check, typecheck e diff check também passaram na revisão independente. O revisor não editou arquivos nem iniciou Electron concorrente.

A proposta de identidade e casos TDD estão no [checkpoint inicial](checkpoint.md). Falta autorização coordenada para SHA-256 e o tratamento de registros antigos sem hash antes de implementar a terceira fatia.
