const CONFIG = {
  APP_NAME: 'NetRunner',
  VERSION: '3.2.0',

  MODELS: [
    {
      id: 'zen:big-pickle',
      label: 'Big Pickle (Zen)',
      description: 'Gratis - Optimizado para agentes de código'
    },
    {
      id: 'zen:minimax-m2.5-free',
      label: 'MiniMax Free (Zen)',
      description: 'Gratis - Modelo gratuito de MiniMax'
    },
    {
      id: 'groq:llama-3.1-8b-instant',
      label: 'Llama 3.1 8B (Groq)',
      description: 'Muy rápido, gratis, excelente calidad.'
    },
    {
      id: 'groq:llama-3.1-70b-versatile',
      label: 'Llama 3.1 70B (Groq)',
      description: 'Más grande, mejor calidad, sigue siendo gratis.'
    },
    {
      id: 'groq:mixtral-8x7b-32768',
      label: 'Mixtral 8x7B (Groq)',
      description: 'Modelo mixture of experts, muy capaz.'
    },
    {
      id: 'groq:llama-3.3-70b-specdec',
      label: 'Llama 3.3 70B (Groq)',
      description: 'El modelo más nuevo y potente de Groq.'
    }
  ],

  DEFAULT_MODEL: 'groq:llama-3.1-8b-instant',

  GENERATION: {
    MAX_TOKENS: 512,
    TEMPERATURE: 0.7
  },

  API_ENDPOINT: '/api/chat',

  CAPABILITIES: {
    CODE_EXECUTION: {
      api: 'Piston',
      url: 'https://emkc.org/api/v2/piston',
      languages: ['javascript', 'python', 'typescript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'bash', 'powershell', 'sql', 'html', 'css']
    },
    FILE_SYSTEM: {
      api: 'File System Access API',
      browserSupport: 'Chrome/Edge',
      actions: ['create', 'read', 'delete', 'list']
    },
    BROWSER_AUTOMATION: {
      features: ['clipboard', 'notifications', 'download', 'openUrl', 'browserInfo']
    }
  }
};

window.CONFIG = CONFIG;
