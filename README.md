# 🤖 NetRunner Pro — Sistema Autónomo de Ingeniería

NetRunner Pro es una plataforma avanzada de asistencia por inteligencia artificial que trasciende el chat convencional. Está diseñado para **actuar** directamente sobre el sistema de archivos del usuario y automatizar flujos de trabajo en el navegador mediante una interfaz premium y un núcleo de ejecución seguro.

## 🌟 Características de Clase Mundial

- **Ejecución de Acciones Nativas:** Capacidad real para crear, leer y organizar archivos en tu PC local usando la *File System Access API*.
- **Arquitectura Multi-Proveedor:** Soporte integrado para **Groq** y **OpenCode**, permitiendo alternar entre los modelos de lenguaje más potentes del mercado (Llama 3.3, Mixtral, Big Pickle, etc.).
- **Diseño de Élite (Master UX):** Interfaz minimalista con estética de alta gama, efectos de cristal (*Glassmorphism*), gradientes profundos y animaciones fluidas.
- **Gestión Inteligente de Permisos:** La IA solicita acceso al sistema solo cuando es necesario, manteniendo la seguridad del usuario como prioridad máxima.
- **Totalmente Auditable:** Código fuente transparente y abierto, sin binarios opacos ni procesos ocultos.

## 🚀 Inicio Rápido

1. **Clona el motor:**
   ```bash
   git clone https://github.com/Rybjuani/NetRunner-backend.git
   cd NetRunner-backend
   ```

2. **Instala los módulos:**
   ```bash
   npm install
   ```

3. **Configura tu cerebro (IA):**
   Crea un archivo `.env` en la raíz con tus claves de API:
   ```env
   GROQ_API_KEY=tu_clave_groq
   OPENCODE_ZEN_API_KEY=tu_clave_opencode
   ```

4. **Despliegue:**
   ```bash
   npm start
   ```
   Accede a través de `http://localhost:3000` o tu dominio configurado en Railway.

## 🛡️ Seguridad y Privacidad

NetRunner opera bajo el principio de **Privacidad por Diseño**:
- El navegador actúa como un sandbox seguro.
- No se permite el acceso a carpetas raíz del sistema (C:\, /root).
- Cada acción sobre el disco o navegación requiere una interacción consciente del usuario.

## 🛠️ Tecnologías

- **Backend:** Node.js, Express.
- **Frontend:** Vanilla JS (ES6+), CSS3 (Mesh Gradients), HTML5.
- **APIs:** File System Access API, Web Open API.
- **IA:** Groq Cloud, OpenCode Zen.

---
Desarrollado con ❤️ por [Rybjuani](https://github.com/Rybjuani).
