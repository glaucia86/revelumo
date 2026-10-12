# CI de verificação — issue #7

O workflow `.github/workflows/ci.yml` responde a `pull_request`, `push` em `main` e `workflow_dispatch`. Executa em `windows-latest` e `ubuntu-latest` standard GitHub-hosted, com Node 24 e timeout de 25 minutos por job. A concorrência é por PR/ref; uma execução nova cancela a anterior. Uma falha em um sistema não cancela o outro, para preservar o diagnóstico.

## Reprodução

Na raiz de um checkout limpo, com Node 24:

```sh
npm run check:docs
npm ci
npm run install:electron
npm run typecheck
npm test
npm run package
```

Depois, em PowerShell no Windows, use quatro pastas novas de teste (em CI, `$env:RUNNER_TEMP`; localmente, uma pasta temporária autorizada):

```powershell
$root = Join-Path $env:TEMP ('revelumo-smokes-' + [guid]::NewGuid())
$electron = Join-Path $root 'electron'
$relocation = Join-Path $root 'relocation'
$exposure = Join-Path $root 'exposure'
$filters = Join-Path $root 'filters'
New-Item -ItemType Directory -Path $electron, $relocation, $exposure, $filters | Out-Null
npm run test:filters -- "$filters" first
if ($LASTEXITCODE -ne 0) { throw 'filters first failed' }
npm run test:filters -- "$filters" reopen
if ($LASTEXITCODE -ne 0) { throw 'filters reopen failed' }
npm run test:electron -- "$electron" first
if ($LASTEXITCODE -ne 0) { throw 'electron first failed' }
npm run test:electron -- "$electron" reopen
if ($LASTEXITCODE -ne 0) { throw 'electron reopen failed' }
npm run test:relocation -- "$relocation" first
if ($LASTEXITCODE -ne 0) { throw 'relocation first failed' }
npm run test:relocation -- "$relocation" reopen
if ($LASTEXITCODE -ne 0) { throw 'relocation reopen failed' }
npm run test:exposure -- "$exposure" first
if ($LASTEXITCODE -ne 0) { throw 'exposure first failed' }
# Sequência intencional: race salva 1.7 EV; race-reopen verifica esse valor.
foreach ($mode in @('reopen', 'interrupt', 'reopen', 'discard-race', 'reopen', 'race', 'race-reopen')) {
  npm run test:exposure -- "$exposure" $mode
  if ($LASTEXITCODE -ne 0) { throw "exposure $mode failed" }
}
```

Cada comando inicia outro processo Electron. `first` exige um catálogo novo; `reopen` reutiliza somente a pasta do seu cenário. Os scripts carregam `out/Revelumo-<platform>-<arch>/resources/app.asar`, validam o renderer/IPC real e preservam sandbox, contextIsolation e webSecurity. A reexecução exige um novo `$root`. Não use catálogos ou fotografias pessoais.

## Resultados, segurança e custo

- Instalação, typecheck, testes, pacote e smokes propagam código de falha ao job. Logs dos testes incluem contagens reais e motivos de skips. O summary executa mesmo depois de falhas e lista outcomes, versões e resultados/falhas dos smokes disponíveis. Cancelamento ou timeout pode impedir sua conclusão; os logs continuam sendo a fonte de diagnóstico.
- A suíte recebe `TEMP`/`TMP` em `runner.temp`. No Windows, isso evita a divergência entre o alias 8.3 do diretório temporário padrão (`RUNNER~1`) e o caminho canônico (`runneradmin`) retornado por `realpath`, sem modificar as asserções ou código do produto.
- PRs verificam o merge ref do GitHub; o SHA registrado no summary é o código efetivamente verificado, não necessariamente o head da branch. Registrar o head final, o merge SHA testado e o link do run associado ao PR. `workflow_dispatch` só fica disponível quando o workflow existe na branch padrão; depois disso, pode verificar uma branch selecionada no seu head. Após eventual merge autorizado, conferir o run de `push` no SHA integrado.
- Somente `contents: read`; checkout sem credenciais persistidas. Actions oficiais pinadas: checkout v5.0.0 `08c6903cd8c0fde910a37f88322edcfb5dd907a8`, setup-node v5.0.0 `a0853c24544627f65ddf259abe73b1d18a591444`, conferidas com `git ls-remote` nos respectivos repositórios. Atualizações exigem nova verificação de origem/SHA.
- Sem `pull_request_target`, secrets novos, cache do Actions (incluindo cache automático do setup-node), uploads, serviços pagos ou runners especiais. Downloads e caches locais efêmeros usados por npm/Electron não são persistidos. O pacote é descartado com o runner. O objetivo de custo zero depende de manter o repositório público e usar runners standard; nenhuma configuração de billing, proteção de branch ou segurança é alterada.
- `package.json` mantém `private: true` para impedir publicação npm acidental; isso não representa a visibilidade do repositório. Versão permanece `0.0.1`, sem tags ou releases.

## Limites e dependência

Os runners de smoke vieram do PR #6, head `0f2c1b560d828f534b171ae7dea288b2a44a4ca5`, integrado em `main` pelo merge `b350629da67bde5cc7a625e9d34d7ed42ea96716`, em 12/10/2026 às 03:41:38 UTC. A branch da issue #7 foi avançada para essa `main`, preservando seu diff local. Não depende mais de PR empilhado, não altera a branch da #6 e não realizou seu merge.

Ubuntu verifica núcleo/typecheck/pacote; os smokes Electron desta fatia são Windows. Não há validação macOS: seu layout `.app` exige adaptação. `makers: []` não produz instaladores; não executar `make` como prova de distribuição. Smokes substituem o diálogo nativo e usam fixtures sintéticas, sem validar inspeção visual, teclado físico, leitor de tela ou abertura por duplo clique. Runners e Node 24 recebem atualizações; o lockfile fixa as dependências, mas não a imagem inteira do sistema.

Consulte [evidências e pendências](../evidence/ci/report.md). Relatórios históricos não são resultados de CI.

## Exposição JPEG — issue #12

O CI Windows executa agora `npm run test:exposure` first e a sequência reopen/interrupt/reopen/discard-race/reopen/race/race-reopen no pacote real, em processos separados e janelas ocultas. Inclui pixels lineares, sRGB/P3, EXIF1–8, IPC, autosave, flush, falhas e corridas; timeouts por etapa de 3 e 5 minutos dentro do job de 25 minutos. Cada erro interrompe a sequência e o summary always registra resultados/falhas.

As [fixtures sintéticas e sua proveniência](../test/fixtures/exposure-provenance.md) estão no checkout; Python/Pillow/LittleCMS não são dependências de CI ou produto. Mantêm-se runners padrão, permissions contents:read, sem cache persistente, artifacts ou benchmark 36MP automático. [Recursos medidos manualmente](../evidence/issue-12/report.md). Ubuntu verifica core/types/pacote; o harness Electron de exposição é Windows. Não retirar asserts de cor/pixels por diferenças de runner: registrar/diagnosticar eventual falha.

## Histórico de exposição — issue #16

O gate Windows `npm run test:history -- <diretório novo> <modo>` usa doze processos nesta ordem: `first`, `reopen`, `gestures`, `history-failure`, `history-reopen`, `interrupt`, `interrupt-reopen`, `save-failure`, `many-pending`, `key-chord`, `retention`, `retention-reopen`. O mesmo diretório isolado é reutilizado somente nesta sequência. A primeira execução prepara um catálogo v5 sintético e exige diretório novo.

Cobre controles nomeados, teclado e ponteiro reais do Chromium, pixels, agrupamento atravessando autosave, dois gestos rápidos, teclas mantidas, Reset, cursor após reinício, fechamento durante Undo, checkpoint após interrupção, respostas perdidas e recuperação de mais de um lote IPC, limite de 100 passos, estado-base retido e Redo após novo processo. Nenhuma dependência, permissão, serviço, cache persistente, release ou artifact upload novo. Timeout do gate: cinco minutos, dentro do job existente de 25 minutos; cada erro interrompe a sequência e os resultados/falhas são incluídos no summary.

O protocolo limita cada lote a 1024 gestos pequenos; isto é um limite de transporte, separado da política de retenção do histórico. Gestos acumulados durante falha são drenados em lotes válidos sem descartar silenciosamente o rascunho mais recente. O teste de falha prolongada não é benchmark de memória/hardware.

## Balanço de branco — issue #17

`npm run test:wb -- <diretório novo> <modo>` executa `first`, `reopen`, `controls`, `preview-race`, `save-race`, `history-ack`, `keyboard`, `many-pending`, `close-race`, `close-reopen`, `color`, `layout` em doze processos Electron Windows. O primeiro prepara um catálogo sintético v6, verificando a migração real. Cobre pixels conhecidos, receita inteira, reset, teclado via CDP/AX, interleaving EV/WB, ACK perdido/incorreto, preview obsoleto, lote maior que 1024, Undo/Redo preservando WB e flush/reabertura. Mesmos gates/custos/permissões; cinco minutos dentro do job existente. Focus emulado via CDP torna a janela oculta determinística e não representa teclado físico ou QA perceptual.

Os modos adicionais verificam ACK de Undo/Redo preservando T/M, WB+EV com sRGB/P3 e oito EXIF contra oráculos independentes e acesso aos controles na janela mínima 760×540.

## Contribuições e verificação documental

`npm run check:docs` roda no workflow existente, após configurar Node e antes de instalar dependências. Verifica destinos e âncoras locais e navegação entre os READMEs em inglês, português e espanhol; não acessa a rede nem executa o conteúdo dos documentos. Seus testes de comportamento entram em `npm test`. Falhas aparecem no job e no resumo com a etapa `docs`.

Formulários em `.github/ISSUE_TEMPLATE/` e o template de PR apenas estruturam relatos. Não há workflow de execução de issues, interpolação do conteúdo de relatos em shell, secrets ou novas permissões. Mantêm-se `pull_request`, `push` em `main`, `workflow_dispatch`, `contents: read` e checkout sem persistir credenciais. CI não equivale a aprovação de merge, validação visual ou auditoria de licenças de um futuro instalador.

## Idioma persistente e catálogo (#30)

`npm run test:language -- <perfil-temporário> first` valida catálogo PT-BR/EN/ES, lote misto, paginação/filtros, erro já visível, perda de confirmação, falha real de gravação e rascunho/save de exposição durante troca. `reopen` reutiliza esse perfil em outro processo. Use outro perfil para `system-first` seguido de `system-reopen`; a preferência continua `system` e acompanha o SO simulado após reinício. Cada modo `fallback`, `os-error`, `boot-error`, `corrupt`, `future` e `oversized` recebe seu próprio perfil novo.

A fronteira de idioma do SO é substituída intencionalmente; os smokes antigos fixam português para suas asserções existentes. O novo harness percorre os três idiomas e erros de detecção. IPC, renderer, SQLite, arquivos de preferência e sandbox são reais. Em CI esses cenários rodam no Windows; Ubuntu executa núcleo/typecheck/package. Testes de permissão POSIX e FIFO são pulados explicitamente no Windows. Veja [evidência local Linux](../evidence/language-catalog/report.md).

## Idioma do editor existente (#32, fatia parcial)

`npm run test:editor-language -- <perfil novo>` executa o editor empacotado em PT-BR/EN/ES. Verifica drafts de teclado `-`/`1.`, save e Undo em voo, Redo/novo ramo, WB preservado, preview antigo, classificação, erro visível/retry, ausência/relocalização, permanecer/descartar e fechamento nativo durante save. Captura layouts com fixture sintética. CI Windows adiciona este gate de três minutos dentro do job existente; Ubuntu mantém core/typecheck/package. Não adiciona dependência, permission, upload, cache ou release. [Evidência Linux e limites](../evidence/editor-language/report.md).

## Engine JPEG preparatória (#19)

`npm run test:jpeg-engine -- <diretório novo> full` carrega a engine e assets do `app.asar` empacotado. Exercita Canvas/IPC/sandbox reais, PID separado do sentinel, single-flight, falhas/cancelamento, resposta inválida/tardia, restrições de sessão e término observado. Fronteiras Electron são substituídas somente para falhas determinísticas; o relatório diferencia essas sondas de execução nativa.

CI Windows executa esse cenário dentro do job existente (três minutos), sem novas permissões, upload, dependências ou cache. Ubuntu mantém núcleo/typecheck/package. O modo manual `corpus` exige Python/Pillow/LittleCMS já disponíveis e acrescenta oráculos independentes, 40 MP e amostragem de memória; não adiciona tais ferramentas ao produto/CI. [Comandos, evidências e limites](../evidence/issue-19-engine/report.md).

## Circuito de publicação JPEG (#19)

`npm run test:jpeg-export-circuit -- <diretório novo> full` verifica o serviço empacotado: snapshot autenticado, engine real, créditos Unicode selecionados, writer exclusivo, aliases/colisões, falhas de autenticação/crop/cancelamento, encerramento do renderer e presença da licença MIT de xmldom no app.asar. A fixture sintética é versionada; não exige Python no CI Windows. Mantém o job/permissões/custos existentes.

Reabertura independente com Pillow/LittleCMS e medição completa de40 MP ficam no gate manual documentado em [evidências](../evidence/issue-19-circuit/report.md). Testes de symlink de arquivo só pulam no Windows quando EPERM/EACCES impede sua criação; hardlinks continuam obrigatórios. Nenhum instalador, release ou suporte universal a filesystems é inferido.
