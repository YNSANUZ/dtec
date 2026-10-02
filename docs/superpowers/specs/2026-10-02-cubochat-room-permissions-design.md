# CuboChat — permissões e isolamento de mural e vaquinhas por sala

**Status:** aprovado por Ynsan em conversa; implementação local e validação de staging em andamento
**Data:** 2026-10-02

## Objetivo e limites

Transformar os dados de organização hoje globais da DTEC em recursos de cada sala do CuboChat, sem perder histórico. Uma sala pública como `/dtec` pode ser visitada por qualquer conta Google com perfil completo; visitantes sem login veem o cenário, mas não consultam recados, vaquinhas, listas de pagamentos ou auditoria. IDs de sala têm de 3 a 20 caracteres `a–z`/`0–9`, com maiúsculas digitadas convertidas e sem espaço, acento ou ponto.

Esta especificação cobre papéis por sala, mural, reações, eventos já em transição, vaquinhas, pagamentos e migração dos dados legados. Não cobre processamento de Pix, novas modalidades de salas privadas, cobrança, exclusão de histórico, publicação em produção ou alteração de DNS.

## Decisão de arquitetura

Usar tabelas compartilhadas com `room_slug` referenciando `rooms(slug)`, e não tabelas ou schemas separados por sala. Cada rota recebe a sala como parâmetro, valida o slug e filtra todos os recursos por ela; o banco reforça identidade, papéis e vínculo com a sala usando constraints, RLS e funções transacionais. Não confiar no `room_slug`, `user_id` ou papel enviados no corpo da requisição para conceder acesso.

Salas são públicas nesta fase. Isolamento significa que uma consulta ou alteração feita para a sala A nunca retorna ou afeta dados da B. Não significa impedir alguém autenticado de abrir explicitamente uma outra sala pública B. Essa distinção é importante para os testes e para a expectativa de privacidade.

## Papéis e regras

Criar papéis vinculados à sala, com chave `(room_slug, user_id)` e valores internos `owner`/`leader` (rótulos visíveis ADM/MOD). O criador de uma sala nova vira seu ADM atomicamente na criação. Somente o ADM daquela sala pode nomear ou remover MODs daquela sala. Papel numa sala não confere acesso administrativo em nenhuma outra.

Os papéis existentes da DTEC em `room_roles` serão copiados para `/dtec`, preservando ADM e MODs, sem promover essas pessoas nas outras salas. Para a DTEC, a sala sem `created_by` usa essa atribuição migrada. Uma função de autorização `has_room_role(room_slug, roles)` ou equivalente só aceita a identidade da sessão e um slug válido; sua execução não pode vazar papéis ou contornar RLS para leitura geral.

Com perfil Google completo, qualquer pessoa pode ler e publicar recados não fixados na sala visitada, editar/excluir os próprios recados não fixados, reagir uma vez por recado e remover a própria reação. ADM/MOD podem moderar, fixar e destacar recados somente da sua sala. ADM/MOD criam, editam, encerram e administram eventos e vaquinhas de sua sala. Outros participantes podem indicar o próprio interesse, aderir ou sair de uma vaquinha aberta e marcar o próprio pagamento. ADM/MOD podem incluir/remover participantes conforme as regras da campanha e marcar/corrigir pagamentos dos participantes da sala. Toda alteração de pagamento gera auditoria.

## Dados e migração

`rooms` continua o catálogo de salas. O `room_slug` já planejado em `mural_messages` e `room_events` deve permanecer obrigatório com FK; os registros existentes recebem `/dtec`. Adicionar `room_slug` obrigatório em `fundraisers`, também com FK e índice `(room_slug, status, created_at)`. As tabelas de reações, interessados, participantes, contribuições e auditoria pertencem à sala por meio de seus pais. Para impedir associação entre filhos e pais de salas diferentes, validar o vínculo por FK composta quando houver `room_slug` no filho ou por função transacional/RLS que consulta o pai; nunca confiar apenas no filtro da interface.

Preservar IDs, ciclos mensais, status, `marked_by`, `marked_at`, origem e histórico de auditoria existentes da DTEC. Migrações novas são aditivas e versionadas: sem `TRUNCATE`, recriação destrutiva de tabela ou reatribuição silenciosa de dados de uma sala a outra. Antes de restringir leitura/escrita, conferir contagens e integridade do backfill da DTEC no staging. Recriar as políticas antigas globais como políticas por sala; a política antiga não pode ficar em paralelo e reabrir acesso. As rotas legadas `/api/mural/*`, `/api/fundraisers/*` e `/api/events/*` permanecem exclusivamente DTEC durante a transição ou são redirecionadas de modo compatível; rotas genéricas usam `/api/rooms/[slug]/...`. Não aceitar `room_slug` arbitrário em rotas legadas.

## Vaquinhas e privacidade

Cada campanha mantém título, descrição, valor mensal fixo por pessoa, dia de vencimento, chave Pix/instruções e status. A interface não apresenta total arrecadado ou valor faltante. O ciclo reinicia no vencimento mensal sem apagar ciclos anteriores. Os participantes da sala veem lista de pagos e pendentes com nome e avatar, valor individual, vencimento e Pix; visitantes anônimos não veem esses dados. Como salas são públicas, qualquer pessoa com Google e perfil completo que acesse explicitamente a sala poderá ver sua lista: não prometer sigilo entre membros de uma sala pública.

`paid` é uma marcação manual, **não confirmação bancária**. Guardar `actor_id` e `source` (`self`, `adm`, `mod`) no histórico, além de horário e estado anterior/novo; exibir origem quando necessário para evitar confusão. Uma função transacional valida sala, campanha, participante, ciclo e papel antes de alterar o status e escrever um único evento de auditoria. O cliente não recebe permissão direta para alterar contribuições ou inserir auditoria. Pix, WhatsApp e dados de autenticação não entram em logs nem em respostas públicas; não copiar e-mail ou número de telefone para tabelas de vaquinha. O histórico de auditoria fica visível apenas ao ADM/MOD da própria sala, enquanto o estado atual pago/pendente é visível aos participantes autenticados da sala pública.

## Fluxo de API e tratamento de falhas

As rotas por sala normalizam slug, exigem sessão/perfil nas operações internas e retornam `401` para anônimos, `403` para papel insuficiente, `404` para recurso ausente ou de outra sala e `409` para ciclo vencido ou concorrência detectada. Respostas privadas usam `Cache-Control: private, no-store`. IDs de recados/campanhas fornecidos pelo navegador são sempre buscados junto com a sala antes de atualização, reação, adesão ou pagamento. Uma falha em backfill, política, RPC ou integridade interrompe a promoção; não há fallback para consultas globais.

Na UI, os murais continuam janelas 2D leves sobre o cenário. Listas e cartões exibem apenas dados da sala corrente. Perfis, fotos e contagens só são carregados para os registros retornados dessa sala. A DTEC mantém aparência e recursos atuais durante a transição; salas genéricas recebem o mesmo fluxo básico de recados, eventos e vaquinhas antes de o CuboChat ser anunciado como pronto.

## Verificação e implantação

1. Testes de banco em Postgres local/PGlite para backfill DTEC, políticas RLS, papéis separados por sala, FK e funções de pagamento. Cobrir ADM de A tentando administrar B, membro tentando marcar pagamento alheio, IDs de B enviados para rotas de A, anon tentando ler dados e sala pública B aberta explicitamente por outra conta Google.
2. Testes de API para filtros por slug em todas as operações e para respostas `401/403/404/409`; regressão de recados, reações, eventos, ciclos e auditoria DTEC.
3. Build, TypeScript e suíte completa local. Aplicar migrações novas apenas ao Supabase `dtec-staging` e verificar contagem e integridade antes/depois, RLS, Google login e fluxos reais em preview Vercel isolado.
4. QA em desktop e celular, com duas salas e duas contas Google para verificar que nenhuma tela mistura dados. Não apontar `cubochat.be` ou promover para produção até essa validação e uma aprovação específica de Ynsan.

## Critérios de conclusão

- Nenhuma API da sala A devolve ou altera registros da B; acesso explícito a uma sala pública B continua possível para perfil autenticado.
- ADM/MOD agem somente na própria sala, e o criador de sala nova vira ADM sem autoatribuição forjada.
- Recados e vaquinhas da DTEC mantêm IDs, participantes e histórico, agora vinculados à `/dtec`.
- Pagamentos próprios e administrativos seguem as permissões e geram auditoria atômica com origem, sem alegar confirmação de Pix.
- Visitantes anônimos não consultam dados internos; UI e banco aplicam a mesma regra de sala.
- Testes locais, staging e QA de isolamento passam antes de propor produção.
