# Changelog

Mudanças relevantes para quem usa o Revelumo. `Unreleased` contém somente entregas integradas; não representa uma versão publicada. Preparação e evidências seguem o [procedimento alpha](docs-agents/versioning.md).

## Unreleased

Estado conferido em 12/10/2026 no commit `d3a56d94042f7011ec1b157771c4eb9055fbd307` (PR #41 integrada). Versão do projeto: `0.0.1`; nenhuma tag ou release presente na conferência. Esse snapshot orienta as entradas abaixo, mas não é uma candidata de lançamento. A primeira alpha de código-fonte segue proposta no [procedimento de versões](docs-agents/versioning.md).

### Adicionado

- Editor existente traduzido em PT-BR/EN/ES: exposição, WB relativo, histórico, comparação, classificação, relocalização, erros e saída; troca conserva rascunhos e operações em voo. Recorte/exportação continuam pendentes. [Issue #32](https://github.com/glaucia86/revelumo/issues/32), [evidências e limites](evidence/editor-language/report.md).
- Seletor persistente Português (Brasil)/English/Español/Seguir sistema; catálogo, importação, filtros, paginação e mensagens de preferência traduzidos. Preferência local separada do catálogo, fallback inglês e preservação do estado de edição. A tradução do editor foi integrada depois, na issue #32 acima; exportação ainda não existe. [Issue #30](https://github.com/glaucia86/revelumo/issues/30), [evidências e limites](evidence/language-catalog/report.md).

- Catálogo SQLite local, importação de JPEG por referência e prévia, preservando os originais. Importação em lote com progresso e resultado por arquivo, miniaturas persistentes orientadas e grade paginada. Reabrir preserva itens confirmados; um lote interrompido não retoma automaticamente. [PR #1](https://github.com/glaucia86/revelumo/pull/1).
- Indicação de original ausente e relocalização individual após igualdade de SHA-256, preservando registro e miniatura. Cancelamento, conteúdo diferente e conflito preservam a referência anterior. Registros antigos já ausentes sem hash exigem nova importação, sem substituir o registro anterior. [PR #6](https://github.com/glaucia86/revelumo/pull/6).

- Classificação com 1–5 estrelas ou sem nota, flags de selecionada/rejeitada e filtros combinados na biblioteca. [PR #11](https://github.com/glaucia86/revelumo/pull/11), [PR #23](https://github.com/glaucia86/revelumo/pull/23).
- Exposição JPEG não destrutiva, prévia sRGB até 2048 px, comparação com 0 EV e autosave da receita. [PR #20](https://github.com/glaucia86/revelumo/pull/20).
- Histórico persistente de exposição: Desfazer/Refazer e retenção dos últimos 100 passos por foto, inclusive após reabertura. [PR #26](https://github.com/glaucia86/revelumo/pull/26).
- Balanço de branco JPEG relativo: Temperatura/Matiz, redefinição e autosave, preservando o histórico exclusivo de exposição. Schema v7 e receita processingVersion 2; sem escala Kelvin ou revelação RAW. [PR #28](https://github.com/glaucia86/revelumo/pull/28).
- README em inglês, português e espanhol, distinguindo implementação, direção visual aprovada e recursos planejados. [PR #27](https://github.com/glaucia86/revelumo/pull/27).
- Site público estático do projeto com publicação GitHub Pages, separado do aplicativo desktop e de qualquer distribuição de binários. [PR #36](https://github.com/glaucia86/revelumo/pull/36), [PR #38](https://github.com/glaucia86/revelumo/pull/38), [código do site](website/README.md).
- Guias de contribuição, suporte e segurança, formulários de issue, template de PR e checagem offline dos links locais e navegação entre idiomas. [Guia de contribuição](CONTRIBUTING.md).

### Alterado

- Catálogo com a identidade Cobre: cabeçalho compacto, grade neutra, fonte Geist local com OFL preservada, controles legíveis e retorno de foco por teclado à foto aberta. Paginação, filtros, importação e originais permanecem preservados. O visual completo do editor continua separado. [PR #33](https://github.com/glaucia86/revelumo/pull/33), [issue #29](https://github.com/glaucia86/revelumo/issues/29).

- READMEs alinhados ao catálogo Cobre integrado, com capturas reais de catálogo/editor, créditos das fotografias e mini bio destacando o trabalho da criadora com IA. [Issue #29](https://github.com/glaucia86/revelumo/issues/29), [proveniência das capturas](docs/assets/screenshots/README.md).

### Licença

- Código e documentação escrita originais sob [MIT](LICENSE), copyright 2026 Glaucia Lemos. Recursos e software de terceiros mantêm seus próprios direitos e avisos, reunidos em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Corrigido

- Botões da grade com semântica acessível nativa. Conferência de disponibilidade dos originais em cache sem ler conteúdo, calcular hash ou decodificar cada foto ao navegar, focar ou atualizar a grade; presença não comprova identidade atual. [PR #6](https://github.com/glaucia86/revelumo/pull/6).

- Campos de exposição preservam rascunhos de teclado incompletos ou temporariamente inválidos até a confirmação. [PR #25](https://github.com/glaucia86/revelumo/pull/25).

### Verificação

- Circuito técnico da exportação une autenticação do original, engine, créditos selecionados sem GPS e publicação exclusiva, com reabertura independente. Ainda sem comando de exportação no aplicativo ou suporte a crop. [Issue #19](https://github.com/glaucia86/revelumo/issues/19), [evidências e custo de memória](evidence/issue-19-circuit/report.md).

- Preparação da exportação: engine JPEG full-frame sRGB com exposição/WB v2, renderer isolado e testes de recursos/lifecycle. Ainda sem ação de exportar no aplicativo; metadados/gravação/UI continuam pendentes. [Issue #19](https://github.com/glaucia86/revelumo/issues/19), [evidências](evidence/issue-19-engine/report.md).

- CI reproduzível de testes, tipos e pacote em Windows/Ubuntu, com regressão Electron e reabertura automatizadas no Windows. [PR #9](https://github.com/glaucia86/revelumo/pull/9), [run histórico de integração do PR #9](https://github.com/glaucia86/revelumo/actions/runs/38202224197). CI é verificação de desenvolvimento, não publicação nem garantia de suporte em toda máquina.

- Gates Electron de exposição, histórico e balanço de branco integrados no workflow existente, além das verificações locais de documentação. Relatórios e limites: [CI](docs-agents/ci.md), [exposição](evidence/issue-12/report.md), [histórico](evidence/issue-16/report.md), [WB](evidence/issue-17/report.md). Resultados de um snapshot não validam uma candidata futura.

### Limites conhecidos

- Somente JPEG. Recorte, exportação JPEG, RAW/HEIC, TIFF e ajustes em lote ainda não estão disponíveis. O experimento RawTherapee do [PR #21](https://github.com/glaucia86/revelumo/pull/21) não integrou um motor RAW.
- A direção A · Cobre cobre o catálogo e o shell; o redesenho completo do editor permanece na [issue #31](https://github.com/glaucia86/revelumo/issues/31). Catálogo e editor existente já oferecem PT-BR/EN/ES e seleção persistente de idioma; isso não antecipa interfaces de recorte/exportação.
- Cache corrompido não se recupera automaticamente; alteração externa do original não invalida a miniatura até reimportação. Nome, tamanho e miniatura não comprovam identidade.
- Windows foi verificado por automação com seletor substituído. Inspeção visual e diálogo nativo Windows permanecem pendentes na [issue #4](https://github.com/glaucia86/revelumo/issues/4). Ubuntu teve testes/tipos/pacote na CI; smokes Electron recentes não foram executados ali. Há roteiros gráficos Linux históricos em seus próprios snapshots. macOS não foi validado.
- Sem validação no alvo de 8 GB ou ampla matriz de câmeras/cor. Forge produz pasta de desenvolvimento; sem instaladores, assinatura ou notarização. A MIT do código não concede direitos sobre fotos, retratos, fontes ou outros recursos de terceiros.

Os [relatórios históricos](docs-agents/versioning.md#evidências-integradas) registram métodos, ambientes e limites dessas verificações, sem transformar resultados antigos em validação de uma candidata futura.
