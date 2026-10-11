# Documentação de domínio

Use um único contexto de domínio inicialmente. Todos os documentos complementares ficam em `docs-agents/`:

- `docs-agents/GLOSSARY.md`: termos efetivamente definidos.
- `docs-agents/adr/NNNN-titulo.md`: decisões arquiteturais efetivamente tomadas com trade-offs relevantes ou difíceis de reverter, numeradas em sequência.

Esses caminhos são destinos futuros. Não crie arquivos vazios, termos provisórios tratados como definitivos ou ADRs para decisões ainda pendentes. Se os documentos não existirem, prossiga sem tratar a ausência como problema.

## Consulta direcionada

Antes de explorar uma área, procure no glossário apenas os conceitos relevantes e leia somente os ADRs que afetam a tarefa. Não carregue todos os ADRs.

Use o vocabulário definido em issues, propostas e testes. Sinalize lacunas reais sem inventar consenso.

Se uma proposta contrariar um ADR, identifique a decisão e explique o conflito; não a substitua silenciosamente.

## Registro

Quando um termo for resolvido, registre definição curta e distinções necessárias no glossário. Para uma decisão que justifique um ADR, registre contexto, alternativas, decisão, consequências e referência à discussão. Não crie ADRs para decisões triviais.

Preserve o histórico: uma decisão substituída deve apontar para a que a substituiu. Mantenha perguntas em aberto nas issues até serem resolvidas.
