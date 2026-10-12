# Terceira fatia: preparação Windows e critério proposto

Checkpoint de 12/10/2026. Relocalização ainda não implementada: o critério de identidade deve ser coordenado com a usuária pelo pai antes da implementação.

Registro histórico da preparação inicial. A correção de acessibilidade e o smoke Windows que estavam pendentes abaixo foram concluídos no [relatório posterior](review-windows.md); a decisão de identidade continua pendente.

## Base e ambiente

- Checkout: `C:\Users\glauc\Documents\Codex\2026-10-11\task\revelumo`.
- Base autoritativa: `main` / `9fcef67b61df6ae77678b0eff7185ead1e7cec2f`.
- PR #1 confirmado `MERGED`, em 11/10/2026 às 23:58:31 UTC; head `8c2cc771b825047c2505c4d9df847da487b8ebcb`.
- Branch local `feat/locate-missing-originals`; sem commit, push, merge, deploy ou mudança de visibilidade nesta execução.
- Windows 10.0.26200, Node 24.19.0, npm 12.0.2. Instalação `npm ci` concluída com lockfile inalterado e cache autorizado no workspace.
- `AGENTS.md`, estado da implementação e ADRs 0001/0002 lidos. `.agents/skills` e `graphify-out` ausentes neste checkout. Nenhuma credencial ou fotografia pessoal foi consultada.

## Verificação executada

- Primeira execução `npm test`: 42 testes, 32 aprovados, 8 falhas, 2 skips. Sete falhas ocorreram ao limpar bancos SQLite com conexão aberta; outra foi `EPERM` na criação de symlink.
- Após correção da ordem de limpeza: `npm test`, exit 0; 42 testes, 39 aprovados, zero falhas e 3 skips. Os dois testes de FIFO já ignoravam Windows. O teste de symlink agora é ignorado somente quando Windows retorna `EPERM`, com motivo explícito; outros erros continuam falhando.
- `npm run typecheck`: exit 0.
- `git diff --check`: exit 0.
- Persistência em segundo processo Node, referências, miniaturas, importação em lote e preservação dos hashes das fixtures existentes foram exercitadas pelos testes. Decodificação Electron e interface gráfica não foram exercitadas neste checkpoint.
- Linux: as 42 aprovações anteriores são evidência do PR integrado; não foram repetidas neste executor Windows. Nenhuma alegação de validação macOS.

## Desenho proposto para coordenação

1. Adicionar hash SHA-256 dos bytes completos do JPEG ao catálogo, em migração transacional compatível com v1/v2. Novas importações registram o hash dos mesmos bytes validados/decodificados, mantendo leitura somente dos originais.
2. Verificar disponibilidade por página e ao abrir uma foto; distinguir arquivo ausente de falha de leitura/permissão. Mostrar ausência mesmo quando há miniatura em cache. Sem watcher global ou redesenho.
3. `Localizar original` identifica a foto por UUID e abre seletor nativo no main. Nenhum caminho livre é exposto pela API ao renderer. Comparar hash completo antes de atualizar apenas a referência; manter UUID, nome catalogado, posição e cache. Cancelamento, arquivo diferente, caminho ocupado por outro registro e erros de leitura deixam o catálogo intacto.
4. Registros antigos sem hash: só capturar a identidade enquanto o original está disponível, preservando essa referência. Se já estiver ausente, bloquear religação automática com explicação de identidade não verificável. Não inferir correspondência por nome, tamanho ou miniatura. Este tratamento conservador precisa ser fechado com a usuária; uma eventual confirmação manual explícita requer decisão própria e não deve ser implementada silenciosamente.
5. Nunca sobrescrever um hash existente para aceitar bytes diferentes, inclusive em reimportação pelo mesmo caminho. Original substituído externamente deve falhar como identidade diferente, sem mostrar silenciosamente outra foto como se fosse a catalogada.

## Próximos testes TDD

Fixtures sintéticas: importar, mover externamente, detectar ausência, religar pelo conteúdo idêntico com outro nome e verificar UUID/dados após reabrir em novo processo. Rejeitar JPEG diferente com mesmo nome e tamanho; cancelar sem alteração; rejeitar destino de outro registro; migrar catálogo antigo com e sem original acessível; manter miniatura cacheada quando original está ausente; rejeitar payload IPC com caminho ou campos excessivos. Verificar semântica de botão e nome acessível da grade ao corrigir o review.

## Review posterior ao merge

As três observações fornecidas pelo pai procedem na base. README corrigido para incluir `progress`/`thumbnail` e reconhecer cache SQLite existente. `role="listitem"` nos botões da grade ainda precisa de correção com teste de acessibilidade, sem mudança visual.

## Limites pendentes

Critério de identidade não aprovado ainda; relocalização, teste novo de acessibilidade, pacote Windows e fluxo Electron real não implementados/verificados. A primeira tentativa de informar o pai com a ferramenta nativa de threads retornou `thread not found` para o ID cloud; este handoff final é o canal de notificação disponível da delegação.
