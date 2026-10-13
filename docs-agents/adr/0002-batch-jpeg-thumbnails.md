# 0002: Lote JPEG, miniaturas derivadas e grade

Extensão da segunda fatia aprovada, implementada em 11/10/2026. Mantém SQLite exclusivamente no main, originais por referência, renderer isolado e as verificações de origem/payload do IPC.

O seletor nativo permite múltiplos arquivos. Uma fila serial engloba leitura e decodificação de importações, prévias e miniaturas, inclusive chamadas concorrentes. O loop cede à fila de eventos entre arquivos. Fechar a janela interrompe itens ainda não confirmados; cada item válido já concluído tem transação própria. Não há retomada automática dos itens pendentes: reimportar o lote reutiliza IDs por caminho canônico.

Schema v2 adiciona `thumbnails(photo_id, data_url)` de forma transacional a catálogos v1. Foto e miniatura são gravadas na mesma transação. Os bytes derivados são JPEG de até 256 px no maior lado, qualidade 75 e teto de 256 KiB antes da codificação base64, mais um segmento mínimo de orientação. `nativeImage` decodifica/reduz; apenas a orientação EXIF é reinscrita para a exibição Chromium, sem GPS ou outros EXIF do original. A prévia continua preservando JPEG/EXIF/ICC original. Não há comprovação abrangente de fidelidade de cor da miniatura.

Novas operações IPC: `progress` sem payload e `thumbnail` por UUID. Nenhum caminho livre, payload de escrita, evento Electron ou acesso a Node é exposto. Consulta de progresso tem uma requisição pendente no renderer por vez, espaçada em 150 ms. A grade carrega serialmente até 48 miniaturas por página; prévia carrega uma foto selecionada. Isso limita trabalho simultâneo, mas não é medição de adequação ao alvo 8 GB.

Cache ausente de catálogo anterior é regenerado sob demanda. Cache corrompido não tem recuperação automática nesta fatia; alterações externas do original não invalidam a miniatura até reimportação. Originais ausentes continuam catalogados, com miniatura em cache e erro compreensível ao abrir a prévia. Schemas futuros continuam recusados. A primeira versão (schema v1) não abre um catálogo atualizado v2, sem apagá-lo.

## Cancelamento de prévias pendentes — #52

A fila protegida continua serializando leitura, autenticação e commits. Antes dela,
o coordenador de prévias retém no máximo uma tentativa despachada e uma seleção
pendente substituível, inclusive através de reloads. Substituir a pendente encerra
sua promessa com `{ ok: false, canceled: true }`, sem I/O do original. A despachada
verifica seu ticket ao adquirir a fila, antes de leitura/hash/decode; uma operação
que já começou termina seu pipeline normal, incluindo erros e identidade legada.
Isto não interrompe decode síncrono nem implica redução quantitativa de RSS.

O canal privado `revelumo:preview` verifica owner, frame principal, origem,
token efêmero de documento emitido pelo main e geração inteira segura. O preload
mantém o token privado e reserva gerações monotônicas por `invalidatePreview()`;
`previewPhoto(id, generation?)` aceita a reserva ou cria uma intenção nova quando
chamado sem geração. Respostas de handshakes antigos nunca renovam seu token.
Navegação real, crash, destruição e fechamento confirmado aposentam o documento.

Troca/retry invalidam apenas a intenção de prévia. Na saída, um hook específico
aposenta a prévia depois do flush/histórico/export bem-sucedidos e antes de
`end-edit` entrar na mesma fila; fazê-lo depois de `end-edit` deixaria uma prévia
antiga à sua frente ler o original. Falha de save/export não chega ao hook; falha
do hook/end-edit preserva a sessão e permite nova tentativa. O retorno à grade
invalida também a abertura sem sessão. Nenhum save, gesto, Undo/Redo, item de
importação, identidade, relocalização ou exportação é coalescido. A seleção mais
recente é admitida no final da fila depois da tentativa despachada; não substitui
a foto dentro de uma posição antiga, ultrapassando mutações já aceitas.

`originalStatus` permanece autenticando o original e pode fazer I/O antes do
pedido de prévia. Esta fatia reduz trabalho de prévias aposentadas, não todo custo
de navegação. Coalescência dos pixels EV/WB, transporte JPEG, limites e algoritmo
permanecem os mesmos. Testes de núcleo e `test:preview-queue` usam fixtures pequenas,
contadores determinísticos e bloqueio na fronteira de filesystem.
