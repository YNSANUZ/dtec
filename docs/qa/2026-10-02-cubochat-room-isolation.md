# CuboChat — validação de isolamento por sala

Data: 02/10/2026. Escopo ampliado estimado em 79%; não é percentual de testes.

## Destinos

- Produção: Supabase `dbgtkjteqhdktwgruetx`. Não acessado nem alterado nesta execução.
- Staging: Supabase `grbanfuzzrlyapxyhjzc`, confirmado no endereço e no título do painel.
- Branch de teste: `codex/dtec-implementation`; não promover para `main`.
- DNS/domínio cubochat.be: não alterado.

## Migrações aplicadas

As nove migrações anteriores já estavam instaladas. Foram observadas 12 tabelas públicas com RLS e ausência de rooms/room_staff antes do lote.

Aplicadas em staging em uma transação, nesta ordem; **não reaplicar**:

1. 202610030006_rooms.sql
2. 202610030007_room_chat.sql
3. 202610030008_global_instagram.sql
4. 202610030009_room_member_presence.sql
5. 202610030010_scope_legacy_events.sql
6. 202610030011_scope_legacy_mural.sql
7. 202610030012_room_staff.sql
8. 202610030013_room_mural.sql
9. 202610030014_room_events.sql
10. 202610030015_room_fundraisers.sql

Resultado: 16 tabelas públicas, todas com RLS.

## Recuperação e preservação

Antes do lote foi criado o schema restrito `cubochat_before_rooms_20261002_c8b338c`: cópias das 12 tabelas públicas e cinco conjuntos de metadados (funções, políticas, colunas e privilégios). Sem acesso USAGE para anon/authenticated e sem privilégios nas tabelas. Não copia auth.users, credenciais ou tokens. **Não é backup completo gerenciado**: reconstrução de schema/constraints/triggers depende das migrações originais, com recuperação supervisionada.

Baseline: 1 perfil, 1 evento, 0 recados, 0 vaquinhas, 0 papéis legados. Comparação posterior confirmou perfil integral preservado (desconsiderando a nova coluna Instagram), ID/conteúdo do evento original preservados com room_slug=dtec. As fixtures SQL de QA foram revertidas com ROLLBACK.

Um primeiro envio do lote pelo editor reutilizou texto anterior e abortou com schema de snapshot já existente, antes de alterar tabelas públicas. O editor foi limpo completamente e o lote correto executou com sucesso. O primeiro smoke script tentou inserir IDs protegidos como usuário autenticado; o banco corretamente recusou. O script passou ao usar IDs gerados pelo banco, sem ampliar permissões.

## Matriz

| Verificação | Resultado e evidência |
| --- | --- |
| Suite local antes do smoke | 207 testes passaram; build de produção passou |
| Suite final após regressões | 209 testes em 55 arquivos passaram; build/TypeScript e diff check passaram |
| Novo quadro 2D | 6 testes DOM: endpoints da sala, visitante sem fetch privado, respostas antigas descartadas, reações, pagamento próprio/ciclo, primeira vaquinha ADM |
| Tela desktop/mobile | Conferidas no navegador com fixture fictícia local, desktop e 390x844; rota temporária removida |
| ADM por sala | PostgreSQL staging: criador de A recebe ADM; não é ADM de B |
| Eventos | PostgreSQL staging: criação em A permitida; em B recusada por RLS |
| Recados/reações | PostgreSQL staging: reação em A aceita; mesmo ID com sala B recusado |
| Pagamento e auditoria | PostgreSQL staging: primeiro pagamento muda estado; repetição não muda nem duplica auditoria |
| Ciclo obsoleto | PostgreSQL staging: tentativa com data anterior recusada |
| Compatibilidade RPC DTEC | PostgreSQL staging: RPC antigo recusa vaquinha de sala genérica |
| Visitantes | SELECT de mural/vaquinhas e execução do RPC de pagamento negados por privilégios |
| Dados anteriores | Perfil e evento original preservados; fixtures revertidas |
| Retorno/troca de sala | 2 testes DOM de presença: aguardar posição salva antes do primeiro POST; posição separada por sala |
| Resumo legado DTEC | Teste de participação exclui eventos, recados e vaquinhas de outra sala |
| Preview atualizado com estas mudanças | Commit 03aff56 publicado somente na branch de testes. Primeiro build exibiu CSS antigo; redeploy sem Build Cache corrigiu, deployment DXgDGMi6Xy7Qkd8Y7JnRF4mFmFoo |
| Fluxo real com uma conta | Sessão Google recuperada, criação qa20261002 com maiúsculas normalizadas, chat enviado com Enter e recuperado após reload, recado/reação/lista de autores, evento/interesse e primeira vaquinha mensal/participação/marcação paga passaram |
| Duas salas na interface | qa20261002b criada com a mesma conta: chat, recados, eventos e vaquinhas vazios, sem conteúdo da primeira sala. Não substitui teste de autorização com outra conta |
| Google e visitante no preview | Sair levou ao lobby; visitante em qa20261002 viu apenas solicitação de login no quadro, sem recados/eventos/vaquinhas; login Google retornou à mesma sala e ao perfil existente |
| Movimento e câmera desktop | Clique no chão deslocou o personagem; arrasto girou o ambiente e exibiu Reenquadrar; enviar mensagem e abrir/fechar quadro preservaram visualmente a posição e o ângulo; Reenquadrar restaurou a câmera sem reposicionar o avatar. Apenas uma sessão nesta verificação |
| Mobile do preview | Quadro observado em viewport 390x844, campos/tabs dentro da largura; viewport restaurado. Não simula teclado/gestos de aparelho físico |
| Duas contas Google, duas salas, fluxo real | Pendente; smoke usa identidade existente dentro de transação SQL, não equivale a esse fluxo |
| Concorrência entre duas sessões PostgreSQL | Pendente; não inferir de chamadas sequenciais/idempotentes |
| Movimento/câmera/teclado em aparelho real | Pendente; testes DOM não executam WebGL |

## Limitações e porta de saída

As miniaturas foram substituídas por doze PNGs locais transparentes (176×176, 107236 bytes no conjunto): cabeça e corpo dos seis modelos existentes. Nenhum WebGL/GLTF/RAF por miniatura na interface; os utilitários de geração ficam apenas em scripts, fora do componente. O CSS agora respeita círculos de 34/38/42/58/64 px e centraliza o rosto. Fixture local confirmou todos os modelos e foi removida antes do build; prova em outputs/qa/avatar-thumbnails-local.png. Validação: 221 testes em 57 arquivos, ESLint dos arquivos novos/alterados, build/TypeScript e diff check passaram. Um primeiro build encontrou referência gerada à fixture já removida; removido somente .next/dev/types/validator.ts obsoleto, o build passou.

Administração de eventos, fotos do Google e perfil global ainda precisam QA de paridade visual/funcional. O ajuste ad7ce5b foi publicado somente na branch de testes: deployment GaiDWN4n4veSwkLbLourdsJbpKn3 Ready. Preview da sala qa20261002 recuperou sessão e dados; contribuição mostrou PNG character-r-head.png carregado (176 px naturais), círculo 34×34 e zero canvas na miniatura, centralizado visualmente. Screenshot em outputs/qa/preview-static-heads.png. Nenhum novo pagamento, migração ou alteração de produção/DNS.

## Checkpoint de perfil e eventos

Menu compartilhado no lobby e salas gerais: foto circular do Google (URL HTTPS googleusercontent validada, fallback inicial, sem referrer), primeiro nome escolhido, formulário sob demanda, criação de sala, instalação explicitamente desativada e saída. Perfil global editável na própria sala: seis miniaturas numeradas, dois nomes, cargo, biografia, aniversário DD/MM sem ano e WhatsApp/Instagram opcionais. Dados não são gravados ao cancelar; erros preservam o formulário. Perfil inicial continua condicionado à autenticação; visitante não recebe formulário aberto.

Eventos: ADM/MOD pode editar campos/categoria/data, encerrar, cancelar e reabrir sem apagar interesses. Membros podem consultar arquivo encerrado/cancelado, mas não recebem controles administrativos nem podem adicionar interesse a evento fechado. Datas do editor usam horário local, convertido de volta ao instante ISO; respostas antigas do roster são descartadas ao trocar de evento. Permissões continuam verificadas pela API/RLS existente, sem migração.

Validação inicial: 241 testes/61 arquivos, build/TypeScript, ESLint dos arquivos alterados e diff check passaram. Regressão DOM confirmou que abrir, digitar e cancelar o perfil mantém OfficeScene montado; isso não equivale a verificar movimento WebGL em duas contas.

Preview 3ba4fbf, deployment 4aB9eg6MHETwNLTsZ2DD4uFbJtT9 Ready: menu/foto Google/primeiro nome, instalação desativada e perfil completo conferidos; perfil atual Gestor ADM salvo sem modificar os campos, modal fechou e sala permaneceu. Formulário observado a 390×844, 366 px de largura, sem overflow horizontal; viewport restaurado (não é teclado/touch físico). Screenshots outputs/qa/preview-profile-desktop.png e preview-profile-mobile.png.

QA real de evento fictício encontrou uma falha que mocks de UI não cobriam: PATCH encerrava, mas a consulta GET retornava somente abertos. Corrigido com opt-in includeArchived=1 no GET legado DTEC e GET por sala, preservando o filtro de sala e contexto autenticado; consultas sem opt-in continuam apenas abertas. Novos testes API cobrem arquivo/counts/isolamento/401. 243 testes/61 arquivos, build/TypeScript, ESLint e diff check passaram após correção.

Correção ad2bd1a publicada somente no preview, deployment AXYHzHNf9GCFHX2fLAjiSDVHx66u Ready. Reteste real com a mesma conta Google confirmou edição, consulta de encerrados, reabertura, cancelamento e nova reabertura do evento fictício Kart QA. O interessado Gestor ADM continuou visível, contagem 1, em todos os estados; evento encerrado/cancelado não oferece botão de adicionar interesse. Ao terminar, restaurados estado aberto e local original Staging. Nenhum interesse foi removido, nenhum evento foi excluído. Provas outputs/qa/preview-event-archive.png e preview-event-lifecycle.png. Nova execução completa após publicação confirmou 243 testes/61 arquivos e build/TypeScript. Menu Criar meu CuboChat do lobby abriu o formulário sem criar outra sala. Duas contas independentes, concorrência e aparelho físico continuam pendentes.

Fixtures da interface permanecem somente no staging, identificadas como QA: salas qa20261002 e qa20261002b, um recado, um evento, duas mensagens (uma por sala) e uma vaquinha fictícia de R$10 sem chave Pix, com instrução explícita para não pagar. Não houve transferência. Screenshots em outputs/qa/preview-payment-qa.png e preview-camera-qa.png (ignorados no Git). O botão fechar do novo quadro ficou desalinhado pela regra global herdada; ajuste local usa grid/place-items/line-height com seletor do botão para centralizar o X; 6 testes do quadro e build passaram.

## Checkpoint de etiquetas e estabilidade do cenário

A inspeção de paridade encontrou uma falha compartilhada por DTEC e salas gerais: o nome sobre um personagem remoto só era atualizado quando seu estado online mudava. Reprodução RED com o componente real mostrou Ana Silva ainda sobre o personagem após o perfil mudar para Ana Lima, tanto online quanto offline. Correção restrita à etiqueta: compara nome e presença, substitui somente o sprite e libera a textura/material privados anteriores. Não adiciona dependências ao ciclo de vida do cenário nem muda posição, ângulo ou modelo do personagem.

Cinco testes comportamentais executam o componente e o grafo Three.js reais, substituindo apenas GPU, carregamento GLTF e desenho 2D indisponíveis no ambiente DOM. Cobrem renomeação online/offline, ponto verde, manutenção do sprite em polls idênticos, descarte dos recursos substituídos e caminhada real iniciada por clique que continua após atualização de chat/presença/callbacks, preservando a câmera ampliada. RED: três falhas esperadas no código anterior; GREEN: cinco passaram. Suite completa: 248 testes/62 arquivos; build/TypeScript, ESLint direcionado e diff check passaram. O primeiro build deste checkpoint encontrou apenas incompatibilidade da tipagem do mock com a sobrecarga WebGPU de getContext, corrigida no teste antes do build final.

Esses testes não executam GPU real nem demonstram duas contas Google independentes. Troca remota de modelo/avatar e paridade de lista online/perfis/aniversariantes nas salas gerais permanecem fora desta correção e precisam incremento próprio e QA. Estimativa mantida em 77%; tarefa 7 segue em andamento, sem migração, produção ou DNS alterados.

Revisão independente deste diff não encontrou problemas críticos, importantes ou menores; não julgou limpeza global preexistente de recursos, GPU/GLTF reais ou backend de presença fora do incremento. Commit 0a1ad9b enviado somente à branch de testes; deployment Vercel AwANVRFkEv9T7DJR8GH6q6cgafKn, target preview, Ready, alias de staging confirmado via CLI. Inspeção no navegador recuperou a mesma sessão Gestor e o histórico; ampliar a câmera, abrir/fechar o quadro e digitar um rascunho manteve o enquadramento ampliado e o controle Reenquadrar. O recado/reação existentes carregaram. Rascunho limpo sem enviar, sem novos registros de chat ou perfil. Provas outputs/qa/preview-live-labels-board.png e preview-live-labels-scene.png; a primeira registra o carregamento inicial do quadro, que terminou na inspeção seguinte. Esse smoke de uma conta não valida propagação de renomeação entre dois usuários.

Não liberar produção ou DNS apenas com testes locais. Confirmar preview apontando para staging, concluir testes reais acima e solicitar aprovação específica para migração/publicação em produção e domínio.

## Checkpoint de troca remota de personagem

Desenho restrito aprovado por Ynsan: substituir somente o modelo remoto, mantendo posição, direção, destino de caminhada, nome, mensagem e câmera; conservar o modelo visível quando o arquivo falha e ignorar respostas antigas. Implementação mantém um grupo pai persistente para a transformação/etiquetas e troca apenas seu filho GLTF. Pedido identificado por objeto, comparação com a escolha atual e guarda de desmontagem impedem sobrescritas e ressurreição após saída. Carregamentos pendentes iguais não se duplicam em cada poll. Nenhuma nova dependência de presença foi adicionada ao efeito que cria o cenário.

Cinco novos testes reproduziram a falha antes da implementação: avatar antigo permanecia e não havia carregamento do substituto. Os testes adicionais cobrem escolha inicial atualizada durante carregamento, remoção de usuário, callbacks após desmontagem, retorno ao modelo já exibido e animação real do substituto. A revisão encontrou uma textura privada do esqueleto que não era liberada; confirmado no código local Three.js e em teste RED com SkinnedMesh/Bone/Skeleton reais. A correção libera somente esqueletos únicos do clone aposentado, sem descartar geometria/material compartilhados. Os 16 testes direcionados passaram após o ajuste; revisão incremental sem achados restantes. GPU, GLTF e desenho de etiquetas são as fronteiras substituídas nos testes DOM, não a lógica de movimento/câmera/mixers.

Fixture temporária local sem banco executou os modelos GLB reais no navegador: f → r manteve a posição da personagem Ana QA, mensagem/etiqueta e enquadramento ampliado. Caminhada até o destino foi observada antes da troca. Screenshots outputs/qa/local-avatar-swap-before.png, local-avatar-swap-after.png e local-avatar-swap-dance.png. O primeiro ensaio usou por engano b, arquivo inexistente neste conjunto; fixture corrigida para f antes das provas finais. Rota temporária e arquivos de instrução gerados por next dev removidos, servidor parado; nenhum perfil, mensagem ou pagamento foi gravado. Isso valida renderização local, não propagação entre duas contas Google ou sincronização no backend.

Validação final: 259 testes em 62 arquivos, build de produção/TypeScript, ESLint direcionado e diff check passaram. Removido somente o validator gerado obsoleto que apontava à rota temporária já excluída. Revisão independente final sem achados no incremento; limpeza global preexistente e QA multissessão continuam fora deste resultado. Estimativa 78%; tarefa 7 segue em andamento.

Commit a828396 enviado somente à branch de testes. Vercel 91TdpFiqHNyCqqZNHkFymHUWKQjo, target preview, Ready e alias de staging confirmados via CLI. Smoke no preview recuperou a mesma sessão Gestor e dados/histórico/recado/reação. Zoom ampliado continuou após abrir/fechar quadro e digitar rascunho; rascunho apagado sem enviar. Prova outputs/qa/preview-avatar-swap-smoke.png. A aba local ficou em página de conexão recusada após parar o servidor; a verificação de preview usou a aba válida existente. Nenhum usuário remoto adicional autenticado estava disponível: não inferir teste de troca entre duas contas desse smoke. Produção/main/DNS/credenciais/migrações não alterados.

## Inspeção do próximo incremento: pessoas da sala

Heartbeat de 02/10/2026 17:52 UTC, sem implementação nova. Branch em 726ebac, sem mudanças prévias além de tsconfig.tsbuildinfo não rastreado. A sala genérica já recebe nome/avatar/online/posição por sala, mas não tem contagem/lista online e seu onCharacterClick é vazio. A DTEC possui lista e cartão de perfil próprios; seu endpoint de detalhes fixa o papel à DTEC e não pode ser usado para fornecer papéis de outra sala. A API staff genérica lê somente o papel do próprio solicitante, não a lista de colegas. A presença genérica marca birthdayToday=false; aniversariantes e resumos com fotos permanecem incrementos posteriores.

Desenho bounded proposto, aguardando aprovação específica do desenho em conversa: contador/lista online discreta nas salas genéricas; abrir o mesmo cartão leve por clique no nome ou boneco, com avatar atual, nome completo, cargo, biografia, DD/MM e contatos opcionais. Detalhes/lista enriquecida autenticados e vinculados aos IDs registrados na presença da sala solicitada; papéis ADM/MOD consultados apenas nessa sala. Visitantes veem somente nome/avatar/status já públicos e recebem convite de login fechável ao tentar abrir detalhes. Reaproveitar componentes/padrões existentes sem migrar banco, conceder permissões novas, gravar perfil, reiniciar OfficeScene ou alterar DTEC. Testes devem cobrir visitante sem leitura privada, pessoa de outra sala recusada, papel diferente por sala, respostas atrasadas após mudar pessoa/sala e cena/câmera preservadas ao abrir/fechar o cartão. Nomeação/remoção de MOD, aniversariantes e fotos-resumo fora deste incremento. Não iniciar implementação antes da aprovação deste desenho; estimativa permanece78%.

## Checkpoint aprovado: lista online e perfil por clique

Ynsan aprovou o desenho acima com “sim”. As salas genéricas agora exibem contador/lista online e abrem cartão pelo nome ou callback de clique no personagem. O cartão usa PNG local da cabeça, nome completo, título, bio, DD/MM e contatos opcionais validados. Visitante recebe convite Google fechável, sem requisição privada. APIs novas `/api/rooms/[slug]/users` e `/users/[id]` exigem autenticação/perfil válido, vinculam o alvo à presença da sala e consultam ADM/MOD somente nessa sala. Lista não inclui contatos/bio; respostas privadas são `private, no-store`, sem e-mail. Nenhuma migração, nova concessão de segurança ou alteração da API de presença/OfficeScene/DTEC.

TDD: cinco casos da API inicialmente falharam por endpoint ausente; suíte de UI inicialmente não carregava componente inexistente; teste de integração de clique falhou por contador inexistente. Após implementação, passaram os casos de login/lista/perfil/isolamento/contatos/saída e respostas atrasadas. A revisão encontrou o guard legado aceitando perfil existente inválido: teste reproduziu 200 em vez de 401 para nome único; guard específico agora valida o ator com a mesma normalizeProfile do onboarding. Encontrou também cartão antigo ao reabrir: teste reproduziu contato anterior enquanto GET novo pendia; o conteúdo privado agora desmonta ao fechar/trocar alvo. Teste adicional cobre resposta antiga após A→B. Revisão final sem achados restantes no incremento.

Validação completa: 275 testes/64 arquivos, build/TypeScript, ESLint direcionado e diff check passaram. O baseline inicial, antes de alterar produto, teve dez timeouts de banco com paralelismo padrão; repetir com `--maxWorkers=2` passou 259/259. Todas as suítes posteriores foram executadas com dois workers, sem mudar limite de tempo ou suprimir testes. Um build intermediário encontrou campo title ausente em RoomPerson; preenchido e build final passou. Um refactor intermediário moveu o efeito da lista para o cartão por engano; oito testes falharam, efeito recolocado e suíte completa verde. Registro não equivale a QA GPU ou duas sessões independentes.

Lembrete do requisito offline: teste de caracterização da API de presença confirmou que visitante anônimo recebe nome/avatar/posição do membro com last_seen de um dia atrás, online=false e ação idle, sem escrita. A lista online exclui offline; o cenário continua recebendo todos os membros históricos dessa sala.

Checagem anônima do alias de preview `/dtec` retornou HTTP 302 para host vercel.com, caminho /sso-api. Portanto este preview não está livre para colegas sem acesso à Vercel. Não remover proteção sem aprovação específica; produção/DNS continuam intactos. Publicação do incremento somente na branch de testes e smoke real do novo cartão ainda pendentes neste registro. Estimativa79%; tarefa7 continua aberta, duas contas/concorrência/aparelho físico ainda pendentes.
