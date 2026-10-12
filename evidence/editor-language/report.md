# Tradução do editor existente — issue #32

Base inicial: `ab4c6965c63d68da512b32b144d487bc2735ea7c`; reconciliada por fast-forward com `0065ee156cf2e24b03fde11cb172d11368e7f983` (PR #39 documental). Data: 12/10/2026.

## Escopo desta fatia

Exposição e seus estados de leitura/salvamento, histórico/Undo/Redo, comparação com 0 EV, WB relativo (sem Kelvin), classificação/estrelas/flags, disponibilidade/identidade/relocalização, preview e saída/recuperação. Recorte (#18) e exportação ainda não existem nesta base; esta entrega não fecha o escopo completo da #32. O limite de 100 passos do domínio não foi alterado e não ganhou UI nova. Cobre do editor (#31) permanece independente.

Descritores tipados no Library, IPC e worker são traduzidos ao renderizar. Frases legacy ficam no domínio para compatibilidade, nunca são comparadas para escolher tradução. Não há mudança em dados, identidade, receita, algoritmo, migração, parser numérico, permissões ou dependências. O contexto não entra nas keys ou dependências dos efeitos do editor; a sessão e os nós DOM permanecem os mesmos.

## TDD e interfaces públicas

- Editor Electron empacotado: RED com `Exposição em EV` em inglês; GREEN com `Exposure in EV`. Próxima fatia: RED com `Estrelas`, GREEN com `Stars` e retorno à grade traduzido.
- Library com arquivos/SQLite reais: falhas de salvar/histórico, classificação/receita, presença/ausência/legado, relocalização/identidade e preview tiveram RED por descritor ausente e GREEN após adição. Worker foi testado pela porta pública com falha de decodificação.
- Regressão do catálogo identificou uma expectativa antiga de `Salvo` após trocar para espanhol; corrigida para `Guardado`, mantendo a mesma verificação de persistência.
- Fronteiras substituídas nos smokes: idioma do SO, diálogo de arquivo e entrega/falha de respostas IPC. Renderer, preload, worker, SQLite, arquivos e sandbox são reais. Falhas injetadas carregam texto bruto sentinela que não pode aparecer na tela.

## Verificação local Linux

- Node 24; `npm run typecheck`, `npm test` (155 aprovados, nenhum skip), `npm run check:docs`, `git diff --check` e `npm run package` aprovados.
- Regressões Electron aprovadas: catálogo idiomas first/reopen, Cobre, filtros first/reopen, importação/grade first/reopen, relocalização first/reopen, disponibilidade first, exposição first/reopen, WB first/reopen, histórico first/reopen.
- Novo `test:editor-language`: PT/EN/ES nos rótulos/aria/status, plurais de estrelas, teclado CDP Chromium com `-` e `1.` atravessando troca de contexto sem blur forçado, continuação decimal canônica e WB incompleto. Sem formatação Intl em value; nenhum suporte universal a vírgula foi adicionado ou alegado.
- Save e Undo em voo reexibem resposta na língua ativa, sem nova sessão ou operação duplicada. Redo continua disponível após troca; novo ramo elimina Redo; Undo conserva WB. Frame antigo do worker não sobrescreve preview mais novo.
- Erros de save/history/classificação já visíveis, retry, permanecer, descartar e saída normal preservam os contratos. Fechamento nativo durante save aguarda flush mesmo com troca de idioma. Arquivo relocalizado mantém UUID, classificação, receita e SHA-256.
- Capturas reais inspecionadas em [EN](editor-en.png), [PT-BR](editor-pt-BR.png) e [ES](editor-es.png), com fixture sintética já versionada. Janela mínima 760×540 não tem overflow horizontal; o painel de ajustes mantém sua rolagem e o reset WB é alcançável. Capturas principais são 1180×812 (dimensão externa).

## Revisões independentes

Standards: zero achados. Spec: uma omissão menor na tradução do erro de salvar foi corrigida com teste RED→GREEN; as três mensagens agora preservam a informação de que o último ajuste confirmado permanece salvo e permitem tentar novamente. Revisão final considera a fatia parcial, sem declarar recorte/exportação completos.

## CI e limites

O workflow existente acrescenta `test:editor-language` ao gate Windows, mantendo Ubuntu para core/typecheck/package. A execução final e os SHAs ficam no PR/run; este relatório local não afirma que Windows já passou. Não houve execução macOS, teclado físico, leitor de tela ou diálogo nativo real. CDP não prova todos os formatos de entrada aceitos por todos os navegadores/SOs. Textos do sistema operacional podem continuar no idioma do SO.

Originais usados são sintéticos. Package é desenvolvimento local, sem instalador, release ou promessa de suporte integral. Nenhuma configuração de segurança foi desabilitada.
