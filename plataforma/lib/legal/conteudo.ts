// Conteúdo legal do hotsite (Aviso de Privacidade e Termos de Uso).
//
// Texto transcrito fielmente dos documentos oficiais do Colégio Santo Agostinho
// (docs/privacidade-csa.pdf e docs/termos-uso-csa.pdf), apenas com as quebras de
// linha/hifenizações do PDF normalizadas. Estruturado para renderização direta no
// hotsite, sem depender de biblioteca de Markdown.

export type BlocoLegal =
  | { tipo: "p"; texto: string }
  | { tipo: "sub"; texto: string }
  | { tipo: "lista"; itens: string[] };

export interface SecaoLegal {
  titulo: string;
  blocos: BlocoLegal[];
}

export interface DocumentoLegal {
  slug: "privacidade" | "termos";
  titulo: string;
  descricao: string;
  secoes: SecaoLegal[];
}

export const AVISO_PRIVACIDADE: DocumentoLegal = {
  slug: "privacidade",
  titulo: "Aviso de Privacidade do Site",
  descricao:
    "Este Aviso de Privacidade informa sobre os dados que coletamos de você quando você usa nosso site. Ao coletar essas informações, estamos agindo como um controlador de dados e, por lei, somos obrigados a fornecer informações sobre nós, sobre o porquê e como usamos seus dados e sobre os direitos que você tem sobre os seus dados.",
  secoes: [
    {
      titulo: "1. Quem somos?",
      blocos: [
        {
          tipo: "p",
          texto:
            "Nós somos o Colégio Santo Agostinho - Leblon, Rua José Linhares, 88 - Rio de Janeiro, Leblon. CNPJ: 33.667.098/0001-94.",
        },
        {
          tipo: "p",
          texto:
            "Os detalhes de contato do nosso encarregado de proteção de dados são: EVERCO GESTÃO ESTRATÉGICA EM INFORMAÇÃO E TECNOLOGIA, inscrita no CNPJ sob o nº 34.211.255/0001-15, com endereço na Rua Nagib Miguel, nº 3116, SALA 22 e 23, Jardim do Bosque, São João da Boa Vista/SP, e-mail dpo@csa.com.br, representado por seu sócio proprietário Nero Bertolucci.",
        },
      ],
    },
    {
      titulo: "2. Quando você usa nosso site",
      blocos: [
        { tipo: "sub", texto: "2.1 Sobre os cookies" },
        {
          tipo: "p",
          texto:
            "Quando você visualiza as informações que disponibilizamos em nosso site, vários cookies são usados por nós e por terceiros para permitir que o site funcione.",
        },
        {
          tipo: "p",
          texto:
            "Alguns dos cookies que usamos são estritamente necessários para o funcionamento do nosso site, e não pedimos o seu consentimento para colocá-los no seu computador.",
        },
        { tipo: "sub", texto: "2.2 O que são cookies?" },
        {
          tipo: "p",
          texto:
            "Os cookies são pequenos arquivos de texto, utilizados para armazenamento de informações. Estes cookies são colocados no navegador do seu computador pelos sites que você visita. Eles são amplamente usados para fazer com que os sites funcionem com mais eficiência, além de fornecer informações aos proprietários do site.",
        },
        { tipo: "sub", texto: "2.3 Desativação dos cookies" },
        {
          tipo: "p",
          texto:
            "Com exceção dos cookies necessários, que permitem o funcionamento do site, você não é obrigado a autorizar a utilização dos cookies.",
        },
        {
          tipo: "p",
          texto:
            "Nosso site coleta automaticamente apenas os cookies classificados como necessários, que são utilizados para abrir a nossa página e permitir que você consiga navegar e acessar as funcionalidades básicas do site.",
        },
        {
          tipo: "p",
          texto:
            "As demais categorias de cookies necessitam do seu consentimento para serem ativadas. Desta forma, caso deseje ter uma melhor e completa experiência em nosso site, sugerimos que você autorize todos os cookies no banner de gestão de cookies localizado no canto inferior esquerdo do nosso site.",
        },
        {
          tipo: "sub",
          texto: "2.4 O que acontece se você rejeitar um ou vários cookies?",
        },
        {
          tipo: "p",
          texto:
            "Caso você opte por não autorizar alguns ou todos os cookies, o site pode não funcionar como esperado. Lembre-se de que você sempre pode limpar os cookies nas configurações do seu navegador.",
        },
        { tipo: "sub", texto: "2.5 Como escolher as preferências de cookies?" },
        {
          tipo: "p",
          texto:
            "Você pode alterar suas preferências de cookie a qualquer momento, clicando no ícone de privacidade que se encontra sempre no canto inferior esquerdo de nosso site, escolhendo quais deseja aceitar/rejeitar. Talvez você tenha que atualizar a página para que suas configurações entrem em vigor e para ajustar suas preferências.",
        },
        { tipo: "sub", texto: "2.6 Tipos de cookies e suas finalidades" },
        {
          tipo: "p",
          texto:
            "Os cookies podem coletar dados para diferentes finalidades relacionadas às funcionalidades de nosso Site. Confira a seguir os tipos que utilizamos:",
        },
        {
          tipo: "p",
          texto:
            "1. Cookie contendo código de identificação do site no serviço Google Analytics. Utilizados para registrar um número individual de identificação cujo propósito é gerar dados estatísticos de visitas ao site pelo serviço. Nome do cookie: todos com prefixo \u201c_ga\u201d. Tempo máximo de vigência: 2 anos.",
        },
        {
          tipo: "p",
          texto:
            "2. Meta Pixel. Mediante seu consentimento para a categoria Marketing, é utilizado para medir a efetividade de campanhas e registrar eventos como visualização de página, conclusão de inscrição e efetivação de matrícula. Pode utilizar cookies como \u201c_fbp\u201d e \u201c_fbc\u201d e compartilhar dados de evento com a Meta. A autorização pode ser revogada a qualquer momento no botão Privacidade.",
        },
        {
          tipo: "p",
          texto:
            "3. RD Station. Mediante seu consentimento para a categoria Marketing, o script de rastreamento é utilizado para atribuir a origem da visita e das conversões de admissão. Pode utilizar o cookie \u201c__trf.src\u201d. Eventos transacionais necessários à operação do processo seletivo são tratados no servidor conforme as bases legais aplicáveis, sem depender do carregamento do script no navegador.",
        },
        {
          tipo: "p",
          texto:
            "4. Cookies de consentimento e sessão. O cookie \u201ccsa_consent\u201d registra suas preferências por até um ano. O cookie \u201csid\u201d é estritamente necessário para manter a sessão autenticada no portal e possui duração limitada. Cookies técnicos do TOTVS podem ser usados no processamento server-side sem serem expostos diretamente ao navegador.",
        },
        {
          tipo: "sub",
          texto: "2.7 Sua privacidade — tipos de funcionalidades do nosso site",
        },
        {
          tipo: "p",
          texto:
            "Nosso site possui links para sites e aplicativos de terceiros. Note que, dentro destes sites e aplicativos de terceiros, você estará sujeito a outros termos de uso, avisos e/ou políticas de privacidade. Nosso Aviso de Privacidade não é válido no site de terceiros. A existência desses links não significa nenhuma relação de endosso ou de patrocínio entre o Colégio Santo Agostinho - Leblon e esses terceiros, além de não termos nenhuma responsabilidade com relação a terceiros.",
        },
        {
          tipo: "p",
          texto:
            "Ao navegar em nosso site, você entende que podemos coletar, tratar e armazenar dados pessoais sobre você quando julgarmos necessário à prestação de nossos serviços, para as seguintes finalidades:",
        },
        {
          tipo: "lista",
          itens: [
            "Fale Conosco: o formulário é necessário para o envio de mensagem por parte do usuário. Os dados solicitados são: nome, e-mail, telefone, assunto e mensagem. A hipótese de tratamento para esses dados é o seu consentimento, previsto no art. 7º, I, da LGPD. O prazo de armazenamento é de 5 (cinco) anos, contados a partir da data de conclusão do atendimento.",
            "Área Restrita: nesta seção, você será direcionado para o sistema TOTVS, onde deverão ser observados os avisos de privacidade do fornecedor. O login é necessário para que os responsáveis legais e financeiros dos alunos acessem informações pedagógicas e financeiras dos alunos.",
            "Trabalhe Conosco: o usuário poderá encaminhar seu currículo para participar de processos seletivos de trabalho. Os dados solicitados são: nome, e-mail, telefone, área de atuação, identificação de necessidades especiais e anexo currículo. A hipótese de tratamento para esses dados é o seu consentimento, previsto no art. 7º, I, da LGPD. O prazo de armazenamento é de 6 (seis) meses, caso o candidato não seja aprovado na seleção. Para os candidatos que se tornem colaboradores do CSA, o currículo será armazenado até 5 (cinco) anos após a rescisão do contrato de trabalho.",
            "Capela online: nesta seção, o usuário poderá acender uma vela virtual, em intenção de terceiros. Os dados solicitados são o nome de quem solicita a oração, e-mail do solicitante e a intenção. A hipótese de tratamento para esses dados é o seu consentimento, previsto no art. 7º, I, da LGPD. O prazo de armazenamento é indeterminado.",
            "Novos alunos: área destinada para envio de solicitação de informação para processo de admissão de novos alunos. Os dados solicitados são: nome, e-mail e série/ano em que o aluno deseja ingressar. A hipótese de tratamento para esses dados é o seu consentimento, previsto no art. 7º, I, da LGPD. O prazo de armazenamento é de 1 (um) ano, caso o candidato não seja aprovado na seleção. Para os candidatos admitidos como alunos, o formulário será armazenado até 5 (cinco) anos após a rescisão do contrato de prestação de serviço educacional.",
          ],
        },
        {
          tipo: "p",
          texto:
            "Ao enviar as informações pelos canais de atendimento disponíveis no site, você aceita os termos do Aviso de Privacidade, conforme disclaimer abaixo dos formulários (antes do botão enviar). Você tem o direito de revogar o seu consentimento a qualquer momento, através dos contatos mencionados neste Aviso de Privacidade.",
        },
      ],
    },
    {
      titulo: "3. As informações podem ser compartilhadas?",
      blocos: [
        {
          tipo: "p",
          texto:
            "Compartilhamos os seus dados com terceiros, a fim de viabilizar o tratamento dos seus dados pessoais para as finalidades descritas anteriormente. Em hipótese alguma, vendemos ou compartilhamos seus dados pessoais com terceiros sem o seu consentimento ou permissão legal.",
        },
      ],
    },
    {
      titulo: "4. Segurança dos dados",
      blocos: [
        {
          tipo: "p",
          texto:
            "A segurança e proteção de dados pessoais do Colégio Santo Agostinho - Leblon é uma prioridade. Nós estabelecemos processos e controles para prevenção, detecção e resposta a incidentes e proteção dos dados de acessos e usos não autorizados, garantindo a gestão do risco de segurança, inclusive cibernética, e a construção de um alicerce de segurança.",
        },
        {
          tipo: "p",
          texto:
            "Consideramos que a informação deve ser protegida independentemente de onde ela esteja, seja em um prestador de serviço, ou em parceiro, em todo o seu ciclo de vida, desde o momento que ela é coletada, passando pelo processamento, transmissão, armazenamento, análise e seu descarte.",
        },
        {
          tipo: "p",
          texto:
            "Cuidamos dos dados, seguindo padrões rígidos de segurança e confidencialidade, para fornecer aos nossos usuários um ambiente seguro e confiável. Usamos ferramentas e tecnologias para manter a integridade e confidencialidade das informações e protegê-las de acessos não autorizados.",
        },
        {
          tipo: "p",
          texto:
            "As diretrizes de proteção dos dados da organização estão formalizadas na Política de Proteção de Dados Pessoais do Colégio Santo Agostinho - Leblon.",
        },
      ],
    },
    {
      titulo: "5. Vigência do tratamento dos dados",
      blocos: [
        {
          tipo: "p",
          texto:
            "O prazo pelo qual o Colégio Santo Agostinho - Leblon armazena os Dados Pessoais coletados no site depende do propósito e da natureza do seu tratamento. Os dados serão processados pelo período necessário para o cumprimento de obrigações legais, regulatórias e contratuais, para continuar a fornecer e aprimorar nossos serviços, para o gerenciamento de riscos, para o exercício regular de direito em processos administrativos, judiciais e arbitrais e para as demais finalidades previstas neste Aviso de Privacidade.",
        },
        {
          tipo: "p",
          texto:
            "Caso seus dados sejam tratados na hipótese legal do consentimento, você poderá solicitar a revogação do consentimento a qualquer momento pelos canais de atendimento informados no campo Quem Somos Nós, deste Aviso.",
        },
      ],
    },
    {
      titulo: "6. Seus direitos como titular de dados",
      blocos: [
        {
          tipo: "p",
          texto:
            "A LGPD garante direitos aos Titulares dos Dados. Como Titular dos seus Dados Pessoais, você pode nos fazer os seguintes requerimentos:",
        },
        {
          tipo: "lista",
          itens: [
            "Acesso e confirmação da existência de tratamento dos dados;",
            "Atualização, correção de dados incompletos, inexatos ou desatualizados;",
            "Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com o disposto na LGPD;",
            "Portabilidade dos dados, observadas as normas aplicáveis e os segredos comercial e industrial;",
            "Informação das entidades públicas e privadas com as quais o Controlador realizou uso compartilhado de dados;",
            "Informação sobre a possibilidade de não fornecer consentimento e sobre as consequências da negativa;",
            "Revogação de consentimento que poderá ser realizada a qualquer momento e sem ônus, mediante manifestação expressa;",
            "Solicitar a eliminação dos Dados Pessoais tratados com o consentimento, exceto nas hipóteses em que a manutenção dos dados é necessária ou permitida pela legislação;",
            "Oposição a tratamento realizado com fundamento em outras bases legais, em caso de descumprimento da LGPD, ressaltando que pode haver situações em que poderemos continuar a realizar o Tratamento e recusar o seu pedido de oposição;",
            "Solicitar o cancelamento do envio de informações direcionadas pelos nossos canais de comunicação.",
          ],
        },
        {
          tipo: "p",
          texto:
            "Para exercer seus direitos sobre os seus Dados Pessoais, você pode acionar os nossos canais de atendimento mencionados no campo Quem Somos Nós, deste Aviso de Privacidade.",
        },
        {
          tipo: "p",
          texto:
            "Reforçamos que poderemos manter alguns dados e/ou continuar a realizar o Tratamento, mesmo no caso de solicitação de eliminação, oposição, bloqueio ou anonimização, nos casos em que a legislação autorize o tratamento.",
        },
      ],
    },
    {
      titulo: "7. O seu direito de reclamar",
      blocos: [
        {
          tipo: "p",
          texto:
            "Se você tiver uma reclamação sobre o uso de suas informações, você pode entrar em contato conosco, por meio dos contatos fornecidos na seção Quem Somos, deste Aviso de Privacidade.",
        },
      ],
    },
    {
      titulo: "8. Atualizações para este Aviso de Privacidade",
      blocos: [
        {
          tipo: "p",
          texto:
            "Revisamos regularmente e, se apropriado, atualizamos este Aviso de Privacidade de tempos em tempos, e conforme nossos serviços e uso de dados pessoais evoluem. Se quisermos usar seus dados pessoais de uma forma que não identificamos anteriormente, entraremos em contato para fornecer informações sobre isso e, se necessário, solicitar o seu consentimento.",
        },
      ],
    },
    {
      titulo: "9. Glossário",
      blocos: [
        {
          tipo: "p",
          texto: "Os termos abaixo são usados no nosso Aviso de Privacidade.",
        },
        {
          tipo: "lista",
          itens: [
            "Controlador: pessoa natural ou jurídica, de direito público ou privado, a quem competem as decisões referentes ao Tratamento de Dados Pessoais.",
            "Dado Pessoal: informação relacionada a pessoa natural identificada ou identificável.",
            "Dado Pessoal Sensível: dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural.",
            "Endereço de Protocolo de Internet (Endereço IP): código atribuído a um terminal de uma rede para permitir sua identificação, definido segundo parâmetros internacionais.",
            "Site: página da internet do Colégio que pode ser acessada por Usuários.",
            "Titular de Dados Pessoais: pessoa natural a quem se referem os dados pessoais que são objeto de tratamento.",
            "Tratamento: toda operação realizada com Dados Pessoais, como as que se referem à coleta, produção, recepção, classificação, utilização, acesso, reprodução, transmissão, distribuição, processamento, arquivamento, armazenamento, eliminação, avaliação ou controle da informação, modificação, comunicação, transferência, difusão ou extração.",
            "Usuários: todas as pessoas que visitarem e acessarem os Sites e Aplicativos. Também podemos nos referir ao Usuário e ao Titular de Dados Pessoais como \u201cvocê\u201d.",
          ],
        },
      ],
    },
  ],
};

export const TERMOS_USO: DocumentoLegal = {
  slug: "termos",
  titulo: "Termos de Uso do Site",
  descricao:
    "O acesso, a navegação e os serviços disponibilizados neste site do Colégio Santo Agostinho - CSA (www.csa.com.br) estão condicionados à aceitação e ao cumprimento dos termos e condições descritos abaixo.",
  secoes: [
    {
      titulo: "1. Da descrição dos serviços",
      blocos: [
        {
          tipo: "p",
          texto:
            "Através do presente site do CSA, são disponibilizados os seguintes serviços e conteúdos:",
        },
        {
          tipo: "lista",
          itens: [
            "Fale Conosco;",
            "Área Restrita;",
            "Capela online;",
            "Novos alunos;",
            "Arraiá do CSA;",
            "Quem somos;",
            "Educação;",
            "Infraestrutura;",
            "Circulares;",
            "Notícias;",
            "Pastoral.",
          ],
        },
      ],
    },
    {
      titulo: "2. Da aceitação dos termos e Aviso de Privacidade",
      blocos: [
        {
          tipo: "p",
          texto:
            "Ao navegar no site do CSA, o usuário confirma que leu e compreendeu o Aviso de Privacidade do site e expressa concordância com seus termos.",
        },
      ],
    },
    {
      titulo: "3. Do cadastro",
      blocos: [
        {
          tipo: "p",
          texto:
            "Para a solicitação de informações e documentos, o Usuário está ciente de que fornece as informações de forma consciente e voluntária, responsabilizando-se por sua fidedignidade.",
        },
      ],
    },
    {
      titulo: "4. Das responsabilidades",
      blocos: [
        { tipo: "sub", texto: "4.1 Das responsabilidades dos usuários" },
        {
          tipo: "lista",
          itens: [
            "4.1.1. O Usuário se responsabiliza pela precisão e veracidade dos dados informados e reconhece que a inconsistência destes poderá implicar a impossibilidade de utilizar os serviços disponibilizados no site do CSA.",
            "4.1.2. O login e a senha só poderão ser utilizados pelo usuário cadastrado, devendo se manter o sigilo da senha, que é pessoal e intransferível, não sendo possível, em qualquer hipótese, a alegação de uso indevido, após o ato de compartilhamento.",
            "4.1.3. O Usuário do site é responsável pela atualização das suas informações pessoais e pelas consequências da omissão ou de erros nas informações pessoais cadastradas.",
            "4.1.4. O Usuário é responsável pela reparação de todos e quaisquer danos, diretos ou indiretos (inclusive decorrentes de violação de quaisquer direitos de outros usuários, de terceiros, inclusive direitos de propriedade intelectual, de sigilo e de personalidade), que sejam causados ao CSA, a qualquer outro Usuário, ou, ainda, a qualquer terceiro, em virtude do descumprimento do disposto neste termo ou de qualquer ato praticado a partir de seu acesso à Internet, ao site.",
          ],
        },
        { tipo: "sub", texto: "4.2 Das responsabilidades do CSA" },
        {
          tipo: "lista",
          itens: [
            "4.2.1. O CSA deverá cumprir todas as legislações incidentes sobre o tratamento correto dos dados pessoais do cidadão de forma a preservar a privacidade e a segurança das informações coletadas e utilizadas no site.",
            "4.2.2. O CSA manterá registro de todas as operações de tratamento de dados pessoais que realizar com condições de rastreabilidade e de prova eletrônica a qualquer tempo.",
            "4.2.3. O CSA deve abster-se da utilização dos dados pessoais tratados para finalidades diversas daquelas informadas em seu Aviso de Privacidade.",
            "4.2.4. É dever do CSA adotar mecanismos transparentes, de fácil compreensão e acesso, que permitam a ciência inequívoca dos titulares dos dados a respeito de seu Aviso de Privacidade.",
            "4.2.5. O CSA responsabiliza-se pelos danos patrimoniais, morais, individuais ou coletivos que venham a ser causados em razão do descumprimento de suas obrigações legais e das medidas de segurança estabelecidas em seu Aviso de Privacidade, exceto quando o dano for decorrente de culpa exclusiva do titular dos dados ou de terceiro.",
          ],
        },
        {
          tipo: "p",
          texto:
            "4.3. O CSA não poderá ser responsabilizado pelos seguintes fatos:",
        },
        {
          tipo: "lista",
          itens: [
            "Equipamentos dos usuários infectados por vírus ou outros softwares que comprometam a segurança de dados ou invadidos por terceiros;",
            "Equipamentos dos usuários avariados no momento da utilização do site;",
            "Proteção dos equipamentos dos usuários;",
            "Proteção das informações baseadas nos equipamentos dos usuários;",
            "Abuso de uso dos equipamentos dos usuários;",
            "Monitoramento clandestino dos equipamentos utilizados pelos usuários;",
            "Vulnerabilidades ou instabilidades apresentadas pelos sistemas do equipamento dos usuários;",
            "Perímetro inseguro;",
            "Instalação no equipamento do Usuário ou de terceiros de códigos maliciosos (vírus, trojans, malware, worm, bot, backdoor, spyware, rootkit, ou de quaisquer outros que venham a ser criados), em decorrência da navegação na Internet pelo Usuário.",
          ],
        },
        {
          tipo: "p",
          texto:
            "4.4. O CSA não se responsabiliza por conteúdos de terceiros citados e hospedados no site, nem por comentários e opiniões de usuários publicados nestes locais.",
        },
        {
          tipo: "p",
          texto:
            "4.5. Os conteúdos do site, que incluem dados de sistemas, textos, fotografias, sons, vídeos, imagens e elementos gráficos, além da logomarca do CSA, possuem todos os direitos autorais e de propriedade intelectual reservados, conforme estabelece a Lei de Direitos Autorais nº 9.610, de 1998, e correlatas.",
        },
      ],
    },
    {
      titulo: "5. Das alterações do Termo de Uso",
      blocos: [
        {
          tipo: "p",
          texto:
            "Alterações significativas e/ou atualização deste Termo de Uso passarão a vigorar a partir da data de sua publicação no próprio site e deverão ser integralmente observadas pelos Usuários, independente de notificação expressa ou prévia.",
        },
        {
          tipo: "p",
          texto:
            "Este Termo possui validade indeterminada, podendo ser alterado, a qualquer tempo, a critério do CSA visando atender ao interesse público.",
        },
      ],
    },
    {
      titulo: "6. Do foro",
      blocos: [
        {
          tipo: "p",
          texto:
            "Quaisquer disputas ou controvérsias oriundas de quaisquer atos praticados no âmbito da utilização deste site pelos Usuários, inclusive com relação ao descumprimento dos Termos de Uso e do Aviso de Privacidade ou pela violação dos direitos do CSA, de outros Usuários e/ou de terceiros, inclusive direitos de propriedade intelectual, de sigilo e de personalidade, serão processadas no Foro da Comarca de Rio de Janeiro/RJ.",
        },
      ],
    },
  ],
};

export const DOCUMENTOS_LEGAIS: Record<DocumentoLegal["slug"], DocumentoLegal> =
  {
    privacidade: AVISO_PRIVACIDADE,
    termos: TERMOS_USO,
  };
