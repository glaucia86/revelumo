# Preparação manual de versões alpha

Referência da [issue #8](https://github.com/glaucia86/revelumo/issues/8). Aprovar uma PR é revisar código; integrar um commit não lança uma versão. Preparação, tag e publicação são etapas distintas, cada qual com escopo e autorização próprios.

## Estado publicado — 12/10/2026

A [pré-release experimental `0.1.0-alpha.1`](https://github.com/glaucia86/revelumo/releases/tag/v0.1.0-alpha.1) foi publicada em **2026-10-12T23:28:59Z**, somente fonte/notas. A tag `v0.1.0-alpha.1` resolve para `bdb51e6c6eb78c5ad522639ff06ac76317c0a609`; [CI de push 38319815423](https://github.com/glaucia86/revelumo/actions/runs/38319815423) verde em Windows/Ubuntu. Windows passou os gates empacotados de engine/circuito/UI; Ubuntu mantém docs/núcleo/tipos/package, com smokes gráficos omitidos intencionalmente. Release marcada **pre-release**, sem assets enviados: apenas archives automáticos ZIP/tar.gz de fonte.

Os três campos package/lockfile declaram `0.1.0-alpha.1`. A base funcional selecionada foi `aa77bb8af6f865167f2e62f66cb1c76d57e9cf23` (PR #47); a [PR #48](https://github.com/glaucia86/revelumo/pull/48) integrou a preparação e registra os resultados finais. As [notas da candidata](releases/0.1.0-alpha.1.md) e [relatório de preparação](../evidence/alpha-preparation/report.md) ficam preservados como históricos anteriores à publicação. Esta atualização na main não move a tag nem cria outra versão.

`private: true` permanece; `makers: []` permanece; `npm run package` gera uma pasta de desenvolvimento, não instaladores. Não houve publicação npm, anexação de `out/`, assinatura/notarização ou upgrade de dependências. MIT cobre código/documentação originais; avisos de terceiros permanecem separados em THIRD_PARTY_NOTICES.md.

## SemVer durante o desenvolvimento inicial

Usar o formato [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html). `0.y.z` indica desenvolvimento inicial, sem contrato público estável; o sufixo `alpha.N` identifica uma prévia experimental. Nesta série proposta, cada nova candidata publicada para o mesmo marco aumenta `N` (`0.1.0-alpha.1`, `0.1.0-alpha.2`), sem modificar o conteúdo de uma versão já publicada nem reutilizar seu identificador. Um novo marco funcional pode iniciar outra série, por exemplo `0.2.0-alpha.1`; a escolha é feita durante a definição do escopo, nunca por quantidade de commits ou automaticamente a cada merge. `1.0.0` exige definir o contrato público e seus compromissos de compatibilidade.

A versão do aplicativo não substitui `schemaVersion` do catálogo nem `processingVersion` das receitas. Mudanças nesses contratos exigem validação própria e notas de migração, preservação de originais e limites de compatibilidade. Estar em alpha não dispensa esses cuidados.

## Escopo da primeira alpha: código-fonte experimental

A entrega publicada é um marco para pessoas desenvolvedoras que queiram estudar e compilar o projeto. Uma release agrupa entregas integradas, notas, evidências e limitações; sua tag deve resolver para um único SHA integrado com CI terminal verde. [Archives de código-fonte gerados pelo GitHub](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) (`zip`/`tar.gz`) são cópias do código versionado, **não instaladores, executáveis prontos ou prova de suporte multiplataforma**. Publicar o site também não publica uma versão do aplicativo.

Escopo selecionado em `aa77bb8af6f865167f2e62f66cb1c76d57e9cf23` (PR #47 integrada em 12/10/2026):

- Catálogo JPEG/SQLite, importação em lote, miniaturas, identidade e relocalização, classificação e filtros.
- Exposição não destrutiva, histórico de exposição, WB relativo, comparação, autosave e reabertura.
- Catálogo Cobre e traduções do catálogo/editor/exportação em PT-BR/EN/ES.
- Exportação de um JPEG full-frame sRGB com revisão EV/WB v2 confirmada, orientação aplicada, créditos selecionados, GPS removido e gravação exclusiva. Qualidade fixa 0,90 do encoder Chromium; entrada até 32 MiB/40 MP e saída até 32 MiB, sem redução silenciosa de qualidade/resolução.
- Documentação, licença MIT do código original, avisos de terceiros e site do projeto.

Recorte na interface, RAW/HEIC/TIFF, edição em lote, redesenho completo do editor e distribuição de binários ficam fora desse marco de referência. Componentes internos ou trabalho em branches não tornam esses fluxos disponíveis. Em futuras candidatas, atualizar o escopo e as evidências conforme o conteúdo integrado; não incorporar trabalho em andamento por antecipação.

A preparação, integração e publicação desta alpha foram concluídas conforme o registro acima. Testes de um snapshot não validam futuras candidatas: cada nova versão precisa de seus próprios gates. Os passos a seguir continuam sendo o procedimento para futuras preparações, sem reescrever a tag já publicada.

Binários exigirão uma fatia separada: formatos e makers por plataforma, proveniência e integridade dos artefatos, avisos/licenças redistribuídos, testes de instalação/abertura/desinstalação e política explícita de assinatura/notarização e seus custos. Não contratar serviços, criar certificados ou ampliar permissões nesta preparação.

### Notas a preencher na janela de publicação

- Estado e público: pré-release experimental de código-fonte, para desenvolvimento; sem instaladores.
- Versão/tag e SHA completo: os três campos package/lockfile e a seção do changelog devem coincidir.
- Entregas: resumo do conjunto integrado e links às PRs relevantes, sem listar planos como funcionalidades.
- Verificação: CI do SHA final, jobs/resultados/skips, pacote testado, ambiente e relatório de evidências. Registrar limites Windows/Linux/macOS separadamente.
- Uso e limitações: apontar para o [guia de contribuição](../CONTRIBUTING.md), informar requisitos de desenvolvimento, limitações funcionais, compatibilidade de catálogo/receitas e o que não foi validado.
- Direitos e distribuição: [MIT](../LICENSE), [avisos de terceiros](../THIRD_PARTY_NOTICES.md) e inventário dos arquivos realmente publicados. Revisar direitos de recursos incluídos no código-fonte também; ausência de binários não elimina essa conferência.
- Publicação: autorização, confirmação de tag inexistente, tag verificada no SHA aprovado e URL/data reais somente após conclusão. Não alterar uma tag já publicada para corrigir o código; preparar nova versão.

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
- [ ] Somente plataformas e experiências efetivamente verificadas declaradas; limites nativos/visuais, macOS, desempenho/cor e obrigações de terceiros explicitados. Decisões de licença/distribuição necessárias resolvidas antes de distribuir.
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

CI de PR permanece somente leitura (`contents: read`, checkout sem credenciais persistidas). Publicação futura deve ficar em workflow/job separado, manual, restrito ao commit confiável integrado e validado; conferir o SHA alvo, gates e autorização antes de executar. Conceder `contents: write` somente onde necessário para publicação e usar `GITHUB_TOKEN`, sem PAT novo. Não executar código de PR não confiável em contexto com escrita/secrets, nem converter aprovação de review em lançamento. Esta preparação não cria esse workflow, secrets ou serviços pagos; mantém o objetivo de custo zero e não altera budgets, cobrança, branch protection ou permissões do repositório.
