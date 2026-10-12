# Catálogo Cobre — issue #29

Base de integração: `524a06a55bb23ce8a3522695117c03e34b0b32a1`, incluindo WB/PR #28 e documentação/MIT/PR #34. A composição A Cobre escolhida foi adaptada ao catálogo real. Sem dados simulados, alteração de processamento ou novos contratos IPC. Fonte e ícones locais. O editor mantém seus controles; a aplicação visual completa do editor pertence à #31.

## Resultado local — Linux, Electron 44.7.0

- `npm test`: 118/118, nenhum skip, incluindo 18 verificações documentais. `npm run check:docs`, `npm run typecheck`, `npm run package` e `git diff --check` passaram.
- TDD no Electron empacotado: cabeçalho/estado vazio RED→GREEN; retorno de foco à mesma foto por teclado RED→GREEN; contador a 760 px RED→GREEN; licença completa no pacote RED→GREEN.
- `npm run test:cobre-catalog -- <pasta nova>`: 0, 1 e 49 fotos, 48 por página, importação parcial, original ausente, filtro sem resultado, consulta pendente/falha/retry, foto original byte a byte preservada, cópia integral da licença Geist em app.asar.
- 39 execuções dos harnesses existentes passaram: importação e reabertura (2), relocalização e reabertura (2), disponibilidade (1), filtros e reabertura (2), exposição/rascunho/navegação/reabertura (6), classificação/reabertura (2), histórico (12) e WB (12). Detalhes em `regressions.json`.
- Os smokes antigos agora localizam Importar JPEGs pelo nome, em vez de assumir que é o primeiro botão do header. Suas asserções funcionais foram preservadas. O benchmark de recursos recebeu somente a mesma correção de seletor; não foi executado novamente.
- Capturas do renderer empacotado em 760×540, 1180×757 e 1440×900. Regiões roláveis, sem overflow horizontal, textos testados >=12px, foco visível, imagens com object-fit contain e preferência de movimento reduzido. O harness salva as três capturas na pasta informada.
- Também foram inspecionadas as mesmas oito fotos licenciadas usadas no estudo Cobre, efetivamente importadas no produto. Nenhuma dessas fotografias entrou nos assets de runtime.
- Contrastes em `contrast.json`: texto principal 16,17:1; secundário 9,84:1; discreto 7,01:1; botão Cobre 9,08:1; borda de controle 4,42:1; foco Cobre/fundo 9,92:1; borda de navegação ativa 3,42:1. Esses pares não constituem certificação abrangente de acessibilidade.

## Revisões e limites

Duas revisões independentes, Spec e Standards, registradas separadamente em `code-review.md`. Bloqueadores de licença empacotada e seletores legados foram corrigidos; o teste novo usa prévia e controles por nome/papel acessível em vez do marcador interno de revisão.

Refinamentos adiados: fallback de foco escolhe o título antes do botão de retry; duplicação do adaptador de janela oculta no harness. Ambos preservam o comportamento funcional e o acesso por teclado.

Os testes usam filesystem/SQLite, preload/IPC, worker e canvas reais. Diálogos nativos são substituídos na fronteira; as janelas de regressão ficam ocultas. Teclado é enviado pelo motor Chromium; não equivale a leitor de tela, teclado físico ou validação de todos os sistemas. Não houve teste macOS nem repetição do benchmark pesado de recursos. Windows/Ubuntu dependem do CI do SHA final do PR; não declarar esse gate aprovado com base no resultado local. Nenhum instalador/release foi criado.

## Fotografias da conferência visual

[Pexels License](https://www.pexels.com/legal-pages/license/), verificada no estudo; atribuição opcional, mantida aqui para proveniência. Fotos de Leo Castro (19151778), Vivi Pascar (28384491), Henrik Le-Botos (23522919), Murad Murat (13720189), Mostafa Ft.shots (14425523), Jess Loiterton (4321815), Juan Gomez (12597242) e Dante Muñoz (17488413). As capturas comparáveis preservam essas imagens, sem mudança para exagerar o impacto do visual.
