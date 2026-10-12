# Issue #8 — preparação documental alpha

12/10/2026. Checkout separado, branch `docs/issue-8-versioning`, base integrada `0fedfbd99152fd7ff0ef3c639fa79411d4d190d1`. [Spec atual](https://github.com/glaucia86/revelumo/issues/8) lida pelo conector GitHub; PRs #1/#6/#9 confirmadas integradas pelo mesmo conector e pelo histórico Git local.

## Entrega e ciclo de verificação

Escopo somente documental: [changelog](../../CHANGELOG.md) e [procedimento/checklist alpha](../../docs-agents/versioning.md). Sem mudanças em aplicativo, workflow, README, versões ou relatórios históricos.

Nesta fatia sem comportamento executável novo, o ciclo RED/GREEN foi uma inspeção de aceite documental, não TDD automatizado do produto. Antes da escrita, `Test-Path CHANGELOG.md` e `Test-Path docs-agents/versioning.md` retornaram `False`; faltavam o changelog e todos os gates de preparação da #8. Primeiro foi criado o changelog e conferido contra as entregas integradas; depois o procedimento foi criado e conferido contra os critérios restantes. Não foram adicionados testes acoplados a frases da documentação. As skills oficiais implement/tdd/code-review e os complementos tests/mocking foram lidos.

| Critério observado após a escrita | Resultado |
| --- | --- |
| `Unreleased` contém somente entregas PR #1/#6/#9 com links e limites | Conferido; #5 não incluída como entregue |
| Preparação identifica conjunto coerente, SHA final, sua CI e pacote testado | Documentado; mudança posterior exige nova validação |
| Changelog explica mudanças, relatórios explicam método/ambiente/limites | Papéis separados e histórico preservado por links |
| `0.1.0-alpha.1` / `v0.1.0-alpha.1` são propostas | Não lançadas; package/lockfile permanecem `0.0.1` |
| Sincronização dos três campos package/lockfile na preparação futura | Documentada, sem bump nesta issue |
| Checklist inclui skips/limites/plataformas, inexistência da tag e autorização | Documentado; tag e publicação têm gates separados |
| Segurança de automação futura | CI read-only; publicação manual separada, SHA confiável, escrita mínima, GITHUB_TOKEN sem PAT |
| Nenhum instalador/suporte macOS/licença definido sem evidência | Limites explícitos; sem makers ou workflow novo |

## Verificações locais

Windows x64, Node `24.19.0`, npm `12.0.2`. Instalação e pacote usaram cache em diretórios autorizados deste workspace. Nenhuma fotografia pessoal ou serviço pago utilizado.

| Comando | Resultado |
| --- | --- |
| `npm ci` | exit 0, 148 pacotes; npm informou zero vulnerabilidades |
| `npm run typecheck` | exit 0 |
| `npm test` com TEMP/TMP no workspace autorizado | exit 0; 59 testes, 56 aprovados, zero falhas, três skips |
| `npm run install:electron` | exit 0 |
| `npm run package` | exit 0; pasta Windows x64, app.asar 251.523 bytes, sem instalador |
| `git diff --cached --check` | exit 0 |

Skips: alias symlink requer permissão Windows; dois casos POSIX FIFO indisponíveis no Windows. A primeira tentativa usou TEMP virtualizado do sandbox e encontrou EPERM ao renomear fixtures; a correção foi apontar TEMP/TMP para diretório autorizado, sem mudar código ou asserções. Não foi erro novo introduzido por documentação. [Log da suíte final](tests.txt) e [log do pacote](package.txt).

Não executados nesta issue: smokes Electron, interação/inspeção visual/nativa, Ubuntu/macOS ou CI remota deste novo SHA. O pacote foi gerado, mas não exercitado como candidata alpha. Resultados da CI histórica do SHA base vêm da issue #8 atualizada e dos relatórios/runs ligados no procedimento; não são resultados deste commit. Candidata futura exige seus próprios checks e teste do pacote final.

## Revisão e handoff

Dois agentes independentes fizeram [Standards e Spec](code-review.md) sobre o WIP indexado dos dois documentos contra a base fixa, antes do commit. Zero achados concretos em ambos os eixos. Este relatório e logs foram acrescentados depois para registrar resultados, sem alterar os documentos revisados.

O commit local identifica o snapshot desta entrega; obter com `git log -1 --format=%H` na branch. Nenhum push, merge, tag, release, publicação npm, atualização externa de issue, alteração de licença ou configuração do repositório realizada. Publicação coordenada permanece com a responsável/orquestrador.
