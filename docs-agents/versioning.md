# Preparação manual de versões alpha

Referência da [issue #8](https://github.com/glaucia86/revelumo/issues/8). Aprovar uma PR é revisar código; integrar um commit não lança uma versão. Preparação, tag e publicação são etapas distintas, cada qual com escopo e autorização próprios.

## Estado e candidata proposta

`package.json`, `package-lock.json` (campo superior `version` e `packages[""].version`) continuam em `0.0.1`. A primeira candidata proposta é `0.1.0-alpha.1`, com tag futura `v0.1.0-alpha.1`. São nomes propostos, não uma versão lançada, reservada ou preparada para distribuição. Conteúdo e validação da candidata ainda precisam ser definidos; não incrementar versão para uma candidata vazia ou sem conteúdo validado.

Esta issue entrega documentos. Não cria tag/release, envia ao npm, configura makers/assinatura/notarização ou muda app/workflow. `private: true` permanece; `makers: []` significa que `npm run package` gera uma pasta de desenvolvimento, não instaladores. A licença do projeto ainda está pendente.

## Preparar

1. Escolher um conjunto coerente de mudanças já integrado em `main`, identificar seu SHA completo e listar PRs realmente incluídas. Trabalho em outra branch, como #5, não entra como entregue. Guardar `git rev-parse HEAD` e conferir checkout limpo com `git status --short`.
2. Conferir CI terminal verde **nesse SHA integrado**, com evento, SHA efetivamente testado, URL do run e resultados por job. O merge ref de uma PR e um run histórico de outro SHA não substituem essa conferência. Se houver qualquer mudança posterior, conferir novamente o SHA resultante.
3. Definir conteúdo/limites da candidata e executar a [verificação reproduzível](ci.md), com fixtures sintéticas e pacote efetivamente testado. Registrar versões das ferramentas, plataforma/arquitetura, comandos, saídas, contagens, skips e limites em `report.md`; não deduzir suporte a partir de um nome de plataforma no produto.
4. Somente quando conteúdo e validação estiverem definidos e a preparação autorizada, mover os itens escolhidos de `Unreleased` para uma seção da candidata com seu estado explícito, preservando `Unreleased` para mudanças posteriores. Data de lançamento só é registrada quando houver lançamento. Não listar funcionalidades planejadas como entregues.
5. Na mesma preparação, sincronizar `package.json.version`, `package-lock.json.version` e `package-lock.json.packages[""].version`, mantendo o restante do lockfile e `private: true`. Conferir os três valores e o diff; não atualizar dependências junto com versionamento.
6. Integrar a preparação apenas com autorização apropriada. Identificar o **SHA integrado final**, conferir seu próprio run de CI e testar o pacote desse checkout. Uma mudança documental/de versão também altera o SHA; resultados do passo 2 não são herdados automaticamente. Ligar esse SHA, checks, conteúdo e pacote no registro compacto abaixo, preservando relatórios anteriores.

## Checklist de futura tag e publicação manual

Preencher somente numa janela futura autorizada; este checklist não executa comandos de publicação.

- [ ] Conteúdo coerente e não vazio; versão, changelog e três campos package/lockfile coincidem.
- [ ] Checkout limpo do SHA integrado final exato; registro da candidata aponta para esse SHA.
- [ ] CI terminal verde nesse SHA; URL/evento/SHA testado e jobs conferidos, incluindo contagens de aprovados, falhas e motivos de skips.
- [ ] Pacote desse SHA testado; plataforma/arquitetura, ferramentas, comandos, resultados e relatório identificados. Distinguir pasta empacotada de instalador.
- [ ] Somente plataformas e experiências efetivamente verificadas declaradas; limites nativos/visuais, macOS, desempenho/cor e licença pendente explicitados. Decisões de licença/distribuição necessárias resolvidas antes de distribuir.
- [ ] Nome da tag ainda inexistente: conferir refs locais e remotas naquele momento. Ausência de tag não autoriza sua criação; não sobrescrever/reutilizar tag existente.
- [ ] Autorização explícita da responsável para criar tag nesse SHA e, separadamente, publicar o conteúdo/destino aprovado. Nenhuma publicação por approval, PR ou todo merge.
- [ ] Se autorizada a tag, verificar que resolve exatamente para o SHA aprovado; uma tag identifica código, não prova publicação nem compatibilidade.
- [ ] Se autorizada a publicação, conferir notas, arquivos aprovados e destino antes da ação; registrar URL, data e resultado real depois. Falha não é lançamento concluído; qualquer correção exige nova preparação/validação, sem mover uma tag publicada.

## Registro compacto de uma candidata

Copiar para seu `report.md` quando houver candidata definida; campos pendentes não significam gate aprovado.

| Campo | Preencher com evidência |
| --- | --- |
| Estado, versão proposta e conteúdo | proposta / preparada / tag criada / publicada; itens e PRs integradas |
| SHA integrado final | SHA completo e checkout limpo |
| CI | evento, SHA testado, URL/run/jobs e resultado terminal |
| Testes por ambiente | OS/arquitetura, ferramentas, aprovados/falhas/skips com motivos |
| Pacote testado | caminho/identidade, SHA de origem, comandos e resultados |
| Limites e relatórios | experiências não verificadas e links às evidências |
| Tag/publicação | nome, checagem de inexistência, autorizações, SHA alvo e resultado/URL/data se realizados |

## Evidências integradas

O [changelog](../CHANGELOG.md) explica **o que mudou** para a pessoa usuária. Cada `report.md` explica **como, onde e com quais limites** foi verificado. Relatórios históricos permanecem preservados, inclusive tentativas bloqueadas; este índice complementa os registros sem reescrever suas conclusões.

| Entrega integrada | Evidências e limites |
| --- | --- |
| [PR #1](https://github.com/glaucia86/revelumo/pull/1), merge `9fcef67b61df6ae77678b0eff7185ead1e7cec2f` | [Catálogo Linux](../evidence/e2e-linux/report.md), [lote/grade Linux](../evidence/batch-jpeg/report.md); roteiros de snapshots históricos |
| [PR #6](https://github.com/glaucia86/revelumo/pull/6), merge `b350629da67bde5cc7a625e9d34d7ed42ea96716` | [Relocalização Windows](../evidence/relocation-windows/report.md), [disponibilidade Windows](../evidence/availability-windows/report.md); diálogo substituído, sem inspeção visual/nativa Windows |
| [PR #9](https://github.com/glaucia86/revelumo/pull/9), merge `0fedfbd99152fd7ff0ef3c639fa79411d4d190d1` | [Relatório CI histórico](../evidence/ci/report.md), [run PR 38201933683](https://github.com/glaucia86/revelumo/actions/runs/38201933683), [push integrado 38202224197](https://github.com/glaucia86/revelumo/actions/runs/38202224197) |

O push integrado acima está verde: Windows 57 aprovados, zero falhas, dois skips POSIX FIFO e quatro processos Electron first/reopen; Ubuntu 59 aprovados, zero falhas/skips, sem smokes Electron nessa plataforma. Tipos e pacote passaram em ambos. Esse resultado resolve a dependência #7 na base, mas **não valida uma candidata futura nem o SHA documental desta issue**. macOS não executado; nenhum instalador alegado.

## Segurança de eventual automação futura

CI de PR permanece somente leitura (`contents: read`, checkout sem credenciais persistidas). Publicação futura deve ficar em workflow/job separado, manual, restrito ao commit confiável integrado e validado; conferir o SHA alvo, gates e autorização antes de executar. Conceder `contents: write` somente onde necessário para publicação e usar `GITHUB_TOKEN`, sem PAT novo. Não executar código de PR não confiável em contexto com escrita/secrets, nem converter aprovação de review em lançamento. Esta issue não cria esse workflow, secrets ou serviços pagos; mantém o objetivo de custo zero e não altera budgets, cobrança, branch protection ou permissões do repositório.
