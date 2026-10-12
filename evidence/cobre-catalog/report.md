# Catálogo Cobre — issue #29 (draft)

Base: `54a2881c66fd46da7656d84730b0154b13529875`. A composição Cobre escolhida foi adaptada ao catálogo real. Sem dados simulados, alteração de processamento ou novos contratos IPC. Fontes e ícones locais. O editor mantém seus controles; sua aplicação visual completa pertence à #31.

## Verificado neste ponto

- Baseline e estado atual: 84/84 testes Node, typecheck e pacote Linux.
- TDD no Electron empacotado: cabeçalho/estado vazio RED→GREEN; foco perdido ao voltar por teclado RED→GREEN.
- Teste `test:cobre-catalog`: 0, 1 e 49 fotos, 48 por página, importação parcial, original ausente, filtro sem resultado, consulta pendente/falha/retry, foto original byte a byte preservada.
- Capturas reais em 760×540, 1180×757 e 1440×900; regiões roláveis, sem overflow horizontal, textos testados >=12px e preferência de movimento reduzido.

## Ainda em verificação

Duas revisões independentes, regressões completas de importação/relocalização/classificação/exposição e CI no SHA final. Capturas automáticas usam fixture sintética. Teclado foi enviado pelo motor Chromium do Electron oculto; não equivale a leitor de tela ou teste físico em todos os sistemas. macOS não testado. Diálogo de arquivo é substituído somente na fronteira do harness.
