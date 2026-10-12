# Standards — revisão independente consolidada

Base: `8b8aa98921760945b5d708f0f481b34d1423a314`. Revisão do WIP efetivo, incluindo arquivos novos; não de um diff vazio entre commits. Agente distinto do implementador e do revisor Spec.

Snapshot final: `changes.patch`, SHA-256 `275022102e995a3b599b4a39a8e4c0eb6a8ab182b6791d51b899c87bfa567edb`. Documentação de evidências adicionada depois não altera produto/harness.

## Achados iniciais, corrigidos

### P1 — Confirmação perdida bloqueava saves posteriores

ExposureEditor reconstruía cada pedido usando todos os gestos pendentes. Quando um gesto completo era persistido, mas sua confirmação se perdia, um novo ajuste reenviava esse gesto numa revisão maior. Library recusava o lote como “Gesto de edição obsoleto”; retry e flush repetiam o pedido inválido.

Reprodução independente com Library, filesystem e SQLite reais: rev2 persistiu g1=10; rev4 reenviou [g1=10, g2=20] sem aproveitar a confirmação anterior. Duas tentativas retornaram invalid-request; a receita permaneceu 10.

Violava ADR 0004:11 e issue-16-plan.md:18/22, sobre recuperação por retry e preservação dos gestos pendentes.

Correção revisada: ExposureEditor.tsx:120–135 conserva saveRequest com revisão/payload imutáveis até confirmação, reconcilia o pedido anterior e mantém o ajuste posterior para outro lote. A regressão está em test/electron-history.cjs:131–138; o implementador confirmou RED→GREEN no Electron.

### Possível Duplicated Code — heurística, não violação dura

Os caminhos save/histórico duplicavam a checagem de foto, sessão e revisão. Corrigido com confirms(), ExposureEditor.tsx:66–69, preservando as diferenças entre as operações.

## Resultado final

Nenhum achado Standards restante no snapshot identificado. Reavaliados os smells obrigatórios com prevalência dos padrões documentados do repositório.

Os deltas de drenagem em lotes, separação entre gestos de ponteiro/teclado, encerramento por blur e gate Windows não apresentaram novas violações. O workflow preserva permissões, isolamento, timeout e diagnóstico por falha.

## Limites

Recheck final estático do código e testes. O revisor executou somente a prova core isolada do P1 inicial; não executou Electron/CUA nem alterou o snapshot. Resultados Electron e regressão completa pertencem à execução do implementador. Retenção pendente não foi tratada como defeito. Este parecer não constitui conclusão de QA visual, suporte de plataforma ou autorização de publicação.

Resumo Standards: um P1 e uma heurística iniciais corrigidos; zero achados remanescentes no recheck.

## Delta após aprovação da retenção

Revisão independente contra `872d609`; snapshot SHA-256 `24d8b87e9f5f0b3988d8aaeb48c643ec3c0ecadc36181406359dab24b6f7e6b8`.

Nenhuma violação documentada bloqueante ou smell acionável. Corte após mudança efetiva conserva 100 transições e baseline, após eliminar Redo; checkpoint mantém o estado-base para no-op e limita a disponibilidade. Receita/cursor/corte continuam na transação. Testes respeitam Library/IPC/DOM; CI não amplia permissões. Treze testes de histórico executados pelo revisor passaram.

Observação documental: sequência em docs-agents/ci.md ainda dizia dez modos; corrigida pelo implementador para doze, incluindo retention e retention-reopen. O revisor não executou Electron/CUA ou CI remoto. A retenção já aprovada substitui a pendência histórica descrita no parecer inicial.
