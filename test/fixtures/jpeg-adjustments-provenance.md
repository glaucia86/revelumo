# Oráculos do núcleo JPEG: balanço de branco e exposição

Estas fixtures são entradas fixas dos testes. Não são produzidas pela função testada e não são regeneradas pelo CI. Não dependem de JPEG pessoal, serviços, rede ou bibliotecas novas.

## Matemática de cor

`jpeg-adjustments-reference.json` contém 14 receitas, cada uma com nove pixels RGBA: preto, limiar da curva, cinza, cores, luz alta, primárias saturadas e branco. Os controles cobrem ±100, combinações, passo 1 e valores interiores; EV cobre −3, −1, +1, +3 e valores intermediários.

`python3 test/generate-jpeg-adjustments-fixtures.py` reproduz o arquivo com Python Decimal em 60 dígitos, avaliação escalar por canal e arredondamento decimal half-up. Não importa nem executa o código TypeScript. O produto usa números IEEE-754 e LUTs. As asserções consomem valores literais congelados, com igualdade exata dos bytes. Um acordo entre os dois algoritmos não é validação perceptual independente do operador escolhido.

A curva sRGB e a linha Y racional vêm do [código de conversão do CSS Color 4, versão 2026-10-09](https://www.w3.org/TR/2026/CRD-css-color-4-20261009/#color-conversion-code). O operador relativo de ganhos e sua intensidade são escolhas de engenharia do Revelumo, não uma transformação padronizada de balanço de branco nem equivalência a Kelvin/RAW/Adobe. A normalização mantém o Y de cinza neutro antes de clipping e quantização; não mantém a luminância de qualquer cor.

Exemplos fixados, todos com cinza RGB (128,128,128), EV 0:

| Temperatura | Matiz | RGB esperado |
| ---: | ---: | --- |
| +100 | 0 | (146,124,106) |
| −100 | 0 | (111,130,152) |
| 0 | +100 | (143,122,143) |
| 0 | −100 | (113,133,113) |

Clipping único: RGB (255,200,180), T=+100, M=+100, EV=−1 resulta em (234,134,120). Limitar após WB, antes do EV negativo, perderia informação e daria outro resultado. O alpha permanece exato.

## Compatibilidade com exposição existente

`exposure-compatibility-reference.json` congela o SHA-256 de cada saída do worker anterior: commit `8b8aa98921760945b5d708f0f481b34d1423a314`, `src/renderer/exposure.worker.ts`. São 61 EVs canônicos (−30…30 décimos), 256 pixels com todos os níveis possíveis em cada canal e alpha variável. A identidade em zero e o resultado conhecido 128→176 a +1 EV também têm asserções legíveis.

`node test/generate-exposure-compatibility-fixture.cjs` extrai somente o bloco de renderização daquele commit imutável e o executa sem importar o novo módulo. Requer que o objeto Git histórico esteja disponível; é ferramenta offline de auditoria, não etapa de teste/CI/produto. Os hashes verificam compatibilidade exata com o comportamento publicado, não a verdade colorimétrica desse comportamento.

## Sensibilidade e limites

Seis mutações temporárias separadas foram detectadas pela suíte: clipping antes da exposição, sinais invertidos de temperatura/matiz, retirada da normalização, gamma incorreto e alteração do alpha. Todas foram revertidas antes da verificação final.

Estes testes observam a fronteira de pixels já sRGB. Decoder, ICC, EXIF, orientação, redução, worker real, sessões, revisões, UI, persistência e hashes dos JPEGs exigem a fatia vertical de integração. Nenhuma tolerância adicional do Electron é inferida destes testes exatos.

## Integração decoder com WB

`white-balance-decoder-reference.json` é reproduzido pelo mesmo gerador Decimal offline. Compõe o baseline independente LittleCMS já congelado em `exposure-color-reference.json` com T=100/M=100/EV=−1. No Electron real, sRGB e Display-P3 são comparados com tolerância de quatro unidades codificadas, separada da igualdade exata do núcleo. As primárias/quadrantes com oito EXIF usam tolerância seis para JPEG/decoder e transformação, além de ordem e dimensões exatas. Esses limites não certificam fidelidade perceptual; reset WB+EV exige recuperar exatamente a mesma base decodificada, sem tolerância/acumulação.
