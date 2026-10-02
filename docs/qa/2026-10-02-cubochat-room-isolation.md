# CuboChat — validação de isolamento por sala

Data: 02/10/2026. Escopo ampliado estimado em 77%; não é percentual de testes.

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

Validação local: 241 testes/61 arquivos, build/TypeScript, ESLint dos arquivos alterados e diff check passaram. Regressão DOM confirmou que abrir, digitar e cancelar o perfil mantém OfficeScene montado; isso não equivale a verificar movimento WebGL em duas contas. Conferência deste checkpoint no preview ainda pendente.

Fixtures da interface permanecem somente no staging, identificadas como QA: salas qa20261002 e qa20261002b, um recado, um evento, duas mensagens (uma por sala) e uma vaquinha fictícia de R$10 sem chave Pix, com instrução explícita para não pagar. Não houve transferência. Screenshots em outputs/qa/preview-payment-qa.png e preview-camera-qa.png (ignorados no Git). O botão fechar do novo quadro ficou desalinhado pela regra global herdada; ajuste local usa grid/place-items/line-height com seletor do botão para centralizar o X; 6 testes do quadro e build passaram.

Não liberar produção ou DNS apenas com testes locais. Confirmar preview apontando para staging, concluir testes reais acima e solicitar aprovação específica para migração/publicação em produção e domínio.
