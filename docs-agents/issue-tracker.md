# Issue tracker: GitHub

Issues e specs vivem em `glaucia86/revelumo`. Prefira o conector GitHub; alternativamente, use `gh` autenticado, após verificar sua disponibilidade. Confirme sempre o repositório-alvo.

**PRs as a request surface: no.**

## Operações

Use as operações equivalentes do conector para criar, ler, listar, comentar, editar e fechar issues. Alternativas com `gh`:

- Criar/publicar: `gh issue create --repo glaucia86/revelumo --title "..." --body-file <arquivo>`.
- Ler: `gh issue view <n> --repo glaucia86/revelumo --comments`.
- Listar: `gh issue list --repo glaucia86/revelumo --state open`.
- Comentar: `gh issue comment <n> --repo glaucia86/revelumo --body-file <arquivo>`.
- Editar: `gh issue edit <n> --repo glaucia86/revelumo` com os campos desejados.
- Fechar: `gh issue close <n> --repo glaucia86/revelumo --comment "..."`.

## Wayfinder

- Mapa: issue com `wayfinder:map` e seções Destination, Notes, Decisions so far, Not yet specified e Out of scope.
- Tickets: sub-issues nativas, com `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` ou `wayfinder:task`.
- Bloqueios: dependências nativas; use IDs de banco exigidos pela API, não números de issue.
- Se a ferramenta não expuser essas relações, registre checklist no mapa, `Part of #<mapa>` e `Blocked by: #<n>` nos tickets. Declare que são referências textuais.
- Fronteira: primeiro ticket aberto na ordem do mapa, sem responsável e sem bloqueador aberto.
- Assumir: atribuir ao desenvolvedor responsável antes de trabalhar; resolver: comentar resultado, fechar e atualizar Decisions so far com resumo e link.

Crie labels e relações somente ao executar trabalho autorizado; esta configuração não cria issues nem concede permissões.
