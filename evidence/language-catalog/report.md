# Idioma persistente e catálogo — issue #30

Data: 12/10/2026. Base: `d2fba23b7dcf4c094ea50f0475a2484daf58a53f`. Escopo: catálogo, importação, filtros/paginação, shell, preferência/boot. Tradução do editor, classificação dentro da prévia, relocalização dentro do editor e exportação continua separada. Não há suporte trilíngue integral nesta entrega.

## Contrato e arquitetura

- `system | pt-BR | en | es` em `preferences.json` no userData do aplicativo, schema 1. Renderer não escolhe caminhos nem acessa filesystem. Nenhuma migração SQLite ou alteração do conteúdo das fotos.
- Após Electron ready, a lista ordenada de idiomas do SO resolve a primeira base pt/en/es; variantes Linux normalizadas. Ausência de suporte/erro resolve inglês. Escolha explícita vence; `system` é conservado e redetectado no próximo processo.
- Escrita serializada em temporário exclusivo e rename, confirmação somente depois do rename. Falha preserva a escolha confirmada. Arquivo futuro, ilegível ou maior que 4 KiB não é sobrescrito; perfil usa fallback com aviso. Arquivo v1 inválido pode ser reparado por escolha explícita. Arquivo somente leitura pode ser reavaliado após reparo externo.
- Abertura não bloqueante e rejeição de arquivos não regulares evitam travar o boot com FIFO. Leitura limitada a 4 KiB mais um byte de detecção de excesso.
- IPC próprio `revelumo:preferences`, payloads exatos, mesmo gate de webContents/mainFrame/documento do catálogo. `window.revelumoPreferences` expõe apenas getLanguage/setLanguage.
- Dicionários locais, discriminated union de mensagens/parâmetros, Intl para números/plurais, fallback inglês por chave conhecida e frase genérica segura para descritor inválido. Testes de tipos estão incluídos no typecheck; testes de paridade cobrem chaves e parâmetros de cada variante.
- Provider não remonta App/editor, não usa locale em key e não formata rascunhos numéricos. Locale não é dependência dos efeitos de consulta, preview ou save. Mensagens de catálogo existentes mudam de idioma sem refazer a operação.

## TDD e revisão

Resolução de locale; persistência em outro processo; corrupção/futuro; falha de rename e retry; validação/serialização; preferência ilegível/oversized; retry após reparo; FIFO; descritores de falha do catálogo; dicionários e fallback tiveram RED/GREEN nas interfaces públicas. Electron baseline sem feature falhou pela ausência do seletor; a integração passou depois. Novos cenários de conservação de estado reforçam a regressão no pacote real.

Revisões independentes Spec e Standards consideraram arquivos novos e diff contra a base. Dois problemas foram corrigidos com regressões: proteção insuficiente de arquivo futuro ilegível/oversized e abertura bloqueante de FIFO. Revisão Standards final confirmou zero bugs runtime pendentes. As ligações do smoke ao package.json/CI e documentação foram adicionadas conforme os apontamentos.

## Verificação local Linux

- `npm test`: 144/144 aprovados, zero skips no Linux; `npm run typecheck`, `npm run check:docs` e `git diff --check` aprovados.
- `npm run package` aprovado com o cache local suportado por `electron_config_cache`; nenhuma nova dependência.
- Electron idiomas: `first`, `reopen`, `system-first`, `system-reopen`, `fallback`, `os-error`, `boot-error`, `corrupt`, `future`, `oversized` aprovados. O primeiro modo cobre 49 JPEGs + falha individual, troca no progresso real de 50/50 antes da confirmação, 48 itens/página, filtro persistido, erro já visível, confirmação perdida/retry e falha real de rename/retry. Rascunhos de teclado “-” e “1.” sobrevivem à troca sem novo begin-edit; save em voo confirma 1.2 EV depois da troca. Hashes dos 49 originais intactos.
- Regressões Electron: Cobre; filtros first/reopen; lote/grade first/reopen; relocalização first/reopen; disponibilidade first; exposição first/reopen; WB first/reopen aprovados. Smokes antigos fixam idioma do SO português e os dois erros injetados do filtro fornecem descritores tipados; asserções de comportamento permanecem.
- Capturas inspecionadas na janela mínima 760×540: [EN](catalog-en.png), [ES](catalog-es.png), [PT-BR](catalog-pt-BR.png). Sem overflow horizontal do documento; cabeçalho, foco, seletor e grade preservados. Fotografias são as fixtures sintéticas locais do teste, sem fotos pessoais.

Os testes usam apenas JPEGs sintéticos já versionados, perfis temporários separados e hashes de originais. A execução gráfica usa o desktop cloud autorizado; o namespace restrito de shell não permite o socket singleton do Electron. Não foram usados `--no-sandbox`, novas permissões ou configuração de segurança modificada.

## Limites

- Capturas e inspeção local em Linux na janela mínima; não equivalem a revisão com leitor de tela ou teclado físico.
- SO/diálogo nativo são fronteiras substituídas no harness. Textos fornecidos pelo SO podem continuar no idioma do sistema.
- Windows depende do resultado de CI no commit final. macOS não executado.
- Nenhum teste de recorte, exportação, instalador, release, RAW ou suporte integral multiplataforma foi reivindicado.
