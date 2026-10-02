# DTEC Virtual Office — Eventos, interesses e vaquinhas

**Status:** proposta de implementação aguardando revisão do usuário  
**Data:** 2026-10-02

## Objetivo

Estender os murais do DTEC para organizar eventos e contribuições coletivas, mantendo a interface leve em janelas sobrepostas ao escritório. Colegas autenticados podem indicar interesse em eventos e consultar campanhas; campanhas exibem quem já foi marcado como pago e quem ainda está pendente.

## Escopo desta etapa

- Eventos configuráveis para atividades como futebol, paintball e kart.
- Lista de interessados: qualquer membro autenticado pode adicionar ou remover o próprio interesse.
- Avisos gerais continuam no mural de informações existente; não são convertidos em eventos.
- Vaquinhas com título, descrição, meta opcional, prazo opcional e informações de pagamento opcionais.
- Cada participante pode registrar que pagou a própria contribuição; o dono da sala pode registrar ou corrigir o estado de qualquer participante.
- Listas de pagos e pendentes com avatar escolhido no perfil e nome completo.
- Sem cobrança, processamento de Pix ou integração bancária nesta etapa.

## Fora de escopo

- Processamento, confirmação ou reconciliação automática de pagamentos.
- Cálculo de quanto cada pessoa individualmente deve pagar, divisão automática ou comprovantes.
- Anexos, uploads, notificações push/e-mail, recorrência, comentários e exportação financeira.
- Transformar todo recado do mural em atividade ou campanha.

## Experiência

Os murais permanecem janelas leves sobre o cenário. A janela de lazer/eventos lista eventos ativos e quantas pessoas demonstraram interesse; ao abrir um evento, a pessoa vê a descrição e pode marcar/remover o próprio interesse. O interesse não significa confirmação de presença.

A pasta de vaquinhas apresenta campanhas abertas e encerradas. Em cada campanha, um resumo mostra meta (se definida), total registrado como pago e prazo (se definido). Abaixo, uma lista mostra primeiro quem está marcado como pago — avatar, nome completo e data do registro — e depois os pendentes com aparência visual mais discreta. O dono pode marcar qualquer membro como pago ou pendente; o próprio membro pode mudar somente o próprio estado. A interface deve explicar que o estado é um registro manual, não uma confirmação bancária.

No celular, as janelas usam largura disponível, rolagem interna e controles acionáveis por toque, sem exigir navegação para outra página.

## Modelo de dados proposto

### `room_events`

- `id uuid primary key`
- `title text not null` (até 80 caracteres)
- `description text not null default ''` (até 1000 caracteres)
- `category text not null` (por exemplo `futebol`, `paintball`, `kart`, `outro`)
- `starts_at timestamptz null`
- `location text not null default ''` (até 160 caracteres)
- `status text not null default 'open'` (`open`, `closed`, `cancelled`)
- `created_by uuid references profiles(user_id)`
- `created_at`, `updated_at timestamptz`

### `room_event_interests`

- `event_id uuid references room_events(id) on delete cascade`
- `user_id uuid references profiles(user_id) on delete cascade`
- `created_at timestamptz`
- chave primária composta `(event_id, user_id)` para impedir interesses duplicados.

### `fundraisers`

- `id uuid primary key`
- `title text not null` (até 100 caracteres)
- `description text not null default ''` (até 1500 caracteres)
- `goal_cents bigint null` (valor em centavos; maior que zero quando definido)
- `deadline timestamptz null`
- `pix_key text null` e `payment_instructions text not null default ''` (ambos opcionais e limitados)
- `status text not null default 'open'` (`open`, `closed`, `cancelled`)
- `created_by uuid references profiles(user_id)`
- `created_at`, `updated_at timestamptz`

### `fundraiser_contributions`

- `fundraiser_id uuid references fundraisers(id) on delete cascade`
- `user_id uuid references profiles(user_id) on delete cascade`
- `status text not null default 'pending'` (`pending`, `paid`)
- `amount_cents bigint null` (opcional; não é necessário para a lista de presença financeira)
- `marked_by uuid references profiles(user_id)`
- `marked_at timestamptz null`
- `updated_at timestamptz`
- chave primária composta `(fundraiser_id, user_id)`.

O resumo arrecadado soma apenas contribuições com estado `paid` e valor registrado; se contribuições individuais não tiverem valor, a interface mostra a quantidade de pagamentos registrados, sem inventar um total monetário. A meta é opcional. Isso evita apresentar como arrecadado um valor que não foi informado.

### Auditoria

Uma tabela append-only `fundraiser_payment_audit` registra campanha, participante, estado anterior/novo, valor anterior/novo quando houver, ator, instante e origem da ação (`self` ou `owner`). O cliente não recebe permissão de escrita direta nessa tabela; uma função transacional/RPC validada atualiza a contribuição e grava o evento de auditoria atomicamente.

## Autorização e privacidade

- Leitura de eventos, interesses, campanhas e participantes exige sessão Google válida e perfil DTEC completo.
- Membros podem criar/remover somente seu próprio interesse.
- Dono/líder pode criar, editar, fechar ou cancelar eventos e campanhas. Dono mantém os poderes administrativos globais já estabelecidos; liderança pode ser revogada pelo dono.
- Um membro só pode marcar o próprio pagamento; dono pode registrar o pagamento de qualquer participante. Nenhum membro pode alterar os dados de outra pessoa.
- Atualização de status e auditoria ocorrem na mesma transação no servidor/banco, com validação de entrada e identidade derivada da sessão — nunca confiando em `user_id` fornecido pelo navegador como ator.
- Dados de contribuição, chave Pix e instruções não são acessíveis a visitantes anônimos. Chaves Pix são tratadas como dado pessoal de contato: opcionais, visíveis somente a membros autenticados, sem registro em logs de aplicação e editáveis apenas por administrador da campanha.
- Nomes e avatares usados nas listas vêm do perfil DTEC; e-mail, telefone e dados de autenticação não são copiados para tabelas de campanha.
- Limites de comprimento, valores monetários em centavos, datas válidas e estados enumerados são validados em banco e API.

## API e componentes

Rotas autenticadas agrupadas por recurso:

- `/api/events`: listar e criar; `/api/events/[id]`: editar/fechar; `/api/events/[id]/interest`: incluir/remover interesse próprio.
- `/api/fundraisers`: listar e criar; `/api/fundraisers/[id]`: editar/fechar; `/api/fundraisers/[id]/participants`: incluir participante; `/api/fundraisers/[id]/contributions/[userId]`: registrar/alterar estado dentro das permissões.

As rotas reutilizam o cliente Supabase server-side e respostas sem cache privado. Operações privilegiadas passam pela verificação de identidade/role e RPC transacional. A interface pode ser organizada em componentes `EventsFolder`, `EventDetail`, `FundraisersFolder`, `FundraiserDetail` e `ContributionRoster`, integrados ao `MuralWindow` existente; cartões e listas devem permanecer simples, sem canvas/Three.js.

## Migração e compatibilidade

Adicionar migração Supabase versionada e idempotente para tabelas, índices, RLS, grants e função de atualização auditável. O atual registro de interesse em Kart não deve ser apagado: planejar migração dos registros existentes para evento Kart apenas se existir evento equivalente com dados e consentimento suficientes; caso contrário, manter a tabela antiga intacta até migração explícita. A etapa nova deve ser compatível com murais e recados existentes.

## Testes de aceitação

1. Visitante anônimo recebe `401` e não consegue consultar eventos, campanhas, listas de contribuições ou auditoria.
2. Membro autenticado pode demonstrar e retirar interesse próprio; tentativas de alterar interesse alheio falham.
3. Membro comum não pode criar/editar/fechar campanhas ou eventos se a política reservar administração a dono/líder.
4. Membro pode marcar o próprio pagamento e não consegue marcar outro membro.
5. Dono pode marcar e corrigir o estado de qualquer participante; cada alteração cria exatamente um evento de auditoria.
6. Valores monetários são armazenados como centavos e o resumo só soma valores em contribuições `paid` com quantia registrada.
7. Estados pendentes são apresentados de forma discreta; identidade exibida usa avatar e nome completo DTEC.
8. Funcionalidade continua utilizável em desktop e celular com rolagem interna das janelas; demais murais continuam funcionando.
9. Lint, TypeScript, testes unitários e build passam; implantação de migração e aplicação é verificada em staging antes de produção.

## Decisões abertas antes da implementação

1. Confirmar se eventos e vaquinhas serão administrados apenas pelo dono/líder (recomendação) ou se membros comuns também podem criar.
2. Confirmar se contribuição individual terá valor opcional, como proposto, ou se a lista será apenas presença/estado pago sem valor por pessoa.
3. Definir limites de visibilidade das instruções/chave Pix e por quanto tempo campanhas encerradas e auditoria ficam retidas.

## Revisão de consistência

- O módulo não confunde interesse com presença confirmada nem status manual com pagamento verificado.
- Anonimato de visitantes permanece preservado; nomes e avatares públicos da sala não tornam visíveis dados de campanhas.
- Ator da alteração é sempre autenticado no servidor; RLS e RPC evitam autoatribuição de privilégios.
- A soma arrecadada tem semântica explícita quando valores individuais forem opcionais.
- O interesse legado de Kart é preservado durante a transição.
