# Checkpoint após autorização de instalação — #14

## Resultado atual

Instalador oficial RawTherapee 5.13 executado após autorização explícita da responsável para GPLv3 e instalação experimental limitada. Exit code 0; arquivos no destino aprovado. **Interrompido antes de executar a CLI**, conforme instrução de parar se efeitos reais fossem materialmente diferentes: log registra modo administrativo e chave nova de desinstalação **HKLM**, embora autorização exigisse sem admin. Não foi realizada desinstalação nem alteração manual de registro para esconder/corrigir o efeito. Nenhuma rejeição de auto-review ocorreu; o reviewer autorizou a execução solicitada.

O PowerShell verificou `WindowsPrincipal.IsInRole(Administrator) = false` antes de `Start-Process`; manifesto do instalador contém `requestedExecutionLevel=asInvoker`. Mesmo assim, o processo de setup registra `User privileges: Administrative`, `Administrative install mode: Yes` e `Install mode root key: HKEY_LOCAL_MACHINE`. A causa da diferença entre token/privilégios/modo não foi determinada. Não afirmar que a configuração documentada garante instalação sem efeitos administrativos neste ambiente.

## Comando efetivamente usado

Executável oficial e SHA já registrados no manifesto. Nenhuma licença comercial adicional foi aceita. Somente o aceite GPLv3 autorizado foi permitido pelo modo não interativo; a licença instalada tem o mesmo texto da oficial após normalização de CRLF/LF (SHA de bytes diferente).

```text
RawTherapee_5.13_win64_x86_64_release.exe /SP- /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /NOICONS /TASKS="userinstall" /DIR="C:\Users\glauc\Documents\Codex\2026-10-12\task-5\experiment\raw14\RawTherapee-5.13" /LOG="C:\Users\glauc\Documents\Codex\2026-10-12\task-5\experiment\raw14\install.log" /NOCLOSEAPPLICATIONS /NORESTARTAPPLICATIONS
```

`Start-Process -WindowStyle Hidden -Wait -PassThru`; sem desktop/UI. Tentativa anterior parou na enumeração lenta de atalhos OneDrive, antes do setup, sem log ou destino criado. Essa enumeração foi interrompida; a segunda tentativa substituiu-a por leitura do log de instalação.

## Efeitos medidos

- Destino: `../experiment/raw14/RawTherapee-5.13`, 1.352 arquivos, **232.224.849 bytes lógicos** incluindo desinstalador. Não é tamanho alocado em disco nem memória.
- PATH do processo, usuário e máquina: comparação antes/depois **iguais**.
- Associações/context menus RawTherapee de arquivo/pasta: ausentes antes/depois nos caminhos HKCU examinados; nenhuma entrada de associação consta no log. Não é auditoria de todo registro.
- HKCU App Paths para `rawtherapee.exe` e `rawtherapee-cli.exe`: criados e apontam ao destino experimental, conforme autorização.
- **HKLM** `Software\Microsoft\Windows\CurrentVersion\Uninstall\RawTherapee5.13_is1`: criada, confirmada no log e leitura real. DisplayVersion 5.13; UninstallString aponta ao `unins000.exe` experimental. HKCU equivalente ausente.
- Log não contém criação de atalhos; `/NOICONS` e tarefa única `userinstall` aplicadas. Não enumerar Desktop OneDrive foi uma limitação consciente; ausência de atalhos é sustentada pelo log, não por uma busca completa do filesystem.
- Log registra sucesso e nenhum reinício necessário. Nenhum processo RawTherapee permaneceu na consulta após instalação; engine/GUI não foram lançados.

Evidências: `installation-effects.json`, `installed-files-summary.json`, `install-log-excerpt.txt`. Log completo e snapshot anterior contendo PATH ficam locais fora do repo em `../experiment/raw14`, sem publicar configuração do usuário.

## Original e fixture

NEF permanece SHA-256 `b0800a1166b952430b255600373573e1d528adf8de98857781e06a98472b3c35`, igual antes/depois da instalação. Ainda não houve conversão RAW.

Preview JPEG embutido copiado sem alterar bytes: offset TIFF absoluto 179712, comprimento 1107857, conforme dump EXIF do fornecedor. Inspecionado visualmente via leitura de imagem local: paisagem de colinas/pastagens/árvores e animais, sem pessoas aparentes. Orientação visual horizontal coerente com `top, left` do EXIF. É **preview da câmera**, não derivação produzida por RawTherapee nem teste de cor do engine. O EXIF reporta espaço Nikon Adobe RGB; isso não comprova ICC do preview ou pipeline de saída.

## Pendência para coordenação

Informar o efeito HKLM e obter decisão explícita antes de engine/desinstalação/novo setup. Opções a avaliar por leitura: desinstalar o pacote experimental (o desinstalador pode exigir admin) e reinstalar em modo comprovadamente não administrativo, ou aceitar os efeitos identificados e autorizar prosseguir com a CLI existente. Não executar `/CURRENTUSER` sem verificar se o binário suporta a opção; a documentação Inno diz que depende de `PrivilegesRequiredOverridesAllowed`, ausente da fonte do projeto consultada. Não editar HKLM manualmente nem repetir instalação por tentativa.

Conversão, derivação, medições de tempo/memória/retenção, erros e offline continuam pendentes. Outros OS/arquiteturas não testados. Sem integração/publicação ou eleição do motor.
