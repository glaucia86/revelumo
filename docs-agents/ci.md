# CI de verificação — issue #7

O workflow `.github/workflows/ci.yml` responde a `pull_request`, `push` em `main` e `workflow_dispatch`. Executa em `windows-latest` e `ubuntu-latest` standard GitHub-hosted, com Node 24 e timeout de 25 minutos por job. A concorrência é por PR/ref; uma execução nova cancela a anterior. Uma falha em um sistema não cancela o outro, para preservar o diagnóstico.

## Reprodução

Na raiz de um checkout limpo, com Node 24:

```sh
npm ci
npm run install:electron
npm run typecheck
npm test
npm run package
```

Depois, em PowerShell no Windows, use duas pastas novas de teste (em CI, `$env:RUNNER_TEMP`; localmente, uma pasta temporária autorizada):

```powershell
$root = Join-Path $env:TEMP ('revelumo-smokes-' + [guid]::NewGuid())
$electron = Join-Path $root 'electron'
$relocation = Join-Path $root 'relocation'
New-Item -ItemType Directory -Path $electron, $relocation | Out-Null
npm run test:electron -- "$electron" first
if ($LASTEXITCODE -ne 0) { throw 'electron first failed' }
npm run test:electron -- "$electron" reopen
if ($LASTEXITCODE -ne 0) { throw 'electron reopen failed' }
npm run test:relocation -- "$relocation" first
if ($LASTEXITCODE -ne 0) { throw 'relocation first failed' }
npm run test:relocation -- "$relocation" reopen
if ($LASTEXITCODE -ne 0) { throw 'relocation reopen failed' }
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

O CI Windows executa agora `npm run test:exposure` first e a sequência reopen/interruption/reopen/discard-race/reopen/race/race-reopen no pacote real, em processos separados e janelas ocultas. Inclui pixels lineares, sRGB/P3, EXIF1–8, IPC, autosave, flush, falhas e corridas; timeouts por etapa de 3 e 5 minutos dentro do job de 25 minutos. Cada erro interrompe a sequência e o summary always registra resultados/falhas.

As [fixtures sintéticas e sua proveniência](../test/fixtures/exposure-provenance.md) estão no checkout; Python/Pillow/LittleCMS não são dependências de CI ou produto. Mantêm-se runners padrão, permissions contents:read, sem cache persistente, artifacts ou benchmark 36MP automático. [Recursos medidos manualmente](../evidence/issue-12/report.md). Ubuntu verifica core/types/pacote; o harness Electron de exposição é Windows. Não retirar asserts de cor/pixels por diferenças de runner: registrar/diagnosticar eventual falha.
