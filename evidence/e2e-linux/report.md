# Primeira fatia JPEG: teste no Electron Linux real

Data: 11/10/2026, 22:39–22:44 UTC. Ambiente: desktop Linux cloud, x64. Aplicativo gerado por Electron Forge 8.0.1, Electron 44.7.0. Comando executado no terminal gráfico: `./out/Revelumo-linux-x64/Revelumo`. Não foram usadas flags para desabilitar sandbox ou proteções. A identidade visual existente foi preservada.

## Resultados observados

1. A janela abriu com catálogo vazio: [01-empty.jpg](01-empty.jpg).
2. Abrir o seletor nativo e cancelar manteve zero registros e controles ativos: [02-cancel.jpg](02-cancel.jpg).
3. Navegar por cliques até a fixture EXIF 6 e confirmar Open criou uma referência e exibiu a fotografia. A matriz colorida girou 90° no sentido horário conforme a orientação: [03-exif6.jpg](03-exif6.jpg).
4. Reimportar o mesmo arquivo manteve apenas um registro, sem duplicata.
5. Selecionar `qa-invalid.jpg`, cujo conteúdo não é JPEG, mostrou erro compreensível e não acrescentou registro: [04-invalid.jpg](04-invalid.jpg).
6. Importar a fixture EXIF 8 em outra operação exibiu a rotação de 90° no sentido anti-horário: [05-exif8.jpg](05-exif8.jpg). Isto não testa importação em lote.
7. Renomear externamente a fixture 8, selecionar novamente e abrir a prévia mostrou arquivo ausente, preservando as duas referências: [06-missing.jpg](06-missing.jpg). A fixture foi restaurada ao mesmo nome após o teste, sem alteração dos bytes.
8. Fechar a janela encerrou o processo Linux: a janela desapareceu do inventário e o terminal retornou ao prompt: [07-closed.jpg](07-closed.jpg).
9. Executar o binário novamente abriu as duas referências persistidas: [08-reopened-list.jpg](08-reopened-list.jpg). Clicar na foto 8 voltou a exibir sua prévia: [09-reopened-preview.jpg](09-reopened-preview.jpg).
10. SHA256 de todas as fixtures importadas comparado antes/depois: idêntico. Veja [original-integrity.json](original-integrity.json).

O banco real SQLite do aplicativo participou desse fluxo, incluindo encerramento e abertura de um processo novo. O teste não substituiu o diálogo por mocks nem populou o catálogo fora do aplicativo.

## Observações e limites

- TypeScript e build passaram; 25 testes automatizados do núcleo passaram em Node. Este roteiro gráfico foi executado por ações de mouse/teclado no desktop, não é ainda uma suíte E2E automatizada reutilizável.
- O seletor foi validado por navegação/cliques e botão Open. Duas tentativas de digitar caminho absoluto e pressionar Enter pela automação CUA fecharam o seletor sem importar; não houve diagnóstico de defeito do aplicativo. Esse caminho de teclado exige reprodução adicional.
- O terminal emitiu avisos sobre o barramento DBus ausente, sem impedir o fluxo acima.
- `npm start` não foi executado com sucesso no terminal gráfico, onde npm não está no PATH. O teste foi do pacote produzido, não do servidor de desenvolvimento.
- As fixtures são sintéticas (matriz 360 × 240 com EXIF 6/8), sem dados pessoais. Isto não estabelece fidelidade de cor, compatibilidade abrangente de câmeras ou desempenho em 8 GB.
- Windows, macOS, instaladores, assinatura/notarização e distribuição continuam pendentes. Não houve release ou alteração remota.

Captura adicional somente da janela, sem recorte/edição posterior: [10-app-window.jpg](10-app-window.jpg). Mostra a foto novamente aberta após o reinício real.
