# Issue #14 — resultados do spike RawTherapee CLI

## Resultado

**Continuar investigação delimitada; motor definitivo não escolhido.** RawTherapee 5.13 Windows x86_64 converteu uma fixture Nikon D200/NEF CC0 em JPEG visualizável, preservando o SHA-256 do original. Duas execuções sequenciais levaram 1,987 s e 1,807 s, com pico de working set próximo de 494 MB. Isso demonstra somente esta câmera/amostra, não todas as famílias RAW ou o alvo de 8 GB.

Não houve integração ao Revelumo, dependência de produto, alteração de catálogo/IPC/receita/segurança ou teste de outro OS. Observamos uma armadilha relevante: saída existente é pulada com exit code zero. JPEG completo também varia com EXIF DateTime mesmo quando o codestream é igual. Uma adaptação futura precisa tratar ambos explicitamente.

## Base, ambiente e autorização

Base inicial `5aa6693d05bbfea1c538a9360c84ee69ce195a68`, branch `spike/14-rawtherapee-cli`, checkout isolado de #12. Instruções AGENTS, Matt implement/tdd/code-review e ADRs 0001/0003 consultadas. Sem mudança de produto: experimentos observam CLI/filesystem reais; typecheck/suíte do aplicativo não demonstrariam estes resultados.

Windows 11 Pro for Workstations `10.0.26200`, x64, i7-12700H (14 cores/20 lógicos), RAM reportada 33.961.971.712 bytes. Não é validação em 8 GB ou de GPU. [Ambiente](environment.json).

Licença e instalação foram autorizadas. A instalação retornou 0, mas criou desinstalador HKLM em modo administrativo, diferente da condição inicial sem admin. O trabalho parou, reportou o efeito e só retomou após aceite explícito da responsável para manter a instalação e continuar. PATH preservado, App Paths HKCU, sem associações nos caminhos examinados nem atalhos no log; nenhuma alteração adicional de sistema. Ver [checkpoint histórico](installation-checkpoint.md) e [preparação](preparation-report.md). Bloqueio de instalação resolvido por coordenação, não ocultado.

## Proveniência e componente

[Release oficial 5.13](https://rawtherapee.com/downloads/5.13/), [pacote Windows x86_64](https://github.com/RawTherapee/RawTherapee/releases/download/5.13/RawTherapee_5.13_win64_x86_64_release.exe). Download 47.304.123 bytes; hash local igual ao publicado: `d27df7ebde717c5efa114338a4b1cf1c426a439e5a1a92e142e87868cbe45383`. Build instalado identifica commit `1924179107995b01b73cdc7f4fe91e44fc8227a7`, CLI 5.13, SHA `9172a03896f0200daf621909b024f6cd65a24837cad56d0748730b2fa6d2fb6a`.

Instalação: 1.352 arquivos, **232.224.849 bytes lógicos**, incluindo desinstalador; não tamanho alocado em disco ou RAM. Inventário real: 81 DLLs na raiz, 18 arquivos de notices em licenses. Isso não é auditoria jurídica completa nem relação um-para-um. [Nomes/hashes/build](package-inventory.json).

Fixture raw.pixls.us ID 8079: Nikon D200, NEF `12bit compressed (Lossy (type 1)) (3:2)`, 10,21 MP no catálogo, 08/06/2025. [Arquivo](https://raw.pixls.us/getfile.php/8079/nice/Nikon%20-%20D200%20-%2012bit%20compressed%20(Lossy%20(type%201))%20(3%3A2).nef), [catálogo](https://raw.pixls.us/json/getrepository.php). Entrada **CC0 individual** preservada no [manifesto](manifest.json). [CC0](https://creativecommons.org/publicdomain/zero/1.0/) não garante direitos de imagem/patentes/marca; cena inspecionada é paisagem com animais, sem pessoas aparentes. Nenhuma foto pessoal usada.

NEF 8.949.599 bytes; SHA-256 publicado/baixado e antes/depois das conversões/erros: **`b0800a1166b952430b255600373573e1d528adf8de98857781e06a98472b3c35`**. Não surgiram PP3 ao lado do original. Só derivadas, cópia truncada e settings foram escritos em `../experiment/raw14/`; catálogo e originais preservados.

## Reprodução

PowerShell 7, CLI instalada/aprovada e fixture com hash acima; usar pasta nova:

```powershell
./evidence/rawtherapee-cli-windows/run-spike.ps1 -Cli '../experiment/raw14/RawTherapee-5.13/rawtherapee-cli.exe' -Fixture '../experiment/raw14/nikon-d200.nef' -Experiment '../experiment/raw14/run-01'
```

Segundo ensaio troca somente `run-01` por `run-02`. [Runner](run-spike.ps1) recusa diretório existente/hash divergente; usa OMP_NUM_THREADS=2, RT_SETTINGS/RT_CACHE próprios e timeout de 180 s. Não instala nem aceita termos. Comando efetivo:

```text
rawtherapee-cli.exe -o <experimento>/derivative.jpg -j92 -js3 -c <fixture>/nikon-d200.nef
```

Qualidade 92, 8-bit, chroma 4:4:4. `-o` obrigatório evita saída ao lado do original; `-c` no fim. Sem `-Y` (overwrite), `-d` (preferências mutáveis) ou `-s/-S` (sidecar). Sem perfil extra, a [fonte CLI fixa](https://github.com/RawTherapee/RawTherapee/blob/1924179107995b01b73cdc7f4fe91e44fc8227a7/rtgui/main-cli.cc) define parâmetros neutros. Preferências isoladas geradas iguais nas duas execuções: SHA `ed1c00b2fc5637778fb429d8cd574c942baf61ad3ebf021aea2ff68dd51acccc`. Não são parâmetros de futura receita Revelumo.

## Visual, cor e repetição

JPEG `../experiment/raw14/run-01/derivative.jpg`: **3891×2608**, 2.418.846 bytes, SHA `31c8032aa8c82d99038271133f15faf3d440d9d6b45f2ab52a5b89d1a2978337`. Decodificado com System.Drawing e inspecionado como imagem local: paisagem reconhecível, sem rotação inesperada, corrupção ou canais obviamente deslocados. Mais escuro/contrastado que preview da câmera; não equivalência estética/colorimétrica.

Preview embutido 3872×2592, copiado sem alterar bytes do NEF (offset TIFF absoluto 179712, comprimento 1107857). EXIF RAW declara 3904×2616; dimensões diferem da derivada. Não concluir política geral de crop. Fixture `top, left`; não comprova retrato/outras orientações, X-Trans ou variantes NEF.

ICC da derivada: 748 bytes, igual **byte a byte** ao `iccprofiles/output/RTv4_sRGB.icc` instalado; descrição RTv4_sRGB, SHA `17aebbdf8a88c39b07eb881dcd824eb1cf9828914d5e74a7324d7a31045e8871`. Nikon EXIF do original declara Adobe RGB, sem provar perfil aplicado ao RAW. Tag 274 de orientação ausente na derivada, pixels horizontais esperados. Sem monitor calibrado, color target, ΔE ou prova de gamut/highlights. [Metadados](derivative-metadata.json).

run-02: mesmo tamanho, SHA `014409f70fe3b7e730c4aa1ddf0bbb44ed1d05415ff833f51fb0bcabf41e7521`. Só cinco bytes diferem, no EXIF DateTime da conversão; fluxo desde SOS (offset 1560) idêntico, SHA `cb6d0b63145228fb183d89bcc247b51de46d4167f469a9c3efda1c8a2124f2d9`. **Arquivo inteiro não determinístico entre horários**; não regravamos/normalizamos JPEG para esconder isso. [Comparação](repeatability.json).

## Recursos e retenção

| Ensaio sequencial | Wall-clock | Pico working set | Máximo private bytes amostrado |
| --- | --- | --- | --- |
| run-01 | 1.987 ms | 493.969.408 bytes | 475.586.560 bytes |
| run-02 | 1.807 ms | 494.030.848 bytes | 475.717.632 bytes |

17 amostras no primeiro ensaio, aproximadamente 100 ms. Pico working set fornecido pelo Windows; private bytes é máximo amostrado e pode perder picos. Working set inclui páginas compartilhadas: **não RAM física exclusiva**, sem soma de RSS ou medição GPU. Tempo inclui startup/conversão/exit, exclui instalação/download/hash/inspeção. Dois ensaios não são benchmark estatístico; caches/concorrência de outras frentes não controlados.

Última amostra run-01: WS 370.638.848 / private 351.502.336 bytes, cerca de 38 ms antes do término, sem voltar ao startup. Ambos processos encerraram; consultas por nome após ensaios e erros retornaram zero RawTherapee. Settings persistentes: um arquivo de 8361 bytes por ensaio; nenhum diretório cache observado. Não é leak test prolongado, auditoria de filhos/handles ou retenção do futuro aplicativo. [Amostras](runs/run-01/result.json), [resumo](run-summary.json).

## Falhas demonstradas

```powershell
./evidence/rawtherapee-cli-windows/run-errors.ps1 -Cli '../experiment/raw14/RawTherapee-5.13/rawtherapee-cli.exe' -Fixture '../experiment/raw14/nikon-d200.nef' -ExistingOutput '../experiment/raw14/run-01/derivative.jpg' -Experiment '../experiment/raw14/errors-01'
```

| Caso sequencial | Código | Mensagem/efeito |
| --- | --- | --- |
| Entrada ausente | 2 | doesn't exist; nenhuma saída |
| Cópia truncada a 1024 bytes | -2 | Error loading file; nenhuma saída |
| Saída existente sem -Y | **0** | already exists / skipped; SHA da saída existente preservado |
| Pai da saída é arquivo regular | -2 | Error saving to; nenhuma saída |

Tempos 190/180/177/1543 ms; nenhum timeout. Último caso demonstra erro filesystem sem alterar ACL/segurança, não disco cheio/permissões Windows. Códigos negativos são os observados por Process.ExitCode. Código zero isolado não comprova conversão. O runner positivo exige pasta nova, saída presente e original preservado; stderr/decodificação continuam necessários em futura adaptação. [Logs/comandos](errors.json).

## Offline, licença e plataformas

Conversões executadas sob rede restrita do ambiente, sem solicitar download/credenciais/serviço remoto. Evidência de processamento local observado, **não teste com adaptador desconectado nem captura de sockets**. Não mudamos firewall/rede/segurança; offline completo continua QA futura.

[GPLv3 oficial](https://github.com/RawTherapee/RawTherapee/blob/1924179107995b01b73cdc7f4fe91e44fc8227a7/LICENSE); programa GPL-3.0-or-later e [notices de terceiros](https://github.com/RawTherapee/RawTherapee/blob/1924179107995b01b73cdc7f4fe91e44fc8227a7/licenses/README). Runtime contém GTK/gtkmm, Lensfun, LibRaw/dcraw, codecs e perfis; build informa gtkmm 3.24.10, Lensfun 0.3.4.0, libjxl 0.12.0 e OpenMP. Redistribuição requer notices/fonte correspondente; não presumir compatibilidade de bundling com licença pendente do Revelumo nem que separar processos resolve obrigações jurídicas. Não incluímos binários, fotos, ICC ou dumps EXIF no repositório/PR; hashes/roteiro permitem reprodução local.

Só Windows x86_64 foi executado. Releases oferecem Windows ARM64, Linux AppImage/pacotes x86_64/ARM64 e macOS (App em `/Applications`, CLI opcional); **não testados**. Não medimos seus tamanhos nem comprovamos assinatura/notarização, bundle Electron ou 8 GB. Inventário/QA por OS ainda necessários.

## Próxima fatia

Investigar amostras CC0 individuais de outras famílias RAW e retrato/orientação; cor/crop, cancelamento/timeout e offline real, sempre sequencialmente/com recursos limitados. Definir perfil/recipe/versionamento e tratamento de skip/EXIF variável antes de desenhar integração. JPEG embutido serve como alternativa de navegação, não revelação RAW; LibRaw é leitor, não pipeline completo; outros desenvolvedores locais exigem spikes próprios. Nenhum foi eleito ou comparado em benchmark.

[Verificações](verification.txt), [revisões](review.md). Limites restantes são cobertura/QA, sem autorização de instalação pendente neste experimento. CI do produto não valida RawTherapee ou outros OS.
