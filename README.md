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

## 🛰️ NetRunner Sync-Node (Agente de Sincronización)

El Sync-Node es un agente de Python que se ejecuta en segundo plano en tu máquina local para sincronizar archivos con un almacenamiento en la nube (B2/S3).

### Configuración del Agente

1.  **Instala dependencias:**
    ```bash
    pip install websockets boto3 pymongo
    ```
2.  **Configura las credenciales:**
    Abre `sync_agent.py` y rellena las siguientes variables con tus claves:
    - `B2_ENDPOINT_URL`
    - `B2_ACCESS_KEY`
    - `B2_SECRET_KEY`
    - `B2_BUCKET_NAME`
    - `MONGO_URI`

### Ejecución y Persistencia

-   **Para ejecutar manualmente:**
    ```bash
    python sync_agent.py
    ```
-   **En Windows (Persistencia):**
    Ejecuta el script de PowerShell como Administrador:
    ```powershell
    .\setup_windows_task.ps1
    ```
-   **En Linux (Persistencia):**
    1.  Edita `netrunner-sync.service` y cambia `/path/to/your/project/sync_agent.py` a la ruta absoluta de tu agente.
    2.  Copia el archivo a `~/.config/systemd/user/`.
    3.  Habilita e inicia el servicio:
        ```bash
        systemctl --user enable netrunner-sync.service
        systemctl --user start netrunner-sync.service
        ```
