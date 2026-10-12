# Implementação issue a issue: Matt Pocock

Preparação solicitada pela responsável em 12/10/2026. Fluxo oficial materializado somente neste projeto; nenhuma instalação global ou personalização existente foi alterada. A responsável aprovou depois a política SHA-256 e autorizou executar somente a issue #4 com este fluxo. Este documento registra a preparação, sem afirmar que a feature já esteja implementada.

## Fonte e instalação

- Origem: [mattpocock/skills](https://github.com/mattpocock/skills), revisão imutável `49dd158d1076134a641b33efb035946536778336`.
- Instaladas em `.agents/skills`: [implement](../.agents/skills/implement/SKILL.md), [tdd](../.agents/skills/tdd/SKILL.md) e [code-review](../.agents/skills/code-review/SKILL.md).
- Lidos integralmente os três `SKILL.md`, os complementos TDD [tests.md](../.agents/skills/tdd/tests.md)/[mocking.md](../.agents/skills/tdd/mocking.md) e os três `agents/openai.yaml` oficiais. Nenhum conteúdo das skills foi adaptado. `implement` declara invocação explícita; não deve ser disparada automaticamente por palavras-chave.
- O instalador oficial já disponível do Codex foi usado com `--dest <projeto>/.agents/skills`, `--ref <SHA>` e os três paths específicos. Só oito arquivos oficiais foram materializados. Nenhum script do repositório remoto foi executado.
- Os oito blobs foram comparados com a árvore GitHub da revisão fixa e são idênticos. SHA-256 local e blob Git de cada arquivo estão na [proveniência](mattpocock-skills-provenance.json). [Licença MIT preservada](mattpocock-skills-LICENSE.txt). Atributos locais de Git preservam LF nas cópias oficiais.
- Inventário inspecionado: 64 skills do executor e 92 do catálogo cloud. O catálogo inicial incluía `tdd`, `to-tickets`, `to-spec`, grills e `wayfinder` pessoais, mas não a dupla oficial `implement`/`code-review`. A existência dessas skills pessoais não foi tratada como prova de origem/revisão oficial; elas não foram sobrescritas. As novas cópias são de projeto e podem ser lidas diretamente; descoberta automática depende do próximo turno do runtime, não é instalação global de plugin.
- Download e criação da branch foram autorizados pelo runtime; não houve rejeição de aprovação ou pedido humano adicional de instalação. Omitimos `setup-matt-pocock-skills`: tracker e destino documental já estão configurados em `AGENTS.md`/`docs-agents`, e nenhuma triagem/label nova é necessária para esta preparação.

## Base preservada

- `main` remoto foi confirmado em `9fcef67b61df6ae77678b0eff7185ead1e7cec2f` no início da execução Windows; PR #1 integrado. Antes de iniciar a feature, revalidar `main` e o ticket, sem inferir autorização para merge.
- `b82e1f2c69d1e6324d6b56d01500c2c1ae765895` é o commit local separado de correções do review/Windows, sem relocalização. Foi preservado integralmente, sem amend adicional, reset ou publicação.
- Esta preparação está na branch local `chore/matt-pocock-workflow`, criada a partir de `b82e1f2`. A branch `feat/locate-missing-originals` continua apontando para `b82e1f2`.
- A feature #4 parte do commit de preparação e seu diff/revisão serão comparados com essa base, para não atribuir correções Windows e instalação de skills à relocalização. `b82e1f2` permanece a base funcional explícita; nenhuma alteração do comportamento foi feita no commit de preparação.

## Ticket lido e anunciado

[Issue #4 — Relocalizar uma foto movida sem perder seu registro](https://github.com/glaucia86/revelumo/issues/4), estado aberto, lida pelo conector GitHub. A decisão posterior aprovada exige SHA-256 igual; legado ganha hash somente enquanto o original está acessível, e legado já ausente/sem hash não pode ser religado. A alternativa é nova importação sem substituir o registro anterior. Nenhuma reimportação pode substituir silenciosamente hash existente. A issue foi atualizada explicitamente com essa decisão e estado em andamento, sem fechar. #2/#3 são histórico já concluído; #5 (estrelas/flags) fica fora desta janela.

## Execução depois da coordenação

1. Revalidar base e issue #4; anunciar novamente seu título ao iniciar a implementação. Consultar [issue-tracker.md](issue-tracker.md), os ADRs de catálogo/IPC e lote e o estado atual, sem carregar todo o repositório.
2. Registrar somente a política de identidade efetivamente aprovada. Confirmar as interfaces públicas sob teste antes do primeiro teste novo; chamar a cópia oficial `tdd` e usar seus complementos.
3. Fazer fatias verticais: um teste de comportamento vermelho, implementação mínima, verde; repetir. Não escrever todos os testes primeiro nem refatorar durante o ciclo. Usar filesystem/SQLite reais e fixtures sintéticas; substituições somente nas fronteiras externas necessárias, declarando o que deixam sem comprovação.
4. Executar testes focados e typecheck regularmente; suíte completa ao fim. Verificar migração, preservação dos dados e integridade/reinício segundo a decisão aprovada. Registrar Windows e Linux separadamente e os limites atuais do seletor/captura nativos.
5. Chamar `code-review`: fixar a base de preparação e spec #4, obter diff real da feature, fontes de padrões e dois agentes independentes em paralelo (`Standards` e `Spec`). Manter os relatórios separados, corrigir achados e reverificar. A skill descreve `git diff <base>...HEAD`; se ainda houver WIP não commitado, declarar e revisar o snapshot efetivo desse WIP contra a base, sem chamar um diff vazio de revisão. Isso respeita a ordem solicitada de revisão antes do commit final.
6. Commit local da #4 na branch da feature após revisão; handoff ao pai antes da próxima issue. Sem push, merge, deploy, mudança de visibilidade ou atualização externa do ticket sem coordenação específica.

## Interfaces públicas sob teste

A skill oficial determina: **“Test only at pre-agreed seams.”** Nenhum teste novo da #4 foi escrito no commit de preparação. A autorização recebida para implementar a #4 com o fluxo preparado e TDD cobre as interfaces públicas abaixo, alinhadas aos casos exigidos. Não ampliar para testes de métodos privados ou novas fronteiras sem necessidade/coordenacão:

| Interface pública | O que detecta | O que não comprova |
| --- | --- | --- |
| `Library`: importação, listagem, prévia e futura operação de relocalização, com filesystem/SQLite reais | Identidade, ausência, cancelamento, candidato incorreto, conflitos, migração/legado, atomicidade observável, ID/dados após novo processo, originais preservados | Diálogo nativo, decodificador Electron e apresentação |
| API limitada preload/IPC, usando o Electron empacotado e os payloads públicos | Rotas por UUID, rejeição de caminhos/campos livres, resultados e isolamento do renderer | Seletor nativo quando substituído na fronteira do teste |
| Interface renderer/Chromium: estado de ausência, ação para uma foto e retorno à prévia | Comportamento visível no DOM, nomes/papéis acessíveis e associação ao ID correto | Inspeção visual humana, leitor de tela e diálogo Windows quando as ferramentas nativas não estiverem disponíveis |

Registros de migração podem ser preparados como fixtures v1/v2; as asserções de comportamento devem observar as interfaces públicas, sem consultar tabelas como atalho para verificar efeitos internos. As assinaturas da relocalização serão definidas nas fatias TDD, seguindo a decisão de identidade aprovada; nenhum método final foi inventado na preparação.

## Estado desta preparação

Origem/instalação/leitura/configuração concluídas. O fluxo completo `implement → tdd → code-review → commit` da #4 ainda não foi executado. O corpo do ticket foi atualizado com autorização explícita; não houve atribuição, comentário ou fechamento. Próximo passo: execução TDD da #4, revisão e commit separado. As verificações Windows anteriores estão em [review-windows.md](../evidence/missing-originals-windows/review-windows.md); não são resultados da feature #4.
