# Revelumo

Editor fotográfico desktop local para Linux, Windows e macOS, desenvolvido de forma independente e por etapas. Lightroom Classic é referência funcional, sem pressupor paridade ou data de lançamento.

- Sem funcionalidades de IA no produto, assinatura ou sincronização em nuvem. Agentes de programação podem auxiliar o desenvolvimento.
- Aprovados: Electron, React, TypeScript e Electron Forge; catálogo SQLite local acessível somente pelo processo principal, com IPC restrito. Público inicial: amadores e entusiastas. Motor RAW e licença permanecem em aberto; não transformar propostas em decisões.
- O repositório `glaucia86/revelumo` permanece privado até autorização explícita para mudar a visibilidade.
- REA é uma ferramenta auxiliar de investigação, não uma dependência obrigatória.

## Agent skills

GitHub Issues é o rastreador de trabalho. A documentação complementar fica em `docs-agents/`, na raiz, com nomes de diretórios em minúsculas.

Use progressive disclosure: este arquivo é o ponto de entrada. Consulte somente o documento necessário à tarefa; não carregue toda a pasta nem siga todos os links automaticamente.

| Quando consultar | Documento |
| --- | --- |
| Ler, planejar ou atualizar issues, specs e mapas Wayfinder | [issue-tracker.md](docs-agents/issue-tracker.md) |
| Investigar conceitos do produto ou decisões de arquitetura | [domain.md](docs-agents/domain.md) |
| Trabalhar na primeira fatia JPEG/SQLite | [0001-local-catalog-ipc.md](docs-agents/adr/0001-local-catalog-ipc.md) |
| Retomar implementação e verificar limitações reais | [implementation-status.md](docs-agents/implementation-status.md) |
| Planejar uma investigação extensa, reduzir contexto ou passar trabalho adiante | [context-workflow.md](docs-agents/context-workflow.md) |

Mantenha cada regra em um único lugar. Estes links não autorizam publicar, atribuir tarefas ou tomar decisões pelo usuário.
