# Exposição: digitação por teclado

Contrato: [issue #12](https://github.com/glaucia86/revelumo/issues/12), “Ajustar exposição JPEG com autosave e recuperar ao reabrir”. Base inicial verificada: `6078f1fd9a592d485f2c76f804a6942f85796381`.

## Causa e fronteiras

O campo numérico controlado recebe o valor canônico formatado a cada render. O handler rejeita estados intermediários, como sinal negativo e separador decimal, impedindo completar números válidos pelo teclado. Testes anteriores atribuíram números completos a `.value`, sem simular a edição por caracteres.

Fronteiras públicas já aprovadas na issue: entrada/slider e estados visíveis do renderer Chromium empacotado, prévia canvas, receita lida pela API preload e persistência real SQLite. Fixtures são sintéticas. Eventos CDP de teclado exercitam edição nativa, sem invocar handlers React diretamente. Isso não substitui inspeção visual nem teclado físico.

## Fatias

1. RED em Electron real: selecionar todo o campo e digitar `-` seguido de `1`; demonstrar falha da retenção de sinal antes de mudar produto.
2. Preservar texto de edição separado do último EV válido, sem enviar estados incompletos/fora da faixa/passos inválidos ao preview ou autosave. Normalizar ao sair do campo; slider e reset atualizam texto e valor.
3. Exercitar decimais por caracteres, inválidos e blur, valores-limite, slider/reset, pendência/confirmação atrasada e flush; rodar regressões existentes.
4. Revisões independentes Standards e Spec; QA visual Electron na máquina cloud, typecheck, suíte completa, pacote e integração/CI do SHA final antes de merge coordenado.

Sem novo motor, biblioteca de inputs, ajuste fotográfico ou alteração da fronteira IPC. Windows/Ubuntu CI serão registrados separadamente do QA cloud Linux. A pendência nativa Windows da issue #4 não é encerrada por esta correção.
