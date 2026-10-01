# Autenticação Google do DTEC — Especificação

## Objetivo

Permitir que qualquer pessoa com uma conta Google autentique-se no DTEC Virtual Office. Visitantes anônimos podem observar a sala, mas somente usuários autenticados com perfil concluído podem controlar o próprio personagem, dançar, conversar e editar o avatar.

## Escopo

Esta etapa entrega autenticação Google real, persistência de sessão, cadastro inicial do personagem, recuperação do perfil em visitas futuras e saída da conta. Não inclui ainda sincronização em tempo real entre computadores, moderação, vaquinhas ou mural persistente.

## Fluxo do usuário

1. O visitante acessa a sala e vê os personagens em movimento.
2. Sem sessão, aparecem apenas os controles públicos do cabeçalho e o acesso Google. Os botões `Dançar`, `Conversar` e `Meu avatar` permanecem ocultos.
3. O acesso é composto por um retângulo preto translúcido com o texto branco `Entrar` e uma bolinha branca sobreposta à esquerda contendo o logotipo colorido do Google.
4. Ao clicar, o navegador inicia o OAuth do Google na própria aba.
5. Após o retorno autorizado, o aplicativo valida e persiste a sessão.
6. Se ainda não houver perfil para o usuário, abre o seletor de nome e personagem sobre o escritório visível.
7. Ao salvar, o perfil fica vinculado ao identificador imutável do usuário autenticado.
8. Se já houver perfil, o usuário entra diretamente na sala com nome, avatar e controles disponíveis.
9. Em visitas futuras, a sessão válida é restaurada automaticamente.
10. O menu do perfil oferece `Sair da conta`; após sair, os controles de interação desaparecem e o aplicativo volta ao modo visitante.

Cancelamento ou erro no Google retorna à sala em modo visitante e apresenta uma mensagem curta, sem abrir automaticamente o seletor de personagem.

## Arquitetura

### Autenticação

- Supabase Auth com provedor Google aberto a qualquer domínio.
- Next.js 16 App Router com `@supabase/ssr` e `@supabase/supabase-js`.
- OAuth Authorization Code com PKCE.
- Rota `app/auth/callback/route.ts` troca o código por uma sessão e redireciona para `/`.
- `proxy.ts` renova tokens expirados e devolve cookies atualizados com respostas não armazenáveis por cache compartilhado.
- O redirecionamento autorizado de produção é `https://dtec-kappa.vercel.app/auth/callback`; localhost é permitido somente em desenvolvimento.

### Estado da interface

A tela distingue explicitamente quatro estados:

- `loading`: autenticação sendo restaurada; nenhuma ação privada aparece.
- `anonymous`: somente observação e botão Google.
- `authenticated-needs-profile`: sessão válida e seletor de personagem aberto.
- `ready`: sessão válida, perfil carregado e ações do personagem liberadas.

O estado `created` baseado apenas em `localStorage` deixa de conceder acesso. Dados antigos locais podem ser usados como sugestão no primeiro cadastro, mas nunca como prova de identidade.

### Perfil persistente

Tabela `profiles`:

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `display_name text not null`, limitado a 18 caracteres após remoção de espaços nas extremidades
- `avatar_id text not null`, aceitando somente os seis IDs existentes: `a`, `c`, `f`, `j`, `n`, `r`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

O e-mail e a senha não são copiados para `profiles`. O aplicativo usa `auth.users.id` como vínculo. Nome e avatar podem ser alterados pelo próprio titular.

### Autorização e RLS

- Leitura pública de perfis é limitada aos campos necessários para representar colegas na sala: `user_id`, `display_name` e `avatar_id`.
- Inserção e atualização só são permitidas quando `auth.uid() = user_id`.
- Exclusão de perfil pelo cliente não faz parte desta etapa.
- A interface oculta ações privadas, mas a segurança não depende disso: futuras gravações no backend exigirão sessão válida e políticas RLS.

## Segurança e privacidade

- O aplicativo nunca recebe nem armazena a senha do Google.
- Não serão solicitados escopos adicionais de Google Drive, Gmail, contatos ou calendário.
- Tokens do provedor Google não serão persistidos pelo aplicativo; somente a sessão do Supabase será mantida.
- Chaves públicas do Supabase podem ficar no navegador; nenhuma chave secreta ou `service_role` será incluída no frontend ou no GitHub.
- Rotas de autenticação e respostas que renovam sessão usam política de cache privado/sem armazenamento compartilhado.
- Mensagens de erro exibidas ao usuário não revelam tokens, códigos OAuth nem detalhes internos.

## Configuração externa

O Supabase precisa ter o provedor Google habilitado. O Google Cloud precisa de cliente OAuth Web com a URL de callback fornecida pelo Supabase. O Supabase precisa ter a URL pública do Vercel e a callback do aplicativo na lista de redirecionamentos permitidos. No Vercel serão configuradas apenas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Segredos do cliente Google permanecem no painel do Supabase e nunca entram no repositório.

## Tratamento de falhas

- Ausência de variáveis em desenvolvimento: mostrar acesso indisponível sem derrubar a sala.
- OAuth cancelado ou callback inválido: retornar como visitante e mostrar aviso discreto.
- Sessão expirada: tentar renovação; se falhar, limpar o estado autenticado e esconder ações privadas.
- Perfil inexistente: abrir o cadastro apenas depois da sessão confirmada.
- Falha ao salvar perfil: manter o seletor aberto e preservar os dados digitados para nova tentativa.

## Testes e critérios de aceite

- Visitante não vê controles privados nem o seletor de personagem automaticamente.
- O acesso apresenta bolinha branca com o G e texto branco sobre fundo preto translúcido.
- O clique inicia OAuth Google com callback na mesma origem e mesma aba.
- Usuário autenticado sem perfil vê o seletor.
- Usuário autenticado com perfil recupera nome/avatar e vê os controles.
- Recarregar a página mantém uma sessão válida.
- Sair remove o estado autenticado e volta ao modo visitante.
- Um usuário não consegue alterar o perfil de outro pelas APIs do banco.
- Erros de autenticação não interrompem a renderização da sala.
- Lint, testes automatizados e build de produção passam antes da publicação.

## Fora do escopo desta etapa

- Presença e movimentação sincronizadas em tempo real.
- Chat compartilhado e persistente entre usuários.
- Papéis de administrador e moderação.
- Vaquinhas, pagamentos, mural e aniversariantes persistentes.
- Restrição por domínio corporativo.
