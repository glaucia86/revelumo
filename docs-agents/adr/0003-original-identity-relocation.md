# 0003: Identidade do original e relocalização por SHA-256

Decisão aprovada pela responsável em 12/10/2026 para a [issue #4](https://github.com/glaucia86/revelumo/issues/4). Usar igualdade SHA-256 dos bytes completos para comprovar que o candidato é exatamente o arquivo catalogado. Nome, tamanho ou aparência não provam identidade. Arquivos com EXIF ou outros bytes alterados não são religados automaticamente, mesmo que tenham a mesma imagem aparente.

Novas importações armazenam o hash dos bytes validados. Um hash existente nunca é substituído silenciosamente pela reimportação de conteúdo diferente no mesmo caminho. O candidato é selecionado pelo diálogo nativo no main e a referência só é atualizada após comprovação; UUID, nome catalogado, posição e dados derivados associados permanecem preservados. A atualização é atômica e recusa um caminho já associado a outro registro.

Registros legados recebem hash somente a partir do original ainda acessível no caminho catalogado. Não obter um hash retroativo a partir do candidato. Se o registro antigo já estiver sem original e sem hash, preservar o registro e bloquear religação; explicar que a pessoa pode importar o arquivo como um novo registro sem substituir o anterior. Não há prova do conteúdo histórico anterior ao primeiro hash de um registro legado.

Cancelamento, candidato inválido, identidade diferente, conflito ou erro de gravação mantêm o estado anterior. Originais são abertos somente para leitura; o aplicativo não move, regrava ou exclui fotografias. Renderer recebe IDs, estados e resultados, sem caminhos livres ou hashes. Manter validação de origem/payload do IPC e serialização das leituras. Sem busca automática, religação em lote/pasta, RAW, estrelas/flags, edição ou exportação nesta fatia.

As verificações e limites de plataforma serão registrados ao terminar a implementação; este ADR registra a decisão, não resultados ainda não executados.
