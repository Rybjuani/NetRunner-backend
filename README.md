# ⚡ NetRunner Pro v5.0 — Native Core

Una suite de ingeniería autónoma que opera con privilegios de usuario nativos. Sin binarios opacos, sin `.exe` sospechosos. Solo código transparente.

## 🚀 Inicio Rápido (Modo Experto)

Para obtener **control total del sistema** (acceso a archivos de sistema, ejecución de comandos, automatización real) sin lidiar con permisos del navegador, utiliza los lanzadores nativos:

### 🪟 Windows
Haz doble clic en `netrunner.bat`.
> El sistema iniciará en modo silencioso y abrirá tu navegador conectado al núcleo nativo.

### 🐧 Linux / macOS
Ejecuta el script de arranque:
```bash
./netrunner.sh
```

---

## 💀 Capacidades del Native Core
Al usar los lanzadores, NetRunner hereda tus permisos de usuario. Puede:
- **Ejecutar comandos:** `[EXEC: nmap 192.168.1.1]`
- **Modificar sistema:** Editar configuraciones en `/etc` o `C:\Windows\System32` (si tu usuario tiene permisos).
- **Lanzar Apps:** Abrir herramientas locales (`code .`, `notepad`, `calc`).

## 🛡️ Transparencia y Seguridad
A diferencia de un `.exe` compilado, **NetRunner es 100% auditable**.
- Puedes abrir `netrunner.bat` o `server.js` con cualquier editor de texto para ver exactamente qué hace.
- No hay código ofuscado.
- Tu seguridad depende de tu clave de API y de no exponer el puerto 3000 a internet.

## 📦 Instalación Manual
```bash
git clone https://github.com/Rybjuani/NetRunner-backend.git
npm install
npm start
```
