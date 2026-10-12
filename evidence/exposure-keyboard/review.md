# Revisões independentes

WIP efetivo de `src/renderer/ExposureEditor.tsx`, `test/electron-exposure.cjs` e ADR 0004 contra `6078f1fd9a592d485f2c76f804a6942f85796381`, também conferido contra `d4f224503610b9d7b4cd8e0e4fe2a635bacd0253`. Revisores separados, sem modificar o código nem duplicar a execução do harness.

## Standards

Aprovado, 0 achados. Texto transitório separado do EV válido, sem mudanças no contrato IPC/persistência. Slider, redefinição e blur sincronizam o campo conforme ADR. Testes usam as interfaces autorizadas de teclado Chromium, DOM/canvas e preload real, sem mocks de colaboradores internos. Nenhuma violação documentada ou cheiro relevante identificado. A observação inicial sobre Ctrl+A no macOS foi retirada: o harness já documenta macOS como não suportado, portanto não é regressão deste diff.

## Spec

Aprovado, 0 achados. Entrada por teclado preserva sinal/separador; inválidos não alteram draft, revisão ou prévia; faixa ±3 EV/passo 0,1 permanecem protegidos. Persistência e confirmação continuam condicionadas à revisão canônica, flush usa último valor válido. Foco/refresh não reformatam texto nem recriam sessão. Nenhuma funcionalidade adicional identificada.

As revisões são estáticas e não substituem QA/CI. Total: Standards 0; Spec 0.
