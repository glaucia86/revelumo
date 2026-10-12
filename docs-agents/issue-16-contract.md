# Issue #16 — contrato local de histórico de exposição

Contrato aprovado para [issue #16](https://github.com/glaucia86/revelumo/issues/16), derivado das decisões recebidas em 12/10/2026. A responsável confirmou explicitamente o conjunto em 12/10/2026, incluindo retenção de 100 passos sem expiração.

## Comportamentos aprovados

1. Desfazer/refazer da exposição JPEG é persistente e associado ao UUID da foto. Fechar/reabrir o aplicativo conserva o valor, o cursor e o caminho disponível para refazer.
2. Cada arraste completo ou edição numérica completa representa um passo. Pausas que disparam autosave não fragmentam o gesto; dois gestos completos dentro dos mesmos 300 ms continuam dois passos.
3. Redefinir a exposição para 0 EV é um ajuste desfazível quando altera o valor.
4. Um novo ajuste efetivo depois de desfazer elimina os passos de refazer. Uma edição que termina no valor inicial não cria passo nem elimina o caminho anterior.
5. O trabalho inclui verificações contínuas com o objetivo de encontrar e corrigir defeitos, além da compilação.

## Limites e regras técnicas preservadas

- Escopo deste histórico: exposição em décimos inteiros de EV, de −30 a +30. Não restaurar snapshots de futuras configurações de balanço de branco/recorte. Elas não estão implementadas nesta fatia.
- Originais permanecem somente leitura. Histórico guarda valores/metadados, sem imagens, frames, JPEGs derivados ou caches de prévias por passo.
- Catálogo atual v5 migra transacionalmente para v6. EV já existente vira estado inicial, sem inventar ajustes anteriores. Sem receita, o estado inicial é neutro.
- Receita, estados de histórico, cursor e checkpoint ativo são persistidos na mesma transação SQLite. Confirmação de interface só vale para a foto, sessão e revisão correspondentes.
- Autosave de 300 ms continua independente da unidade de Undo. Checkpoint intermediário permite recuperar o último valor realmente persistido depois de interrupção; não promete recuperar o rascunho posterior.
- Entrada numérica termina com Enter/perda de foco; slider termina com pointerup/cancel/perda de captura ou foco. Uma sequência de teclas relevantes mantidas pressionadas no slider é um gesto; teclas alheias não a fragmentam. Comparação com 0 EV não cria histórico.
- Undo/Redo primeiro concluem e persistem o gesto pendente. Falha conserva o estado recuperável e oferece retry; repetir uma confirmação perdida não duplica gravação nem desloca o cursor duas vezes.
- Navegação/fechamento normal aguardam confirmação. Descartar elimina somente alterações ainda não persistidas; um commit já em execução pode concluir antes do descarte, conforme o contrato da issue #12.
- A identidade SHA-256 é verificada no caminho protegido de commit, não a cada tick. Sessões aposentadas, revisões antigas, payloads inválidos e IDs de gesto concluídos reapresentados como edição nova são recusados.
- O transporte aceita no máximo 1024 gestos por mensagem. Filas maiores são enviadas em lotes ordenados. Este limite não descarta histórico.

## Retenção aprovada

Conservar os **últimos 100 passos por foto, sem expiração por tempo**. Ao exceder o limite, os passos mais antigos deixam de ser desfeitos. Cem transições exigem até 101 valores, incluindo o estado-base mais antigo ainda alcançável. Undo/Redo apenas deslocam o cursor; um novo ramo descarta o Redo antes de aplicar o limite.

O checkpoint ativo anuncia no máximo 100 passos. Enquanto o gesto está em andamento, seu estado-base é conservado para que voltar ao valor inicial não elimine história nem Redo. Concluir o gesto com mudança ou usar Undo/Redo materializa a transição e elimina o excesso na mesma transação. Após interrupção, somente o checkpoint persistido participa desse procedimento.

O limite é por UUID, não global. Nenhuma ação do histórico restaura balanço de branco ou recorte.

## Critérios de verificação

- SQLite real via interface pública Library: migração, isolamento, persistência, no-op, novo ramo, reset, identidade, transação sob bloqueio e retry idempotente.
- Electron empacotado: controles acessíveis e eventos Chromium reais, pixels, pausa em gesto, gestos rápidos, autosave, reinício, interrupção, confirmação perdida e fechamento concorrente.
- Revisões Standards e Spec independentes sobre diff imutável; corrigir achados e repetir evidências.
- QA visual cloud, pacote e CI no fluxo do repositório. Sem inferir validação Windows nativa ou macOS de testes Linux.

Estado local e resultados: [evidence/issue-16/report.md](../evidence/issue-16/report.md). A publicação, revisão do SHA remoto e CI precedem o merge; os resultados ficam no PR da issue.
