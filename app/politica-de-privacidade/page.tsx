import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade | DTEC Virtual Office",
  description: "Como o DTEC Virtual Office trata os dados de quem utiliza o escritório virtual.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <article className="legal-document">
        <Link className="legal-back" href="/">← Voltar ao escritório</Link>
        <p className="legal-eyebrow">DTEC VIRTUAL OFFICE</p>
        <h1>Política de Privacidade</h1>
        <p className="legal-updated">Última atualização: 1º de outubro de 2026</p>

        <p>
          Esta página explica quais dados são tratados quando você acessa o DTEC Virtual Office,
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
            <strong>Perfil do escritório:</strong> o nome de exibição e o identificador do avatar
            que você escolhe são salvos no banco de dados do aplicativo e associados à sua conta.
          </li>
          <li>
            <strong>Dados técnicos:</strong> os serviços que hospedam e protegem o app podem
            processar informações técnicas necessárias para entregar a página, manter a
            autenticação e diagnosticar falhas, conforme as políticas desses serviços.
          </li>
          <li>
            <strong>Conversas nesta versão:</strong> as cinco mensagens recentes são mantidas no
            armazenamento local do navegador usado por você. Nesta versão, elas não são enviadas
            ao servidor nem sincronizadas com os navegadores dos colegas.
          </li>
        </ul>

        <h2>2. Finalidades e visibilidade</h2>
        <p>
          Usamos os dados da conta para autenticar você e proteger a associação entre a conta
          Google e o perfil. O nome e o avatar servem para representar você no escritório. Como o
          aplicativo permite a leitura de perfis para exibição do ambiente, escolha um nome de
          exibição apropriado e não inclua informações sensíveis nele.
        </p>
        <p>
          O login Google não dá ao DTEC acesso à sua senha Google. O aplicativo solicita apenas
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
          Os dados do perfil permanecem armazenados enquanto a conta e o perfil forem mantidos no
          aplicativo. O histórico de conversas local permanece no navegador até ser removido pelo
          usuário ou pelo próprio navegador. Aplicamos controles técnicos de autenticação e acesso,
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
          O DTEC Virtual Office está em evolução. Esta política descreve as funções atualmente
          implementadas e será atualizada antes de novas funções passarem a tratar dados adicionais.
        </p>
        <Link className="legal-back legal-bottom-link" href="/">Voltar ao escritório</Link>
      </article>
    </main>
  );
}
