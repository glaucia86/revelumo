# Proposta de implementação: classificação local (#5)

Esta fatia foi autorizada como proposta reversível para revisão, não como aprovação explícita dos estados do produto. A decisão definitiva do contrato continua pendente na issue #5.

- Estrelas: inteiro de 1 a 5; `null` significa sem avaliação. Limpar define `null`.
- Flag única: `neutral` (sem flag), `selected` (selecionada), `rejected` (rejeitada). Escolher qualquer estado substitui o anterior; limpar define `neutral`.
- Estrelas e flag são independentes. A operação salva o par atomicamente por UUID da foto; repetir o mesmo par é idempotente. Não há edição em lote ou gravação JPEG/XMP.
- Novas fotos e migração de catálogos v1–v3 começam sem avaliação e sem flag. Reimportação e relocalização preservam a classificação do mesmo registro.
- SQLite v4 guarda o par, mantém ID, caminho, hash e miniaturas. O renderer recebe classificação e resumo público, nunca caminhos. Main valida UUID, campos exatos, inteiro/limites e enum antes de gravar.
- A UI apresenta o último estado confirmado; erro de gravação não mostra sucesso nem troca o estado. Durante gravação, controles e navegação ficam desabilitados. Sem seletor ou confirmação, não existe cancelamento próprio de classificação; cancelar importação/relocalização não altera o par.

Fronteiras TDD autorizadas nesta delegação: `Library` com SQLite/filesystem reais (persistência, reimportação, migração, falha, originais); parser/preload/IPC (payload estrito e isolamento); renderer empacotado (estado, teclado, acessibilidade, navegação e recarga). Decodificador e seletor nativo são adaptadores nos testes. Fluxo Electron automatizado oculto não comprova aparência visual, leitor de tela ou seletor Windows real.
