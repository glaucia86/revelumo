# Issue #14 — registro histórico da preparação RawTherapee CLI

**Atualização após autorização:** licença/instalação autorizadas e instalador executado; o log revelou modo administrativo e uma chave de desinstalação HKLM, diferentes da autorização sem admin. Execução da CLI interrompida antes da conversão. Ver [checkpoint de instalação](installation-checkpoint.md). As seções abaixo preservam o estado da preparação anterior à autorização; o bloqueio atual é a diferença de efeitos da instalação, não falta de aceite.

## Registro histórico: preparação anterior à autorização

Todas as seções seguintes descrevem a preparação inicial, antes da autorização e execução de instalação. Para o estado atual, efeitos e tamanho instalado, consultar `installation-checkpoint.md`.

### Resultado e bloqueio naquele momento

**Investigar/continuar após autorização específica; motor não escolhido.** Pesquisa e preparação local concluídas em 12/10/2026. Conversão RAW não executada: não havia CLI instalada, e a restrição recebida proíbe aceitar novas licenças sem confirmação. O instalador oficial usa `LicenseFile=...LICENSE` (fonte `WindowsInnoSetup.iss.in:50`). A confirmação foi solicitada nesta sessão e não recebida até o registro. Isso não é proibição geral de instalar: uma alternativa de extração portátil oficial foi submetida ao reviewer, autorizada e testada, mas não suportou o pacote. Não executar instalação silenciosa sem o aceite humano exigido.

Não há derivação, inspeção visual do resultado, tempo de conversão, pico/retenção de memória, tamanho instalado, falha da CLI ou comprovação offline. Esses critérios permanecem **pendentes**; não encerrar a issue como satisfeita. O relatório serve para retomar o experimento delimitado.

## Base, isolamento e ambiente

Checkout independente `task-5/revelumo`, branch `spike/14-rawtherapee-cli`, base/HEAD inicial `5aa6693d05bbfea1c538a9360c84ee69ce195a68`, idêntica ao baseline da issue e ao `main` clonado. Issue completa lida pelo conector GitHub, sem comentários. Instruções consultadas: AGENTS, tracker, Matt workflow, skills oficiais implement/tdd/code-review, contexto e ADRs 0001/0003. Não houve alteração de produto, dependência, catálogo, IPC, receita, segurança ou checkout da #12. TDD de produto/typecheck/suíte não se aplicam a esta entrega de investigação sem modificação do aplicativo.

Windows 11 Pro for Workstations `10.0.26200`, 64 bits; i7-12700H, 14 cores/20 processadores lógicos; RAM reportada pelo SO 33.961.971.712 bytes. Ver `environment.json`. Não é validação do alvo de 8 GB nem de GPU. Sem desktop/UI, serviços pagos, secrets, instalação global ou execução de instalador. Rede foi autorizada pelo runtime para clone/downloads; CIM somente leitura também exigiu elevação do ambiente. Nenhuma rejeição de auto-review ocorreu.

Arquivos volumosos ficam fora do checkout, em `../experiment/raw14/`: instalador, fixture, catálogo e fontes. Não versionar/distribuir binários nem fotos. No checkout há apenas relatório, hashes, registros curtos e roteiro. Nenhum processamento pesado ou lote foi iniciado.

## Proveniência e original

Uma única fixture: raw.pixls.us ID **8079**, Nikon D200, NEF, `12bit compressed (Lossy (type 1)) (3:2)`, 10,21 MP no catálogo, entrada de 08/06/2025. [Catálogo original](https://raw.pixls.us/json/getrepository.php), [arquivo](https://raw.pixls.us/getfile.php/8079/nice/Nikon%20-%20D200%20-%2012bit%20compressed%20(Lossy%20(type%201))%20(3%3A2).nef). A linha individual CC0 está preservada em `manifest.json`, com URL, formato e hash publicado. Não usar entradas antigas BY-NC-SA como se fossem CC0.

8.949.599 bytes. SHA-256 baixado, hash publicado e hash recalculado ao fim da preparação: `b0800a1166b952430b255600373573e1d528adf8de98857781e06a98472b3c35`. Igualdade comprova preservação durante a preparação, **não** antes/depois de conversão ainda inexistente. Nenhuma foto pessoal foi fornecida. Conteúdo visual da fixture não inspecionado; antes do processamento/uso visual, confirmar cena e ausência de pessoas. Não publicar metadados pessoais do dump EXIF.

[CC0](https://creativecommons.org/publicdomain/zero/1.0/) permite copiar e modificar sem pedir permissão de copyright; não garante direitos de imagem, patentes, marcas ou proveniência. A licença foi verificada por entrada, não presumida para o repositório inteiro.

## Componente e documentação oficial

[Release oficial 5.13](https://rawtherapee.com/downloads/5.13/), publicada em 26/07/2026. Windows x86_64: [pacote](https://github.com/RawTherapee/RawTherapee/releases/download/5.13/RawTherapee_5.13_win64_x86_64_release.exe), 47.304.123 bytes (45,11 MiB), SHA-256 `d27df7ebde717c5efa114338a4b1cf1c426a439e5a1a92e142e87868cbe45383`, igual ao publicado. É **tamanho do download**, não instalado. 7-Zip 26.02 já disponível não reconheceu o instalador como arquivo extraível (`archive-inspection.txt`).

Após checkpoint de coordenação, foi investigado o [innoextract oficial](https://constexpr.org/innoextract/), ZIP portátil 1.9, sem instalação/diálogo de aceite e sem execução do setup. Licença zlib/libpng e notices Boost/liblzma/libstdc++ com runtime exception inspecionados no ZIP; não distribuídos nem integrados. Fonte HTTPS do autor, MD5 igual ao publicado (`72d0d0dd874b6236eaa44411f4470ee1`); SHA-256 local `6989342c9b026a00a72a38f23b62a8e6a22cc5de69805cf47d68ac2fec993065`. MD5 não é prova criptográfica forte; assinatura OpenPGP não verificada. Reviewer autorizou download e execução limitada `innoextract.exe -l <instalador>`. Resultado reproduzido: código **2**, loader revision 2 inesperada, loader checksum mismatch, setup data version indeterminada (`innoextract-list.txt`). Não extraiu CLI. O hash do pacote RawTherapee segue igual ao oficial; o aviso do extrator não prova corrupção. Não compilar versão adicional nem reduzir proteção para prosseguir.

Menor próximo passo suportado: autorização humana específica para aceite GPLv3 exibido pelo instalador e instalação experimental Windows 5.13, usando o pacote oficial já validado; depois submeter execução à política/reviewer. Instalar para usuário/destino experimental, sem tarefas de associação de arquivos/context menu/ícones nem iniciar GUI. A fonte prevê `PrivilegesRequired=none`, mas instalação pode registrar desinstalador e App Paths HKCU; não prometer uma instalação sem efeitos fora da pasta. Uma CLI previamente aprovada/disponibilizada com dependências completas também desbloqueia o runner sem novo aceite de setup.

Fontes da tag 5.13 resolvidas em `1924179107995b01b73cdc7f4fe91e44fc8227a7`: [CLI](https://github.com/RawTherapee/RawTherapee/blob/1924179107995b01b73cdc7f4fe91e44fc8227a7/rtgui/main-cli.cc), [opções](https://github.com/RawTherapee/RawTherapee/blob/1924179107995b01b73cdc7f4fe91e44fc8227a7/rtgui/options.cc), [instalador](https://github.com/RawTherapee/RawTherapee/blob/1924179107995b01b73cdc7f4fe91e44fc8227a7/tools/win/InnoSetup/WindowsInnoSetup.iss.in). Hashes de downloads em `manifest.json`. RawPedia retornou 404 nesta consulta; o roteiro foi conferido contra o código oficial, não contra documentação presumida.

O release documenta LibRaw customizado com fallback para dcraw aprimorado e suporte variável por câmera. A lista de câmeras adicionadas não demonstra compatibilidade de toda câmera/formato nem deste NEF. Nenhum formato foi testado aqui.

## Reprodução depois da autorização

Instalação deve ser realizada separadamente, após aprovação explícita, com o pacote/hash acima; inspecionar tarefas, destino, licenças e eventual escrita em registro/atalhos. O runner não instala nem aceita termos. Usar PowerShell 7, CLI oficial aprovada e uma pasta nova:

```powershell
./evidence/rawtherapee-cli-windows/run-spike.ps1 -Cli '<instalação aprovada>/rawtherapee-cli.exe' -Fixture '../experiment/raw14/nikon-d200.nef' -Experiment '../experiment/raw14/run-01'
```

Comando candidato, conferido em `main-cli.cc:513-571`, **não executado**:

```text
rawtherapee-cli.exe -o <experimento>/derivative.jpg -j92 -js3 -c <fixture>/nikon-d200.nef
```

`-o` é obrigatório para evitar saída ao lado do original; `-c` vem no fim; JPEG qualidade 92, sem subamostragem cromática (`-js3`). Não usar `-Y` (sobrescrita), `-d` (preferências mutáveis) ou `-s/-S` (sidecar). Sem essas opções, a fonte descreve parâmetros neutros. Ainda requer fixar/verificar perfil ICC, demosaicing e valores efetivos da versão executada; neutral não significa fidelidade colorimétrica.

O runner recusa fixture com hash diferente e diretório existente, limita OpenMP a duas threads, direciona RT_SETTINGS/RT_CACHE ao experimento, registra stdout/stderr/exit code, hash original antes/depois, tamanho/hash derivado, tempo wall-clock e working set/private bytes amostrados a 100 ms. Timeout de 180 s encerra a árvore do processo. Foi validada sintaxe e gate sem engine; a rota de conversão/medição permanece **não testada**. As threads auxiliares não são garantidas por OMP_NUM_THREADS.

Após execução: inspecionar JPEG visualmente; conferir dimensões/orientação em relação ao preview do NEF, ICC/EXIF e perfil de saída; registrar screenshot/derivação sem metadados pessoais. Rodar erros separadamente e sequencialmente: entrada ausente, cópia truncada no experimento, saída existente e destino não gravável. Guardar mensagens/exit codes e não inferir sucesso só de código zero. Não truncar/modificar a fixture original.

Medir pico de working set e private bytes por processo, tempo e tamanho instalado incluindo DLLs/perfis/licenças. Amostragem pode perder picos; working set inclui páginas compartilhadas e não equivale a RAM física exclusiva. Não somar RSS como consumo exclusivo. Após saída, verificar processos filhos/remanescentes e arquivos de cache; duração do processo não demonstra ausência de retenção no futuro aplicativo. Uma execução não é benchmark estatístico. Offline deve ser testado com rede indisponível por mecanismo autorizado, sem alterar firewall/segurança nesta issue.

## Licença, dependências e empacotamento

[LICENSE oficial](https://github.com/RawTherapee/RawTherapee/blob/1924179107995b01b73cdc7f4fe91e44fc8227a7/LICENSE) contém GPLv3; [inventário oficial](https://github.com/RawTherapee/RawTherapee/blob/1924179107995b01b73cdc7f4fe91e44fc8227a7/licenses/README) identifica o programa como GPL-3.0-or-later e componentes com LGPL/GPL. A GPL §9 não exige aceitação para mera execução; isso não revoga a restrição humana explícita nem autoriza aceitar o instalador. Redistribuição exige preservar notices/licenças e cumprir fornecimento de fonte correspondente (§§4–6). Não escolher licença do Revelumo (pendente), presumir compatibilidade de integração ou decidir que separar processos elimina obrigações. Revisão jurídica/política do modelo de distribuição é pendência, não parecer desta investigação.

Documentalmente: runtime envolve LibRaw/dcraw, GTK/gtkmm, Lensfun, codecs, gerenciamento de cor e outras bibliotecas. O release registra fmt, GTK >=3.24.3, custom LibRaw, JPEG XL condicional, alternativas SVG/SIMDe. O instalador inclui DLLs e pasta licenses; não presumir que só copiar CLI.exe basta. Inventário completo do pacote efetivamente instalado e suas licenças ainda não feito.

| Sistema | Caminho documentado | Evidência desta sessão |
| --- | --- | --- |
| Windows x86_64 | Instalador oficial; fonte prevê CLI e licenças, privilégios `none` | Download/hash/inspeção; execução pendente |
| Windows ARM64 | Download oficial específico | Não baixado/testado |
| Linux x86_64/ARM64 | Gerenciador de pacotes ou AppImage oficial | Não baixado/testado; versões/dependências variam |
| macOS | App em `/Applications`, CLI opcional no PATH; mínimos variam por arquitetura | Não baixado/testado; instalação fora de Applications não é caminho prometido |

Todos esses caminhos precisam de QA nativa própria; não prometem bundle com Electron, assinatura, notarização ou execução em máquinas de 8 GB. Funcionamento offline é plausível por processamento local, mas **não comprovado**.

## Próxima fatia e alternativas

Autorizar ou recusar instalação experimental; se aprovada, executar uma fixture por vez e fechar pendências de conversão, visual, erros, memória e offline. Só depois ampliar para RAW Bayer, X-Trans, compressões e retrato/orientações diferentes, com fixtures licenciadas individuais e teto de recursos. Investigar diferenças entre versão/perfil e resposta em cancelamento/timeout antes de qualquer desenho de integração.

Alternativas futuras: preview JPEG embutido para visualização rápida (não equivale a revelação RAW), LibRaw/dcraw como leitores (não substituem todo pipeline de cor), outros desenvolvedores RAW locais em spikes separados. Não foram avaliados aqui. A recomendação de continuar investigação depende da aprovação e da qualidade/recursos medidos; nenhum motor foi eleito.
