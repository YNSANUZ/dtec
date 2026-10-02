import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de Serviço | DTEC Virtual Office",
  description: "Condições de uso do DTEC Virtual Office.",
};

export default function TermsOfServicePage() {
  return (
    <main className="legal-page">
      <article className="legal-document">
        <Link className="legal-back" href="/">← Voltar ao escritório</Link>
        <p className="legal-eyebrow">DTEC VIRTUAL OFFICE</p>
        <h1>Termos de Serviço</h1>
        <p className="legal-updated">Última atualização: 1º de outubro de 2026</p>

        <p>
          Estes termos descrevem as condições para acessar o DTEC Virtual Office, um ambiente
          virtual interativo da equipe DTEC. Ao usar o aplicativo, você concorda em utilizá-lo de
          forma responsável e de acordo com estas condições.
        </p>

        <h2>1. Conta e perfil</h2>
        <p>
          O acesso com Google confirma sua conta; depois, você pode escolher um nome de exibição e
          um avatar. Você é responsável por manter o controle da sua conta Google e por escolher
          um nome adequado. Não tente se passar por outra pessoa nem usar a conta de terceiros.
        </p>

        <h2>2. Uso permitido</h2>
        <p>
          Use o escritório para interação e comunicação respeitosa relacionada à equipe. Não use o
          serviço para assediar, ameaçar, discriminar, publicar conteúdo ilegal, comprometer a
          segurança do sistema ou interferir no acesso de outras pessoas. Não inclua senhas,
          informações financeiras ou outros dados sensíveis em nomes ou mensagens.
        </p>

        <h2>3. Recursos disponíveis</h2>
        <p>
          O serviço pode mudar à medida que é desenvolvido. Na versão atual, a sala oferece uma
          experiência visual interativa, escolha de perfil e recursos de demonstração. As mensagens
          recentes ficam no navegador usado por você; não há sincronização de chat entre colegas.
          Quadros e informações exibidos podem ser demonstrativos e não substituem comunicados
          oficiais da DTEC.
        </p>
        <p>
          O DTEC Virtual Office não processa pagamentos. Qualquer informação de contribuição ou
          pagamento que venha a ser apresentada em versões futuras não representa uma transação
          realizada pelo aplicativo, salvo se isso for expressamente informado em condições próprias.
        </p>

        <h2>4. Disponibilidade e alterações</h2>
        <p>
          O serviço é fornecido como está em sua versão atual, podendo haver interrupções,
          manutenção ou mudanças de funcionalidades. Podemos restringir atividades que prejudiquem
          a segurança, a disponibilidade ou o uso adequado do ambiente.
        </p>

        <h2>5. Privacidade e contato</h2>
        <p>
          O tratamento de dados pessoais está descrito na <Link href="/politica-de-privacidade">Política
          de Privacidade</Link>. Para dúvidas sobre estes termos ou sobre sua conta, entre em contato
          pelo e-mail <a href="mailto:ynsanuz@gmail.com">ynsanuz@gmail.com</a>.
        </p>

        <Link className="legal-back legal-bottom-link" href="/">Voltar ao escritório</Link>
      </article>
    </main>
  );
}
