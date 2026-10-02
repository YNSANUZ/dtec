# DTEC Virtual Office — Organização da equipe, pagamentos recorrentes e interação

**Status:** proposta de implementação aguardando revisão do usuário  
**Data:** 2026-10-02

## Objetivo

Estender os murais do DTEC para organizar eventos e contribuições coletivas, manter os recados participativos e corrigir problemas de interação da sala. Colegas autenticados podem indicar interesse, reagir aos avisos e consultar campanhas mensais que mostrem valor fixo por participante e situação pago/não pago. A interface permanece leve em janelas sobrepostas ao escritório.

## Escopo desta etapa

- Eventos configuráveis para atividades como futebol, paintball e kart.
- Lista de interessados: qualquer membro autenticado pode adicionar ou remover o próprio interesse.
- Avisos gerais continuam no mural de informações existente; não são convertidos em eventos.
- Avisos oferecem reações 👍 Curtir e 👎 Descurtir, com contadores e listas autenticadas de pessoas por reação.
- Vaquinhas com título, descrição, valor mensal fixo por participante, dia de vencimento e informações de pagamento.
- Cada vaquinha mostra o valor fixo mensal por participante, o dia de vencimento e a chave Pix, mas não mostra total arrecadado.
- Ciclos de pagamento reiniciam automaticamente no dia de vencimento de cada mês; pagamentos anteriores e sua auditoria são preservados.
- Cada participante pode registrar que pagou a própria contribuição; ADM ou MOD pode registrar ou corrigir o estado de qualquer participante.
- Listas de pagos e pendentes com avatar escolhido no perfil e nome completo; pendentes usam apresentação visual mais discreta.
- Na interface, usar os termos ADM e MOD no lugar de dono e líder. Somente ADM designa ou remove qualquer pessoa da sala como MOD; MOD é indicado por estrela depois do nome.
- Corrigir a instabilidade em que o personagem retorna à posição inicial ou teleporta, após reproduzir e localizar a causa.
- Reduzir o compositor de mensagens e evitar que o teclado virtual faça o cenário inteiro subir ou desaparecer no celular.
- Sem cobrança, processamento de Pix ou integração bancária nesta etapa.

## Fora de escopo

- Processamento, confirmação ou reconciliação automática de pagamentos.
- Cálculo de valores arrecadados/pendentes, divisão automática ou comprovantes.
- Anexos, uploads, notificações push/e-mail, períodos recorrentes além do ciclo mensal definido, comentários e exportação financeira.
- Transformar todo recado do mural em atividade ou campanha.
- Reações anônimas, várias reações atuais da mesma pessoa no mesmo aviso ou comentários em reações.

## Experiência

Os murais permanecem janelas leves sobre o cenário. A janela de lazer/eventos lista eventos ativos e quantas pessoas demonstraram interesse; ao abrir um evento, a pessoa vê a descrição e pode marcar/remover o próprio interesse. O interesse não significa confirmação de presença.

A pasta de vaquinhas apresenta campanhas abertas e encerradas. Em cada campanha, o cartão mostra título, valor fixo por pessoa, dia de vencimento e chave Pix/instruções de pagamento. Não exibe soma arrecadada, falta arrecadar, nem qualquer cálculo monetário agregado. A lista mostra primeiro quem está marcado como pago — avatar, nome completo e data do registro — e depois os pendentes com aparência visual mais discreta. O próprio membro pode mudar somente o próprio estado; ADM ou MOD pode marcar ou corrigir o estado de qualquer participante. O estado é um registro manual, não uma confirmação bancária.

Cada vencimento mensal inicia um novo ciclo e os estados começam como não pagos para os participantes ativos, sem apagar os registros dos ciclos anteriores. O vencimento é calculado usando o fuso `America/Sao_Paulo`; quando o dia escolhido não existir em um mês (por exemplo, dia 31 em fevereiro), o ciclo vence no último dia daquele mês. Ao trocar o dia de vencimento, a mudança vale a partir do próximo ciclo ainda não iniciado, sem reescrever ciclos já registrados.

Na lista da equipe e nas janelas de perfil, a nomenclatura visível é ADM/MOD. Os identificadores internos de papel podem continuar `owner`/`leader` para preservar compatibilidade de autorização; a camada visual traduz os papéis para ADM/MOD. A estrela de MOD aparece depois do nome. Apenas ADM tem controles para designar/remover MOD e pode selecionar qualquer perfil DTEC ativo.

Ao abrir/fechar o chat ou enviar mensagem, a cena e a posição atual do personagem não devem ser recriadas/reinicializadas. Como há relato de teleporte e retorno ao ponto inicial, a causa será diagnosticada em situações de mensagem aberta, persistência de presença, atualização de perfil e reconexão; a correção deve preservar a posição e a sincronização sem esconder o defeito com deslocamento visual artificial.

O compositor de mensagem será uma caixa compacta e discreta, em vez de um painel branco grande. Em celulares, a área 3D permanece ancorada ao viewport e o compositor reposiciona-se acima do teclado virtual usando as dimensões visíveis do viewport; abrir o teclado não deve deslocar o cenário para fora da tela. A janela de conversa pode rolar internamente e respeita áreas seguras do dispositivo.

No celular, as janelas usam largura disponível, rolagem interna e controles acionáveis por toque, sem exigir navegação para outra página.

No rodapé de cada aviso, dois controles mostram 👍 Curtir e 👎 Descurtir com seus totais. Cada membro autenticado mantém no máximo uma reação por aviso: selecionar a reação atual remove-a; selecionar a outra substitui a anterior. A própria reação fica visualmente selecionada e anunciada por `aria-pressed`. Ao tocar num contador, abre uma janela compacta de pessoas para aquela reação, com avatar e nome completo; nela há controles para alternar entre a lista de curtidas e a de descurtidas, sempre mostrando somente uma lista de cada vez. A lista tem rolagem interna no celular. Contadores refletem inclusões, remoções e trocas sem contar uma pessoa duas vezes.

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

### `mural_reactions`

- `message_id uuid references mural_messages(id) on delete cascade`
- `user_id uuid references profiles(user_id) on delete cascade`
- `reaction text not null` (`like`, `dislike`)
- `updated_at timestamptz not null default now()`
- chave primária composta `(message_id, user_id)`, permitindo no máximo uma reação atual por pessoa e aviso.

O estado de reação é substituível e removível; a tabela mantém apenas o estado atual, não um histórico de cada toque. A exclusão do aviso remove suas reações em cascata.

### `fundraisers`

- `id uuid primary key`
- `title text not null` (até 100 caracteres)
- `description text not null default ''` (até 1500 caracteres)
- `monthly_amount_cents bigint not null` (valor fixo devido por participante em cada ciclo, em centavos)
- `due_day smallint not null` (1–31, interpretado em `America/Sao_Paulo` e limitado ao último dia do mês quando necessário)
- `pix_key text null` e `payment_instructions text not null default ''` (opcionais e limitados)
- `status text not null default 'open'` (`open`, `closed`, `cancelled`)
- `created_by uuid references profiles(user_id)`
- `created_at`, `updated_at timestamptz`

### `fundraiser_contributions`

- `fundraiser_id uuid references fundraisers(id) on delete cascade`
- `user_id uuid references profiles(user_id) on delete cascade`
- `cycle_due_date date not null` (identifica o ciclo mensal, no fuso definido)
- `status text not null default 'pending'` (`pending`, `paid`)
- `marked_by uuid references profiles(user_id)`
- `marked_at timestamptz null`
- `updated_at timestamptz`
- chave primária composta `(fundraiser_id, user_id, cycle_due_date)`.

O valor fixo vem da campanha, não de um lançamento individual. A interface não soma os valores dos participantes e não calcula restante arrecadado.

### Auditoria

Uma tabela append-only `fundraiser_payment_audit` registra campanha, participante, ciclo, estado anterior/novo, ator, instante e origem da ação (`self`, `adm` ou `mod`). O cliente não recebe permissão de escrita direta nessa tabela; uma função transacional/RPC validada atualiza o estado e grava o evento de auditoria atomicamente. Ciclos vencidos permanecem consultáveis por administradores, sem expor valores agregados.

## Autorização e privacidade

- Leitura de eventos, interesses, campanhas e participantes exige sessão Google válida e perfil DTEC completo.
- Leitura de contagens e listas de reações exige sessão Google válida e perfil DTEC completo; visitantes anônimos não consultam nomes de quem reagiu.
- Membros podem criar/remover somente seu próprio interesse.
- ADM/MOD pode criar, editar, fechar ou cancelar eventos e campanhas. ADM mantém o poder administrativo global e somente ADM designa/remove MOD; MOD pode ser revogado por ADM.
- Um membro só pode marcar o próprio pagamento; ADM/MOD pode registrar ou corrigir o pagamento de qualquer participante. Nenhum membro comum pode alterar o estado de outra pessoa.
- Atualização de status e auditoria ocorrem na mesma transação no servidor/banco, com validação de entrada e identidade derivada da sessão — nunca confiando em `user_id` fornecido pelo navegador como ator.
- Estado de pagamento, histórico de ciclos, valor da contribuição por pessoa, chave Pix e instruções não são acessíveis a visitantes anônimos. Estes dados ficam visíveis somente a membros autenticados; chave Pix é omitida de logs e editável apenas por ADM/MOD autorizado na campanha.
- Nomes e avatares usados nas listas vêm do perfil DTEC; e-mail, telefone e dados de autenticação não são copiados para tabelas de campanha.
- Limites de comprimento, valores monetários em centavos, datas válidas e estados enumerados são validados em banco e API.
- Cada membro autenticado pode inserir, substituir ou remover somente a própria reação; a identidade do ator é obtida da sessão e reforçada por RLS/constraints.

## API e componentes

Rotas autenticadas agrupadas por recurso:

- `/api/events`: listar e criar; `/api/events/[id]`: editar/fechar; `/api/events/[id]/interest`: incluir/remover interesse próprio.
- `/api/fundraisers`: listar e criar; `/api/fundraisers/[id]`: editar/fechar e configurar vencimento/valor; `/api/fundraisers/[id]/participants`: incluir/remover participante; `/api/fundraisers/[id]/contributions/[userId]`: registrar estado pago/não pago do ciclo atual dentro das permissões.
- `/api/mural/messages/[id]/reactions`: ler contagens/lista autenticada e registrar, trocar ou remover a reação própria. Respostas agrupam nomes e avatares por tipo e devolvem somente o grupo solicitado/selecionado para a janela.

As rotas reutilizam o cliente Supabase server-side e respostas sem cache privado. Operações privilegiadas passam pela verificação de identidade/role e RPC transacional. O ciclo atual é determinado pelo dia de vencimento e data local de São Paulo; consultas/alterações devem criar o estado pendente do novo ciclo atomicamente quando necessário, sem rotina que apague o histórico. A interface pode ser organizada em componentes `EventsFolder`, `EventDetail`, `FundraisersFolder`, `FundraiserDetail`, `ContributionRoster` e `NoticeReactions`, integrados ao `MuralWindow` existente; cartões, reações e listas devem permanecer simples, sem canvas/Three.js.

## Migração e compatibilidade

Adicionar migração Supabase versionada e idempotente para tabelas, índices, RLS, grants e função de atualização auditável. O atual registro de interesse em Kart não deve ser apagado: planejar migração dos registros existentes para evento Kart apenas se existir evento equivalente com dados e consentimento suficientes; caso contrário, manter a tabela antiga intacta até migração explícita. A etapa nova deve ser compatível com murais e recados existentes.

## Testes de aceitação

1. Visitante anônimo recebe `401` e não consegue consultar eventos, campanhas, listas de contribuições ou auditoria.
2. Membro autenticado pode demonstrar e retirar interesse próprio; tentativas de alterar interesse alheio falham.
3. Membro comum não pode criar/editar/fechar campanhas ou eventos; ADM/MOD podem fazê-lo.
4. Membro pode marcar o próprio pagamento e não consegue marcar outro membro.
5. ADM e MOD podem marcar e corrigir o estado de qualquer participante; cada alteração cria exatamente um evento de auditoria.
6. O valor fixo individual é armazenado como centavos; a interface mostra valor, vencimento e Pix sem totalizar arrecadação.
7. Ao entrar em novo ciclo mensal, todos os participantes começam como pendentes; os ciclos e auditorias antigos continuam consultáveis.
8. Estados pendentes são apresentados de forma discreta; identidade exibida usa avatar e nome completo DTEC.
9. Rótulos visíveis são ADM/MOD; apenas ADM pode designar qualquer perfil ativo como MOD e a estrela aparece depois do nome.
10. A posição do personagem não reseta nem teleporta ao abrir/fechar/enviar chat, após perfil editar, ou ao reconectar.
11. Composer de chat é compacto; em celular teclado abre sem deslocar cenário, com composer visível acima dele e rolagem interna.
12. Funcionalidade continua utilizável em desktop e celular com rolagem interna das janelas; demais murais continuam funcionando.
13. Pessoa autenticada pode curtir ou descurtir cada aviso; uma reação substitui a outra, e repetir a mesma reação a remove.
14. Contadores correspondem às reações únicas; tocar em cada contador mostra avatar/nome completos exclusivamente da categoria correspondente, e é possível alternar a lista no mesmo diálogo sem exibir ambas simultaneamente.
15. Visitante anônimo não pode reagir nem acessar contadores detalhados/listas de nomes; tentativa à API retorna `401`.
16. Reações são apagadas quando um aviso é apagado; desktop e celular mantêm controles acessíveis, contadores legíveis e rolagem própria na lista.
17. Lint, TypeScript, testes unitários e build passam; implantação de migração e aplicação é verificada em staging antes de produção.

## Decisões abertas antes da implementação

1. Confirmar participação: participantes entram por conta própria, são incluídos pelo ADM/MOD, ou ambos (recomendação: ambos).
2. Confirmar se ciclos anteriores e lista de auditoria ficam retidos indefinidamente ou até remoção explícita pelo ADM (recomendação: manter histórico enquanto a campanha existir; só ADM remove campanha).

## Revisão de consistência

- O módulo não confunde interesse com presença confirmada nem status manual com pagamento verificado.
- Anonimato de visitantes permanece preservado; nomes e avatares públicos da sala não tornam visíveis dados de campanhas.
- Ator da alteração é sempre autenticado no servidor; RLS e RPC evitam autoatribuição de privilégios.
- Nenhum total arrecadado ou valor restante é mostrado; a campanha exibe somente valor fixo por participante e status pago/não pago.
- O interesse legado de Kart é preservado durante a transição.
- Há somente uma reação atual por membro/aviso; trocar ou remover votos atualiza contadores sem duplicação.
- Reações e listas de identidade estão protegidas pelo mesmo requisito de autenticação do mural.
- O início de novo ciclo cria novos estados pendentes e não altera registros de ciclos passados.
- Os rótulos ADM/MOD são de apresentação; a autorização continua determinada no servidor e não pelo texto/ícone.
- O ajuste de chat/mobile não re-monta nem redimensiona indevidamente a cena 3D.
