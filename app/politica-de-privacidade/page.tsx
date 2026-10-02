import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade | CuboChat",
  description: "Como o CuboChat trata os dados de quem utiliza seus ambientes virtuais.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <article className="legal-document">
        <Link className="legal-back" href="/">← Voltar ao CuboChat</Link>
        <p className="legal-eyebrow">CUBOCHAT</p>
        <h1>Política de Privacidade</h1>
        <p className="legal-updated">Última atualização: 2 de outubro de 2026</p>

        <p>
          Esta página explica quais dados são tratados quando você acessa o CuboChat,
          para que são usados e como falar com a equipe responsável pelo aplicativo.
        </p>

        <h2>1. Dados tratados</h2>
        <ul>
          <li>
            <strong>Dados da conta Google:</strong> ao escolher “Entrar com Google”, o Google
            confirma sua identidade e compartilha com o serviço de autenticação os dados básicos
            autorizados no login, como identificador da conta, endereço de e-mail e, quando
            fornecidos, nome e imagem de perfil.
          </li>
          <li>
            <strong>Perfil global:</strong> nome e avatar são necessários para participar.
            Cargo/descrição, biografia, aniversário (somente dia e mês), WhatsApp e Instagram são opcionais.
            Nome e avatar aparecem na sala para qualquer pessoa que tenha o link, inclusive visitantes
            sem login. O aniversário aparece no mural e os demais dados opcionais aparecem no perfil
            somente para participantes autenticados. O WhatsApp abre um link wa.me fora do app.
            O identificador do Instagram, se fornecido, fica associado ao perfil para futuros recursos de contato.
          </li>
          <li>
            <strong>Presença:</strong> o app guarda a posição aproximada mais recente do personagem
            para mantê-lo no escritório mesmo quando estiver offline. O estado de movimento e o
            horário da última atividade são usados para sincronizar personagens; a indicação de
            online desaparece após 45 segundos sem atualização.
          </li>
          <li>
            <strong>Interesse em atividades:</strong> se você registrar interesse em Kart, seu nome,
            avatar e descrição opcional aparecem na lista compartilhada de interessados. Isso não
            confirma presença nem compromisso.
          </li>
          <li>
            <strong>Dados técnicos:</strong> os serviços que hospedam e protegem o app podem
            processar informações técnicas necessárias para entregar a página, manter a
            autenticação e diagnosticar falhas, conforme as políticas desses serviços.
          </li>
          <li>
            <strong>Conversas:</strong> as cinco mensagens mais recentes são guardadas no servidor
            e aparecem para todos que acessam a sala, inclusive visitantes sem login. Apenas
            participantes autenticados podem enviar mensagens. Não compartilhe dados sensíveis no chat.
          </li>
        </ul>

        <h2>2. Finalidades e visibilidade</h2>
        <p>
          Usamos os dados da conta para autenticar você e proteger a associação entre a conta
          Google e o perfil. O nome e avatar identificam a pessoa na sala e podem ser vistos por
          qualquer visitante com o link. Visitantes não autenticados não podem abrir os dados
          opcionais nem interagir; participantes autenticados podem consultar os dados que você
          decidiu compartilhar. Não inclua conteúdo sensível na biografia.
        </p>
        <p>
          O login Google não dá ao CuboChat acesso à sua senha Google. O aplicativo solicita apenas
          as informações básicas necessárias à autenticação; não usa sua conta para acessar Gmail,
          Drive ou outros serviços Google.
        </p>

        <h2>3. Serviços envolvidos</h2>
        <p>
          A autenticação e o armazenamento de perfis são fornecidos pelo Supabase. O login é
          realizado pelo Google, e o site é entregue por sua plataforma de hospedagem. Esses
          fornecedores recebem os dados necessários para prestar seus serviços e os tratam de
          acordo com seus próprios termos e políticas de privacidade.
        </p>

        <h2>4. Retenção, segurança e compartilhamento</h2>
        <p>
          Os dados do perfil e a última posição do personagem permanecem armazenados enquanto a
          conta e o perfil forem mantidos no aplicativo. A indicação de online deixa de aparecer
          após 45 segundos sem atualização. O histórico do chat mantém somente as cinco mensagens
          mais recentes; cada nova mensagem remove a mais antiga. Aplicamos controles técnicos de autenticação e acesso,
          mas nenhum serviço conectado à internet pode garantir segurança absoluta.
        </p>
        <p>
          Não vendemos dados pessoais. O acesso é limitado ao necessário para operar o aplicativo,
          prestar suporte, manter a segurança ou cumprir obrigações legais. Podemos atualizar esta
          política se as funções ou os serviços usados pelo app mudarem.
        </p>

        <h2>5. Seus direitos e contato</h2>
        <p>
          Para solicitar acesso, correção ou exclusão dos dados do perfil, ou esclarecer dúvidas
          sobre privacidade, escreva para <a href="mailto:ynsanuz@gmail.com">ynsanuz@gmail.com</a>.
          A solicitação será analisada e atendida conforme a legislação aplicável.
        </p>

        <p className="legal-note">
          Dia e mês de aniversário, WhatsApp, Instagram, cargo e biografia são opcionais. Você pode corrigir ou
          remover esses dados na edição do perfil. A liderança da sala é designada pelo dono.
        </p>
        <Link className="legal-back legal-bottom-link" href="/">Voltar ao CuboChat</Link>
      </article>
    </main>
  );
}
