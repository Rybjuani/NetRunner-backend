# 🤖 NetRunner Pro v4.7 — Personal Autonomous Assistant

NetRunner es un asistente de IA avanzado diseñado para actuar directamente en tu entorno de trabajo. A diferencia de otros chatbots, NetRunner puede gestionar tus archivos locales y automatizar la navegación web bajo tu supervisión.

## 🚀 Características Principales

- **Acceso Directo al Sistema:** Crea, lee y organiza archivos en tu PC de forma nativa usando la *File System Access API*.
- **Automatización Web:** Abre y gestiona aplicaciones web directamente desde el chat.
- **Privacidad y Seguridad:** El sistema solo accede a las carpetas que tú autorices explícitamente mediante tarjetas de confirmación dinámicas.
- **Interfaz Premium:** Diseño minimalista, responsivo y optimizado para una experiencia sin distracciones.

## 🛠️ Cómo Funciona

1. **Escribe una orden:** Dile algo como *"Crea un archivo reporte.txt con un resumen de mis tareas"* o *"Abre youtube y busca música para concentrarse"*.
2. **Otorga Permiso:** Si la tarea requiere acceder a tu PC, la IA generará una tarjeta de **"Acceso al Disco"**. Haz clic y selecciona una carpeta (ej: tu Escritorio).
3. **Ejecución Automática:** Una vez concedido el permiso, la IA terminará la tarea y te mostrará una confirmación visual.

> **Nota de Seguridad:** Por restricciones del navegador, no se permite el acceso a carpetas raíz del sistema (C:\, Windows, /root, etc.). Selecciona siempre una carpeta de usuario como **Escritorio** o **Documentos**.

## 💻 Instalación Local

```bash
# Clonar el repositorio
git clone https://github.com/Rybjuani/NetRunner-backend.git

# Instalar dependencias
npm install

# Configurar variables de entorno (.env)
GROQ_API_KEY=tu_clave_aqui

# Iniciar servidor
npm start
```

## 📄 Licencia
Este proyecto está bajo la licencia MIT. Creado por [Rybjuani](https://github.com/Rybjuani).
