# Changelog

Mudanças relevantes para quem usa o Revelumo. `Unreleased` contém somente entregas integradas; não representa uma versão publicada. Preparação e evidências seguem o [procedimento alpha](docs-agents/versioning.md).

## Unreleased

Referência integrada em 12/10/2026: `0fedfbd99152fd7ff0ef3c639fa79411d4d190d1`. Versão do projeto: `0.0.1`; nenhuma alpha lançada por esta preparação.

### Adicionado

- Catálogo SQLite local, importação de JPEG por referência e prévia, preservando os originais. Importação em lote com progresso e resultado por arquivo, miniaturas persistentes orientadas e grade paginada. Reabrir preserva itens confirmados; um lote interrompido não retoma automaticamente. [PR #1](https://github.com/glaucia86/revelumo/pull/1).
- Indicação de original ausente e relocalização individual após igualdade de SHA-256, preservando registro e miniatura. Cancelamento, conteúdo diferente e conflito preservam a referência anterior. Registros antigos já ausentes sem hash exigem nova importação, sem substituir o registro anterior. [PR #6](https://github.com/glaucia86/revelumo/pull/6).

### Corrigido

- Botões da grade com semântica acessível nativa. Conferência de disponibilidade dos originais em cache sem ler conteúdo, calcular hash ou decodificar cada foto ao navegar, focar ou atualizar a grade; presença não comprova identidade atual. [PR #6](https://github.com/glaucia86/revelumo/pull/6).

### Verificação

- CI reproduzível de testes, tipos e pacote em Windows/Ubuntu, com regressão Electron e reabertura automatizadas no Windows. [PR #9](https://github.com/glaucia86/revelumo/pull/9), [run do SHA integrado](https://github.com/glaucia86/revelumo/actions/runs/38202224197). CI é verificação de desenvolvimento, não publicação nem garantia de suporte em toda máquina.

### Limites conhecidos

- Somente JPEG: RAW, edição/exportação e estrelas/flags ainda não fazem parte desta entrega; [issue #5](https://github.com/glaucia86/revelumo/issues/5) continua trabalho separado.
- Cache corrompido não se recupera automaticamente; alteração externa do original não invalida a miniatura até reimportação. Nome, tamanho e miniatura não comprovam identidade.
- Windows foi verificado por automação com seletor substituído. Inspeção visual e diálogo nativo Windows permanecem pendentes na [issue #4](https://github.com/glaucia86/revelumo/issues/4). Ubuntu teve testes/tipos/pacote na CI; smokes Electron recentes não foram executados ali. Há roteiros gráficos Linux históricos em seus próprios snapshots. macOS não foi validado.
- Sem validação no alvo de 8 GB ou ampla matriz de câmeras/cor. Forge produz pasta de desenvolvimento; sem instaladores, assinatura ou notarização. Licença do projeto pendente; repositório público não concede licença open source.

Os [relatórios históricos](docs-agents/versioning.md#evidências-integradas) registram métodos, ambientes e limites dessas verificações, sem transformar resultados antigos em validação de uma candidata futura.
