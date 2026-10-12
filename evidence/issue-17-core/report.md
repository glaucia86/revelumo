# Issue 17 — evidência do núcleo puro isolado

Estado: preparação local independente; ainda sem integração de UI, worker, IPC, catálogo ou autosave. Base `8b8aa98921760945b5d708f0f481b34d1423a314`, branch local `feat/jpeg-white-balance-core`. Não houve push/PR/merge, release ou acesso ao computador da usuária.

Ambiente: Linux x64 cloud, Node v24.19.0, dependências já disponíveis pelo checkout local. Nenhuma dependência de produto adicionada; package/lockfile e schema não foram alterados. Não existe comando de lint no projeto.

## TDD e verificação

Seam pública: `applyJpegAdjustments(base, adjustments)`. Ciclos vermelhos observados e depois verdes, um comportamento por vez: cópia neutra independente; +1 EV conhecido; temperatura positiva; matiz positivo; rejeição de valores não canônicos; rejeição de RGBA incompleto. A criação inicial do arquivo também teve erro de módulo ausente, seguido de stub e falha comportamental real de alias de buffer, antes da correção.

Cobertura adicional: fixture legado do worker imutável (61 EVs × 256 níveis por canal/alpha), 14 casos escalares Decimal-60 com nove pixels, clipping único e chamadas repetidas sobre subarray/base original. Os oráculos são arquivos fixos independentes do módulo, com [proveniência](../../test/fixtures/jpeg-adjustments-provenance.md).

Seis mutações temporárias foram detectadas: clipping intermediário, sinais de T/M, ausência de normalização, gamma 2.2 e alpha forçado. Código original restaurado e suíte novamente verde.

Verificação em 12/10/2026:

- `node --test test/jpeg-adjustments.test.ts`: 10/10, zero falhas/skips.
- `npm run typecheck`: passou.
- `npm test`: 81/81, zero falhas/skips.
- npm emitiu aviso preexistente de configuração de ambiente `http-proxy`; Node emite aviso experimental SQLite. Não houve falha associada.

Reviews independentes do mesmo snapshot `c4433b7e4ee763aa41811b75c4b8f3750659d0396b9d718fc07787fca33f98b6`, executados sequencialmente por limite de concorrência e sem compartilhar pareceres:

- Standards: zero violações documentadas e zero heurísticas acionáveis. Reexecutou núcleo/typecheck e confirmou o hash do diff e a ausência de mudanças nos módulos compartilhados.
- Spec: zero requisitos ausentes, escopo extra ou erros no núcleo delimitado. Reproduziu os 126 pixels das fixtures Decimal, os 61 hashes do worker imutável e um probe escalar de 343 combinações T/M/EV × 256 níveis, sem divergência/mutação. Derivou os pesos Y a partir das cromaticidades sRGB/D65.

Depois dos pareceres, types, suíte completa e diff-check foram executados novamente antes do commit local. Os relatórios não validam integração/percepção e não permitem reconstruir a ordem temporal do TDD apenas a partir do diff.

## Limites

O módulo ainda não é importado pelo produto. Estes resultados comprovam a seam pura, não a entrega de balanço de branco no aplicativo. Electron/ICC/EXIF/pacote/UI/persistência/hash original não foram executados nesta preparação; são gates da integração descrita no [contrato](../../docs-agents/issue-17-core-integration.md). Windows/macOS e inspeção visual/nativa não foram verificados. Nenhuma redução de RAM, performance 8 GB ou fidelidade profissional é alegada.
