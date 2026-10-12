# Integração local #12 + #13

Fontes preservadas: #12 `affd452e5030ab7067813741a052dfbe476a3bae` no checkout `task-4/revelumo`; #13 `94833f5ec8593fd2b67ea03cd35edda014150e9c` no checkout `task-7/revelumo`. Ambos limpos/ref intacta, conferidos com Git sem locks opcionais. Novo checkout independente: `task-7/revelumo-integration`, branch `integration/issues-12-13`, base comum `5aa6693`. Nenhum arquivo das fontes foi alterado.

## Conflitos e resolução

Aplicados #12 primeiro e #13 depois. Sete arquivos tiveram conflitos textuais:

- `.gitignore` e `package.json`: união das pastas isoladas e dos scripts exposure/filters.
- `library.ts`: união dos tipos e dos métodos públicos, sem modificar session/revision/serialização de exposição.
- `requests.ts`: união do discriminador e validação estrita de query com exposure/end-edit/close-ready existentes.
- `App.tsx`: `leave` confirma/retira a sessão antes de `resetViewer` disparar consulta filtrada. Falha de flush mantém foto/rascunho. Foco preserva `refreshSelectedStatus`, em vez de recriar editor. Importar desde a prévia mantém o fluxo #12: flush → grade → seletor, preservando o filtro #13. Filtros ficam bloqueados durante saída.
- `electron-classification.cjs`: helper aguarda grade pronta após flush/consulta; readiness usa canvas #12.
- `electron-smoke.cjs`: allowlist de bridge contém operações dos dois contratos.

Catalog/main/preload/contracts/CSS e relocation-test combinaram automaticamente; também foram examinados. Schema-v5, ExposureEditor, worker, recipe e scheduler não mudaram em relação a #12.

O teste de filtros foi adaptado de img para canvas e legenda sRGB. Cenários cruzados confirmam que classificar conserva o rascunho, falha de exposição impede saída mesmo quando a foto já não corresponde ao filtro, retry salva antes de atualizar a grade e importação faz flush de 1,7 EV mantendo filtro/aviso de ocultos.

## Revisão e TDD de integração

Standards: zero violações e nenhum novo smell; duplicação baixa de bootstrap previamente aceita. Spec encontrou P2: resposta atrasada da consulta de retorno apagava feedback de importação cancelada/falha. Reproduzido RED pelo IPC público (`delayed navigation query preserves import outcome feedback`, false ≠ true), corrigido apenas nesta integração: consulta não apaga mensagens gerais; importação inicia sem aviso anterior. GREEN passou para cancelamento e erro com resposta retida. Re-review Spec: P2 resolvido, zero novos achados. Fontes de ambas revisões: AGENTS, ADRs1–4 e contratos versionados das issues. Agentes somente leitura.

## Verificação

Windows x64, Node24.19/npm12/Electron44.7. 71 testes Node, 68 aprovados, três skips de plataforma (symlink/FIFO), zero falhas; typecheck e pacote passaram. Electron oculto: exposure first/reopen/interrupt/reopen/discard-race/reopen/race/race-reopen, filtros first/reopen, grade first/reopen, classificação first/reopen, relocalização first/reopen, disponibilidade e recursos prepare/measure. Recursos usam48 JPEGs sintéticos36 MP,60 mudanças e10 ciclos; não comprovam alvo8 GB. Originais preservados, isolamento/sandbox mantidos, sem redefinir export BrowserWindow e sem erro modal.

Verificação final do commit preparado para publicação registrada em `task-7/integration-final-verification.json`, com comandos/exits/timestamps/SHA; logs e resultados em `.test-temp/final-<sha>/`. Evidências anteriores das issues permanecem históricas, não prova do SHA combinado. O runner reexecuta tudo depois do commit/pacote final.

CI recebe apenas o teste Windows filters first/reopen, incluindo cenários cruzados exposição/filtros e feedback atrasado, com resultado no summary. CI adicional completo de exposição continua sob coordenação do pai.

## Ordem e publicação

#12 primeiro, #13 sobre main já integrada. PR20 foi confirmado merged em `72761181cf3036244c863783881da8f1a8838c6d`; sua árvore é igual à fonte `affd452`, sem alteração alheia a sobrepor. A branch de publicação será preparada no checkout novo sobre main remota revalidada, usando somente o delta #13+resolução. Commit/patch de integração fica local; fontes permanecem intactas. Push/PR rascunho autorizado depois da confirmação #12, sem merge remoto de #13 nesta etapa.

Linux/macOS, inspeção visual/humana, seletor nativo, leitor de tela/teclado físico e alvo8 GB não verificados. QA Windows nativa de outra issue permanece pendente.
