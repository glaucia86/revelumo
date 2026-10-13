# Verificação da fatia parcial #55

## Restrições e desvios registrados

O ambiente local não tem cota efetiva cgroup conhecida. Cargas 20/40 MP e fronteira de 32 MiB permanecem suspensas. Somente fixtures pequenas e capacidades artificiais reduzidas são autorizadas para esta verificação.

Ocorreram dois desvios de execução em 13/10/2026, reportados imediatamente à coordenação:

1. O implementador iniciou `npm test` sem o filtro obrigatório. Interrompeu a sessão com SIGINT (exit130) ao conferir o conjunto efetivo. O log preservado [unfiltered-interrupted.txt](attempts/unfiltered-interrupted.txt) registra que `bounds original input bytes independently...` chegou a executar/passou. A tentativa foi interrompida e **não é uma suíte completa aprovada**.
2. A segunda execução da verificação do renderer iniciou `npm test`, que terminou 346/346, porque a instrução dessa verificação omitiu explicitamente as duas exclusões obrigatórias. O log [unfiltered-worker.txt](attempts/unfiltered-worker.txt) confirma execução de ambas as fronteiras suspensas: `bounds original input bytes independently...` e `oversized JPEG is rejected...`. O resultado passou, mas a execução violou a restrição local e **não é usada como evidência autorizada de aprovação**.

Causa: comando amplo indevido do implementador e propagação insuficiente da restrição para a segunda verificação. Não houve novo corpus gráfico 20/40MP. Depois dos relatos, a segunda verificação confirmou não ter processos ativos; sessões próprias de testes/package encerradas e terminal gráfico voltou ao prompt. A restrição literal e o comando permitido foram enviados a todas as verificações e revisões, que devem confirmar recebimento antes de qualquer nova execução. Revisores fazem análise estática.

Comando local abrangente permitido, sem scripts que invoquem npm test:

```sh
node --test --test-concurrency=1 --test-skip-pattern='bounds original input bytes independently|oversized JPEG is rejected' test/*.test.ts
```

CI Windows/Ubuntu mantém os gates existentes em seus próprios runners; a restrição de carga é do ambiente local sem cota conhecida.

## TDD e testes focados

- PreviewIpc público + Library/FS/SQLite reais: RED recusa com capacidade1 retornava sucesso; GREEN gate antes de Buffer.alloc. RED envelope entregue liberava cedo; GREEN reserva até receipt. Regressões: ACK velho/duplicado, invalidação, falha de decoder, cardinalidade, encerramento de owner, saves/end-edit sem esperar e recusa antes da alocação.
- Preload real com fronteira Electron substituída: RED releasePreview inexistente; GREEN replay de ACK perdido antes da próxima prévia.
- PreviewSource: RED release local ausente, RED release pós-take precoce, RED callback de falha escapando; GREEN consumo/descarte separado e idempotente.
- Worker: RED input ainda no envelope durante decode; GREEN apagar referência e separar frame que prepara entrada. Decodificação/canvas nativos substituídos só no teste unitário; pacote usa o Worker real.
- Electron empacotado, fixture sample 633 B: RED real em `terminated Worker releases its reservation`, preservado em [lifecycle-red.txt](attempts/lifecycle-red.txt). A correção passa a chamar terminate antes de consumed e consumed após ready.

## Resultado final local

- [Suíte serial filtrada](core-filtered.txt): 349 testes passaram; os dois padrões suspensos foram excluídos (Node não os soma como testes skipped nesse modo).
- Typecheck, documentação local, diff whitespace e [package](package.txt): passaram.
- [Retirement determinístico](retirement-green.txt): 10/10. Getter main-only somente leitura observa 1267 antes/depois de retire enquanto decode continua, e 0 somente após sucesso/erro efetivamente encerrado. Não há acesso IPC ao diagnóstico.
- Lifecycle empacotado: cinco leases, cinco receipts exatos, zero Workers vivos ao final.
- Admissão empacotada first/reopen: cota 1351, JPEGs 633/675 B, recusa/retry em PT-BR/EN/ES; mesma sessão; ACK perdido recuperado; UUID/hash/receita/Undo/Redo preservados. Capturas e viewport 760×540 verificados por idioma.
- Regressões empacotadas: preview-queue, preview-memory, smoke e relocation first/reopen; availability isolado. Resultados individuais estão em [runs](runs/).

A primeira tentativa do launcher availability criou antecipadamente o diretório que o harness exige inexistente. O harness falhou no preflight antes de carregar o produto; a execução ficou no diálogo de erro Electron e foi encerrada apenas em seu próprio terminal. Esse caso acabou mostrando exit0 sem resultado, **não é aprovação**. O log `runs/availability-first.txt` e a linha original em status foram preservados; a repetição correta usa diretório inexistente e valida explicitamente `result.json` com ok=true (`availability retry VERIFIED_EXIT=0`). Os 12 resultados JSON foram lidos e validados separadamente; a coleção completa contém 12 execuções aprovadas (inclui availability repetido, exclui sua tentativa inválida).

Os avisos D-Bus são do ambiente Linux; o erro IPC de lost release acknowledgement é uma falha sintética intencional do cenário de recuperação. Nenhuma flag de sandbox, permissão SUID, sysctl ou DISPLAY foi alterada.

A [proveniência](provenance.json) registra base, SHA-256 de cada arquivo de produto e do ASAR testado. Estes resultados locais foram executados sobre o WIP acima de c0dbb6a; não fingem ter sido produzidos a partir de um SHA futuro. CI Windows/Ubuntu verificará o commit publicado/ref de merge correspondente.

## Revisões independentes

Standards: dois P2 de integração de harnesses antigos (whitelist IPC e devolução de leases entre fases) corrigidos; releitura sem novos bloqueadores.

Spec: integração dos novos harnesses no CI e observação direta do débito durante retire/settle corrigidas; releitura sem novos bloqueadores, aprovação limitada ao contrato parcial. Ambas as revisões foram estáticas e não executaram cargas locais.

