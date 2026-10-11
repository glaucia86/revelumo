# Segunda fatia: lote JPEG e grade

Extensão do fluxo JPEG/SQLite já aprovado. Execução local autorizada; nenhum push, merge ou release. Base 6899ee3. Preservar capa README e limites de 32 MiB/40 MP. Fora: RAW, edição, exportação, relocalização, estrelas e promessa de 8 GB.

## Desenho
- Seleção nativa múltipla; uma fila serial limita leitura/decodificação. Cada arquivo termina antes do próximo, com oportunidade de processar eventos entre itens.
- Importações válidas são confirmadas individualmente no SQLite. Falhas trazem nome do arquivo e motivo; fechar encerra o trabalho pendente e preserva o já confirmado. Dedupe por realpath reutiliza referência.
- Miniaturas JPEG até 256 px no lado maior, derivadas e limitadas em tamanho, em tabela de cache SQLite. Migração v1→v2 transacional preserva referências. Cache faltante é regenerado sob demanda; original nunca é escrito.
- Grade paginada (48 itens) para limitar miniaturas residentes; carregamento serial. Selecionar item abre preview original com EXIF/ICC preservados. Voltar à grade permanece possível durante lote.
- IPC aceita somente operações nomeadas, identificadores UUID e consulta de progresso, sem caminhos livres. Progresso por consulta evita eventos privilegiados expostos ao renderer.

## Implementação e evidência
1. TDD catálogo/serviço: migration+cache persistente; lote misto, dedupe via symlink, progresso, serialização, interrupção/reabertura e integridade. RED registrado antes do código; GREEN suíte completa.
2. TDD helpers thumbnail/IPC: orientação EXIF 1–8, limites e rejeição de payload livre. Adaptador Electron mantém decodificação de uma imagem por vez; não introduzir dependências.
3. TDD comportamento renderer via estado/helpers onde útil, então integração UI: seleção múltipla, resumo de erros, paginação, progresso e retorno grade/preview. Verificação Electron real é necessária e separada da suíte de núcleo.
4. Typecheck + suíte + Forge package; E2E Linux com seleção nativa lote misto, grade/preview, cancelar, reimportar, fechar/reabrir e interromper lote. Hashes e screenshots. Revisão independente do diff; corrigir achados importantes com RED/GREEN.

## Foco da revisão
Migração interrompida; cache ausente/erro; original ausente; requests concorrentes; callbacks após fechamento; arquivos especiais; orientação e correspondência entre thumbnail/preview. Nenhuma afirmação de memória/responsividade no alvo 8 GB sem medição própria.

## Registro
- 22:50 UTC: repo e contratos inspecionados, desenho confirmado dentro do escopo aprovado. Miniaturas em SQLite escolhidas para atomicidade com o registro; custo de reversão é remover/regenerar cache e manter referências.
- 22:58 UTC: TDD catálogo/lote/thumbnail/IPC/paginação: 39 testes passaram; revisão independente reproduziu dois P2 (cancelamento enquanto aguardava fila e EXIF com bytes FF de preenchimento). Regressões falharam primeiro e ambas as correções passaram; suíte completa agora 42/42. Typecheck passou. Sem mudança de escopo.
- Limites adiados: cache corrompido não é automaticamente regenerado; alterações externas do original não invalidam cache até reimportação. O cache ausente é regenerado. Fotografias reais/cor e target 8 GB continuam pendentes.

- 23:05 UTC: E2E Linux concluído: lote misto, cancelar, dedupe, grade/preview, lote de 300 arquivos, paginação, reinício e interrupção real com oito itens persistidos. 603 hashes conferidos. Relatório em evidence/batch-jpeg/report.md. Sem promessa de benchmark em 8 GB.
