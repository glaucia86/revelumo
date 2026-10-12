# Revisões independentes — Catálogo Cobre

Snapshot: `9f40a288573f4ea95d8744e014c8cb1a0ef01c35...7cb92b96ec16577a8b006655f786bce9c5f4a5d0`. Eixos revisados separadamente por dois agentes, sem alteração do checkout.

## Spec

- Bloqueador: fonte Geist empacotada sem texto OFL. Corrigido em RED→GREEN com teste de presença e igualdade do aviso completo dentro de app.asar. A licença está em `public/licenses/Geist-OFL.txt`; Vite copia esse arquivo para o pacote, sem alterar main/preload ou permissões.
- Refinamento adiado: o fallback de foco `.query-error button, h1` segue a ordem documental e escolhe o título antes do retry. O botão continua alcançável por teclado. Não impede recuperação nem muda o gate de saída.
- Evidência: este relatório e os resultados foram reconciliados com main/WB e os testes finais, em vez de conservar a descrição preliminar de 84 testes.
- Nenhum mock, leitura automática adicional, alteração de contratos ou escape de `leave` identificado. Layout e fotografia inteira nas capturas 760×540 e 1180×757 coerentes com o estudo aprovado.

## Standards

- P1: smokes antigos tratavam o primeiro botão do header como importação. O novo Catálogo mudou essa posição. Corrigidos os seletores de importação pelo nome visível, sem mudar suas asserções funcionais. RED: importação nunca começava; GREEN: importação/reabertura, relocalização e classificação passaram. Seletor equivalente corrigido no benchmark de recursos, cuja execução pesada não foi repetida.
- P2: teste novo aguardava `canvas.dataset.revision`, detalhe interno. Agora espera a prévia com papel/nome acessível e controles de edição prontos; o botão de importação também é localizado pelo nome, não pela posição. Teste completo reexecutado após a refatoração.
- Heurística adiada: possível duplicação do adaptador de janela oculta em relação a `test/hidden-electron.cjs`. Não é violação obrigatória; extração permanece para manutenção do harness.

As revisões não são uma auditoria independente de acessibilidade assistiva nem comprovação de suporte macOS.
