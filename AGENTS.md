# Revelumo

Editor fotográfico desktop local para Linux, Windows e macOS, desenvolvido de forma independente e por etapas. Lightroom Classic é referência funcional, sem pressupor paridade ou data de lançamento.

- Sem funcionalidades de IA no produto, assinatura ou sincronização em nuvem. Agentes de programação podem auxiliar o desenvolvimento.
- Aprovados: Electron, React, TypeScript e Electron Forge; catálogo SQLite local acessível somente pelo processo principal, com IPC restrito. Público inicial: amadores e entusiastas. Motor RAW e licença permanecem em aberto; não transformar propostas em decisões.
- O repositório `glaucia86/revelumo` é público por decisão da responsável. Licença permanece pendente; visibilidade pública não concede licença open source.
- REA é uma ferramenta auxiliar de investigação, não uma dependência obrigatória.

## Agent skills

GitHub Issues é o rastreador de trabalho. A documentação complementar fica em `docs-agents/`, na raiz, com nomes de diretórios em minúsculas.

Use progressive disclosure: este arquivo é o ponto de entrada. Consulte somente o documento necessário à tarefa; não carregue toda a pasta nem siga todos os links automaticamente.

| Quando consultar | Documento |
| --- | --- |
| Ler, planejar ou atualizar issues, specs e mapas Wayfinder | [issue-tracker.md](docs-agents/issue-tracker.md) |
| Implementar uma issue pelo fluxo oficial do Matt Pocock | [matt-pocock-workflow.md](docs-agents/matt-pocock-workflow.md) |
| Investigar conceitos do produto ou decisões de arquitetura | [domain.md](docs-agents/domain.md) |
| Trabalhar na primeira fatia JPEG/SQLite | [0001-local-catalog-ipc.md](docs-agents/adr/0001-local-catalog-ipc.md) |
| Trabalhar em lote JPEG, miniaturas e grade | [0002-batch-jpeg-thumbnails.md](docs-agents/adr/0002-batch-jpeg-thumbnails.md) |
| Trabalhar em identidade, ausência e relocalização do original | [0003-original-identity-relocation.md](docs-agents/adr/0003-original-identity-relocation.md) |
| Retomar implementação e verificar limitações reais | [implementation-status.md](docs-agents/implementation-status.md) |
| Reproduzir CI e conferir custo, matriz e limites | [ci.md](docs-agents/ci.md) |
| Planejar uma investigação extensa, reduzir contexto ou passar trabalho adiante | [context-workflow.md](docs-agents/context-workflow.md) |

Mantenha cada regra em um único lugar. Estes links não autorizam publicar, atribuir tarefas ou tomar decisões pelo usuário.
