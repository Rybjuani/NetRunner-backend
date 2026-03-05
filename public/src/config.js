const CONFIG = {
  APP_NAME: 'NetRunner',
  VERSION: '5.6.0',

  MODELS: [
    {
      id: 'groq:llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B (Potente)',
      description: 'El modelo más capaz de Groq.'
    },
    {
      id: 'groq:llama-3.1-70b-versatile',
      label: 'Llama 3.1 70B (Equilibrado)',
      description: 'Excelente para tareas complejas.'
    },
    {
      id: 'groq:mixtral-8x7b-32768',
      label: 'Mixtral 8x7B (Rápido)',
      description: 'Modelo versátil y veloz.'
    },
    {
      id: 'groq:llama-3.1-8b-instant',
      label: 'Llama 3.1 8B (Instantáneo)',
      description: 'Respuesta inmediata.'
    },
    {
      id: 'zen:opencodezen-bigpickle',
      label: 'Big Pickle (OpenCode)',
      description: 'Especialista en código y lógica.'
    },
    {
      id: 'zen:minimax-m2.5-free',
      label: 'MiniMax Free (OpenCode)',
      description: 'Alternativa gratuita de alta calidad.'
    }
  ],

  DEFAULT_MODEL: 'groq:llama-3.3-70b-versatile',
  API_ENDPOINT: '/api/chat'
};

window.CONFIG = CONFIG;
