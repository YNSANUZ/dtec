# CuboChat — validação de isolamento por sala

Data: 02/10/2026. Escopo ampliado estimado em 72%; não é percentual de testes.

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
| Preview atualizado com estas mudanças | Pendente |
| Duas contas Google, duas salas, fluxo real | Pendente; smoke usa identidade existente dentro de transação SQL, não equivale a esse fluxo |
| Concorrência entre duas sessões PostgreSQL | Pendente; não inferir de chamadas sequenciais/idempotentes |
| Movimento/câmera/teclado em aparelho real | Pendente; testes DOM não executam WebGL |

## Limitações e porta de saída

As miniaturas de cabeças reaproveitadas ainda usam WebGL por avatar: medir desempenho e preferir imagens estáticas/cache antes da conclusão do produto. Administração de eventos, fotos do Google e perfil global ainda precisam QA de paridade visual/funcional.

Não liberar produção ou DNS apenas com testes locais. Confirmar preview apontando para staging, concluir testes reais acima e solicitar aprovação específica para migração/publicação em produção e domínio.
