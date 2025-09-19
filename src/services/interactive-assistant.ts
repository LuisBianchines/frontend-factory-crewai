import { InteractiveAssistantAgent } from '../crew/roles';

export interface AssistantSuggestion {
  type: 'template' | 'briefing' | 'target-audience' | 'features' | 'goals' | 'general';
  suggestions: string[];
  examples: string[];
  tips: string[];
}

export class InteractiveAssistant {
  private agent = InteractiveAssistantAgent;

  async getSuggestions(questionType: string, context?: string): Promise<AssistantSuggestion> {
    const type = questionType.toLowerCase();
    
    if (type.includes('template') || type.includes('tipo')) {
      return this.getTemplateSuggestions();
    }
    
    if (type.includes('briefing') || type.includes('descrição') || type.includes('projeto')) {
      return this.getBriefingSuggestions(context);
    }
    
    if (type.includes('público') || type.includes('target') || type.includes('audiencia') || type.includes('audiência')) {
      return this.getTargetAudienceSuggestions();
    }
    
    if (type.includes('funcionalidades') || type.includes('features') || type.includes('recursos')) {
      return this.getFeaturesSuggestions();
    }
    
    if (type.includes('metas') || type.includes('goals') || type.includes('objetivos')) {
      return this.getGoalsSuggestions();
    }
    
    return this.getGeneralHelp();
  }

  private getTemplateSuggestions(): AssistantSuggestion {
    return {
      type: 'template',
      suggestions: [
        'nextjs-base - Template padrão Next.js com estrutura Lapidatto',
        'landing-page - Site institucional otimizado para conversão',
        'dashboard - Painel administrativo com métricas e dados',
        'e-commerce - Loja online com catálogo de produtos',
        'blog - Site de conteúdo com sistema de posts',
        'portfolio - Showcase de trabalhos e projetos',
        'saas-app - Aplicação web completa multi-funcional'
      ],
      examples: [
        'nextjs-base: "Projeto padrão para customização completa"',
        'landing-page: "Site para consultoria de marketing digital"',
        'dashboard: "Painel para gestão de vendas e métricas"',
        'e-commerce: "Loja online de roupas femininas"',
        'blog: "Site de receitas culinárias com categorias"',
        'portfolio: "Showcase para designer freelancer"'
      ],
      tips: [
        '💡 nextjs-base é o mais flexível para customização',
        '💡 landing-page é ideal para conversão de leads',
        '💡 dashboard é perfeito para visualização de dados',
        '💡 Pense no objetivo principal do seu site',
        '💡 Considere quem vai usar a aplicação'
      ]
    };
  }

  private getBriefingSuggestions(context?: string): AssistantSuggestion {
    return {
      type: 'briefing',
      suggestions: [
        'Descreva o negócio ou projeto principal',
        'Qual o objetivo/problema que resolve?',
        'Quais páginas/seções são necessárias?',
        'Que funcionalidades são essenciais?',
        'Tem alguma referência visual ou inspiração?',
        'Qual o tom e estilo desejado?'
      ],
      examples: [
        '"Site para consultoria de marketing digital especializada em pequenas empresas. Precisa de home com hero section, página de serviços, cases de sucesso, sobre a equipe e formulário de contato para gerar leads."',
        '"Dashboard para gestão de e-commerce que mostra vendas em tempo real, produtos mais vendidos, relatórios de performance e permite gerenciar pedidos e estoque."',
        '"Portfólio pessoal para designer UX/UI freelancer. Galeria de projetos com detalhes, seção sobre mim, depoimentos de clientes e formulário de contato para novos projetos."',
        '"Blog de receitas veganas com categorias por tipo de prato, sistema de busca, newsletter para receitas semanais e seção de dicas nutricionais."'
      ],
      tips: [
        '💡 Seja específico sobre o tipo de negócio',
        '💡 Mencione funcionalidades importantes',
        '💡 Descreva o público que vai acessar',
        '💡 Inclua referências se tiver',
        '💡 Pense nas principais páginas necessárias',
        '💡 Defina o tom: profissional, descontraído, etc.'
      ]
    };
  }

  private getTargetAudienceSuggestions(): AssistantSuggestion {
    return {
      type: 'target-audience',
      suggestions: [
        'Pequenas e médias empresas (PMEs)',
        'Consumidores finais jovens (18-35 anos)',
        'Profissionais de área específica (ex: designers, desenvolvedores)',
        'Empresários e executivos (35-50 anos)',
        'Estudantes universitários e recém-formados',
        'Famílias com crianças',
        'Aposentados ativos (50+ anos)',
        'Freelancers e profissionais autônomos'
      ],
      examples: [
        '"Donos de pequenos negócios que precisam de presença digital mas têm pouco conhecimento técnico"',
        '"Mulheres de 25-45 anos interessadas em moda sustentável e consciente"',
        '"Desenvolvedores júnior e pleno que buscam ferramentas para aumentar produtividade"',
        '"Empresários do setor de serviços que querem gerar mais leads online"',
        '"Estudantes de design que precisam criar portfólio profissional"'
      ],
      tips: [
        '💡 Defina faixa etária aproximada',
        '💡 Considere o nível de conhecimento técnico',
        '💡 Pense em B2B (empresas) vs B2C (consumidores)',
        '💡 Inclua interesses e necessidades específicas',
        '💡 Considere poder aquisitivo e comportamento online'
      ]
    };
  }

  private getFeaturesSuggestions(): AssistantSuggestion {
    return {
      type: 'features',
      suggestions: [
        'Formulário de contato/orçamento',
        'Integração com redes sociais',
        'Sistema de busca interno',
        'Blog/área de conteúdo',
        'Galeria de imagens/projetos',
        'Depoimentos de clientes',
        'FAQ (Perguntas frequentes)',
        'Newsletter/sistema de e-mail',
        'Mapa interativo com localização',
        'Chat online/WhatsApp',
        'Área restrita/login',
        'Sistema de avaliações',
        'Carrinho de compras',
        'Relatórios e dashboards',
        'Notificações push'
      ],
      examples: [
        'Landing Page: "Formulário de orçamento, galeria de cases, depoimentos de clientes, integração WhatsApp"',
        'Dashboard: "Gráficos interativos, exportar relatórios PDF, filtros avançados, notificações em tempo real"',
        'E-commerce: "Carrinho de compras, sistema de avaliações, wishlist, checkout simplificado, rastreamento de pedidos"',
        'Blog: "Sistema de comentários, categorias, busca por tags, newsletter, compartilhamento social"'
      ],
      tips: [
        '💡 Liste funcionalidades essenciais primeiro',
        '💡 Pense na jornada completa do usuário',
        '💡 Considere integrações com ferramentas externas',
        '💡 Muitas funcionalidades podem complicar o projeto',
        '💡 Priorize o que realmente agrega valor'
      ]
    };
  }

  private getGoalsSuggestions(): AssistantSuggestion {
    return {
      type: 'goals',
      suggestions: [
        'Gerar leads qualificados',
        'Aumentar vendas online',
        'Melhorar presença digital da marca',
        'Facilitar comunicação com clientes',
        'Automatizar processos internos',
        'Criar autoridade no mercado',
        'Reduzir custos operacionais',
        'Expandir mercado de atuação',
        'Melhorar experiência do cliente',
        'Centralizar informações e dados'
      ],
      examples: [
        '"Gerar pelo menos 50 leads qualificados por mês através do formulário de contato"',
        '"Aumentar vendas online em 30% nos próximos 6 meses"',
        '"Posicionar a empresa como referência no setor através de conteúdo de qualidade"',
        '"Reduzir tempo de resposta ao cliente de 24h para 2h com chat integrado"'
      ],
      tips: [
        '💡 Defina metas específicas e mensuráveis',
        '💡 Pense em resultados de negócio, não só técnicos',
        '💡 Considere metas de curto e médio prazo',
        '💡 Alinhe com objetivos gerais da empresa',
        '💡 Foque em impacto real para o usuário'
      ]
    };
  }

  private getGeneralHelp(): AssistantSuggestion {
    return {
      type: 'general',
      suggestions: [
        'Digite "template" ou "tipo" para ver opções de templates',
        'Digite "briefing" ou "projeto" para dicas de descrição',
        'Digite "público" ou "audiência" para definir target',
        'Digite "funcionalidades" para ver recursos disponíveis',
        'Digite "metas" ou "objetivos" para definir goals'
      ],
      examples: [
        'Para templates: "nextjs-base", "landing-page", "dashboard"',
        'Para briefing: Descreva seu negócio e necessidades',
        'Para público: Defina quem vai usar o site',
        'Para funcionalidades: Liste recursos essenciais'
      ],
      tips: [
        '💡 Seja específico nas suas respostas',
        '💡 Pense sempre no usuário final',
        '💡 Comece simples e evolua gradualmente',
        '💡 Use referências de sites que admira',
        '💡 Priorize clareza sobre complexidade'
      ]
    };
  }

  formatSuggestion(suggestion: AssistantSuggestion): string {
    let output = `\n🤖 ${this.agent.name} te ajuda:\n\n`;
    
    if (suggestion.suggestions.length > 0) {
      output += `💡 **Sugestões:**\n`;
      suggestion.suggestions.forEach(s => output += `   • ${s}\n`);
      output += `\n`;
    }

    if (suggestion.examples.length > 0) {
      output += `📝 **Exemplos:**\n`;
      suggestion.examples.forEach(e => output += `   • ${e}\n`);
      output += `\n`;
    }

    if (suggestion.tips.length > 0) {
      output += `✨ **Dicas:**\n`;
      suggestion.tips.forEach(t => output += `   ${t}\n`);
    }

    output += `\n────────────────────────────────────────────────────────────────\n`;
    
    return output;
  }
}
