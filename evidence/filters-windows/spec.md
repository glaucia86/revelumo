# Issue #13 snapshot — 2026-10-12

## What to build

Filtrar a biblioteca por estrelas e marcação já persistidas em #5, navegar nos resultados e abrir a foto correta, sem alterar classificações ou originais. Entregar uma fatia vertical: consulta pública, IPC validado, UI acessível e testes externos.

## Status e design aprovado

Ready-for-agent. Em 12/10/2026, a responsável aprovou a proposta: filtros de “X estrelas ou mais” ou “sem avaliação”, combinados com uma marcação; escolha mantida enquanto o aplicativo estiver aberto; mudar a classificação não fecha a foto e a grade se atualiza ao voltar.

- Estrelas mínimas de 1 a 5, com opção separada “Sem avaliação” e opção sem restrição. Sem avaliação corresponde ao estado existente `null`; não criar classificação zero.
- Uma marcação opcional usando somente os estados existentes: sem flag (`neutral`), selecionada (`selected`) ou rejeitada (`rejected`). Sem restrição inclui todos.
- Combinar os dois critérios por E. Exemplo: pelo menos 4 estrelas E selecionada.
- Limpar filtros remove as duas restrições, sem modificar classificações.
- Filtros duram a sessão do aplicativo e são preservados no retorno da prévia. Reiniciar começa sem filtros.
- Se a classificação confirmada deixar de corresponder ao filtro, manter a foto atual aberta; atualizar resultados ao voltar à grade. Não fechar, trocar a foto ou perder rascunho de edição automaticamente.

## Detalhamento operacional conservador

Preservar o fluxo existente: ordem de importação e páginas de até 48 miniaturas. Mudança explícita de filtro começa na primeira página; atualização de resultados mantém a página quando válida e a ajusta quando necessário. Não introduzir navegação entre fotos ou seleção em lote nesta fatia.

Após importação, atualizar a consulta mantendo o filtro ativo; fotos que não correspondem permanecem no catálogo. Distinguir resultado vazio de catálogo vazio e oferecer limpar filtros. Consultas/respostas antigas não substituem o filtro atual. Abrir e associar resultados por UUID, nunca pelo índice da posição na grade.

Esses detalhes mantêm a base existente; qualquer ampliação material de UX retorna para decisão.

## Acceptance criteria

- [x] Semântica principal e duração dos filtros aprovadas pela responsável.
- [ ] Sem filtro retorna as mesmas fotos e ordem da biblioteca atual.
- [ ] Estrelas mínimas incluem o limite e valores superiores; “Sem avaliação” inclui somente `null`.
- [ ] Cada marcação filtra corretamente; estrelas e marcação se combinam por E; limpar restaura todas as fotos sem alterar qualquer classificação.
- [ ] Filtro permanece ao abrir/voltar da prévia e é reiniciado após fechar/reabrir o aplicativo.
- [ ] Alterar classificação não fecha/troca a foto; ao retornar, a grade reflete apenas a classificação confirmada. Falha de classificação não produz resultado baseado em estado não salvo.
- [ ] Importação mantém filtros ativos e atualiza os resultados; resultado vazio apresenta mensagem específica e ação para limpar filtros.
- [ ] Paginação mantém páginas de até 48, ajusta página inválida e não abre a foto errada após atualização.
- [ ] Respostas atrasadas não restauram resultados de filtros anteriores. Erro de consulta é compreensível e não aparece como resultado vazio confirmado.
- [ ] Controles têm nomes acessíveis, estado visível e operação por teclado; limpar filtros não exige precisão do mouse.
- [ ] Consulta de filtro usa exclusivamente o catálogo, sem leitura/hash/decode dos originais para decidir correspondência. Original ausente permanece filtrável por seus dados salvos. Carregamento normal das miniaturas visíveis continua separado.
- [ ] IPC valida payload estrito, enums e limites; rejeita campos extras, valores inválidos e caminhos livres.
- [ ] Regressões de grade, classificação, importação, disponibilidade e relocalização passam; classificação e bytes dos originais permanecem intactos.
- [ ] Testes, typecheck, integração/pacote aplicáveis e revisão independente são registrados no SHA final, com plataforma, comandos, skips e limitações reais.

## Testing decisions

Usar interfaces públicas existentes: Library com SQLite/filesystem reais; API limitada preload/IPC; UI renderer/Chromium no Electron empacotado. Observar resultados e classificação por essas interfaces, sem testes de métodos privados ou consultas diretas às tabelas como atalho.

Cobrir combinações e fronteiras de estrelas/flags, original ausente, páginas com mais de 48 resultados, alteração da classificação durante prévia, retorno à grade, importação sob filtro, consultas atrasadas e falhas. Confirmar ausência de I/O do original na consulta em fronteira observável; manter testes de miniaturas separados. Implementar por TDD vertical e revisar Standards/Spec antes do commit final.

## Blocked by

None — pode iniciar preparação/implementação conforme o fluxo do projeto e a autorização recebida. #5 e #3 estão concluídas. #12 não é dependência funcional da filtragem.

## Coordenação e fora do escopo

#12 está em desenvolvimento. Trabalhar isoladamente e coordenar integração/revalidação dos arquivos compartilhados de UI, biblioteca e IPC. Esta fatia não altera schema, receita de edição ou autosave; não reverte nem substitui o trabalho de #12.

Sem filtros avançados, comparador de estrelas exatas, coleções, busca textual, alteração em lote, novos estados de flag, nova escala de estrelas ou persistência dos filtros após reinício. Os contratos #16–19 continuam sem aprovação por consequência desta decisão.

## Restrições comuns

Manter Electron/React/TypeScript, SQLite local no main, renderer isolado e IPC validado. Originais são somente leitura; não introduzir IA, nuvem, assinatura ou serviços pagos. Não eleger motor RAW, adicionar dependência de produto, publicar release/tag ou distribuir instalador por consequência desta issue. Documentar plataforma, SHA, comandos, skips e limitações reais; 8 GB sem GPU dedicada é alvo não comprovado.

## Referências

- [Roadmap](https://github.com/glaucia86/revelumo#roadmap)
- [Catálogo e IPC](https://github.com/glaucia86/revelumo/blob/main/docs-agents/adr/0001-local-catalog-ipc.md)
- [Identidade do original](https://github.com/glaucia86/revelumo/blob/main/docs-agents/adr/0003-original-identity-relocation.md)

Baseline de planejamento: main em 5aa6693d05bbfea1c538a9360c84ee69ce195a68. Revalidar antes de executar. QA nativa/visual Windows pendente em #4 permanece separada. Este registro aprova/prepara a fatia; não comprova implementação ou testes executados.
