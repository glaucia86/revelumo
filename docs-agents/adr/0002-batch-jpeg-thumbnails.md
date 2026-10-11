# 0002: Lote JPEG, miniaturas derivadas e grade

Extensão da segunda fatia aprovada, implementada em 11/10/2026. Mantém SQLite exclusivamente no main, originais por referência, renderer isolado e as verificações de origem/payload do IPC.

O seletor nativo permite múltiplos arquivos. Uma fila serial engloba leitura e decodificação de importações, prévias e miniaturas, inclusive chamadas concorrentes. O loop cede à fila de eventos entre arquivos. Fechar a janela interrompe itens ainda não confirmados; cada item válido já concluído tem transação própria. Não há retomada automática dos itens pendentes: reimportar o lote reutiliza IDs por caminho canônico.

Schema v2 adiciona `thumbnails(photo_id, data_url)` de forma transacional a catálogos v1. Foto e miniatura são gravadas na mesma transação. Os bytes derivados são JPEG de até 256 px no maior lado, qualidade 75 e teto de 256 KiB antes da codificação base64, mais um segmento mínimo de orientação. `nativeImage` decodifica/reduz; apenas a orientação EXIF é reinscrita para a exibição Chromium, sem GPS ou outros EXIF do original. A prévia continua preservando JPEG/EXIF/ICC original. Não há comprovação abrangente de fidelidade de cor da miniatura.

Novas operações IPC: `progress` sem payload e `thumbnail` por UUID. Nenhum caminho livre, payload de escrita, evento Electron ou acesso a Node é exposto. Consulta de progresso tem uma requisição pendente no renderer por vez, espaçada em 150 ms. A grade carrega serialmente até 48 miniaturas por página; prévia carrega uma foto selecionada. Isso limita trabalho simultâneo, mas não é medição de adequação ao alvo 8 GB.

Cache ausente de catálogo anterior é regenerado sob demanda. Cache corrompido não tem recuperação automática nesta fatia; alterações externas do original não invalidam a miniatura até reimportação. Originais ausentes continuam catalogados, com miniatura em cache e erro compreensível ao abrir a prévia. Schemas futuros continuam recusados. A primeira versão (schema v1) não abre um catálogo atualizado v2, sem apagá-lo.
