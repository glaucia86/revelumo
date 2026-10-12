# Alpha metadata preparation — 0.1.0-alpha.1

Base funcional: `aa77bb8af6f865167f2e62f66cb1c76d57e9cf23`, PR #47 integrada. Esta preparação só altera metadados de versão e documentos; não altera produto, dependências, schema, CI permissions ou instaladores. Não cria tag ou release.

## Verificação desta preparação

- Baseline local: Node 24.19.0/Linux x64, 290 testes aprovados, zero falhas/skips.
- Asserção dos três campos para `0.1.0-alpha.1`: RED comprovado na base, cujos três valores eram `0.0.1`.
- GREEN: asserção dos três campos `0.1.0-alpha.1`, `private: true` na fonte e comparação JSON normalizada de package/lock aprovadas. A versão é a única diferença nesses manifests.
- Gates locais da preparação: `npm test` **290 aprovados, zero falhas/skips**; `npm run typecheck` e `npm run check:docs` aprovados. Arquivos novos foram adicionados ao índice antes do gate documental final.
- Package Linux x64 aprovado com `electron_config_cache=/workspace/scratch/827b15a15839/revelumo-electron-cache npm run package`, opção já suportada pelo Forge config. Primeira tentativa sem a opção falhou com ENOENT ao criar o cache default; não foi contada como sucesso.
- Manifest do pacote `out/Revelumo-linux-x64/resources/app.asar` lido com `@electron/asar`: versão **0.1.0-alpha.1**. Forge remove campos de desenvolvimento, incluindo `private`, do manifesto empacotado; `private: true` foi verificado no package.json fonte, seu lugar de proteção contra publicação npm acidental.
- Revisões independentes Standards e Spec: sem bloqueadores. Corrigida a expressão histórica “sem version bump” da fatia UI no changelog da candidata e a âncora de instruções de uso; gate documental repetido.
- CI da base [38318722047](https://github.com/glaucia86/revelumo/actions/runs/38318722047) confirmado success no push `aa77bb8af6f865167f2e62f66cb1c76d57e9cf23`; esse resultado valida a base, não esta preparação.
- CI desta preparação e seu futuro push integrado: **pendentes neste registro**. Os gates Windows existentes exercitarão o aplicativo empacotado desse novo SHA, incluindo UI/circuito/engine. Não foi repetido o harness gráfico local neste worktree; shell sem DISPLAY. Package e inspeção de manifest não substituem o gate runtime.

## Proveniência e limites

Worktree separado da implementação da UI, criado do merge exato. Dependências existentes copiadas localmente para verificação, sem instalação/upgrade. A comparação normalizada do lockfile deverá demonstrar que somente seus dois campos de versão mudaram.

Os resultados funcionais e o corpus de recursos anteriores permanecem nos [relatórios da UI](../issue-19-ui/report.md), [engine](../issue-19-engine/report.md) e [circuito](../issue-19-circuit/report.md), com suas revisões e limitações. Nenhum benchmark pesado novo é alegado. Archives de fonte não são instaladores; sem macOS ou suporte comprovado a 8 GB.

O SHA final integrado e seu CI serão registrados na PR e conferidos antes de uma futura tag. Não é possível atribuir antecipadamente o SHA do próprio commit a este arquivo; qualquer edição posterior exige novo gate de CI no novo SHA.
