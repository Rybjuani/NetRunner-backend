(function () {
  const CHANNEL = "SYSTEMBRIDGE_CONNECTIVITY_NODE";
  const TIMEOUT_MS = 1800;
  let responded = false;

  function publishStatus(installed) {
    window.dispatchEvent(new CustomEvent("systembridge-node-status", {
      detail: {
        installed,
        channel: CHANNEL,
        timestamp: Date.now()
      }
    }));
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === "SYSTEMBRIDGE_NODE_PONG" && event.data.channel === CHANNEL) {
      responded = true;
      publishStatus(true);
    }
  });

  window.postMessage({ type: "SYSTEMBRIDGE_NODE_PING", channel: CHANNEL }, "*");

  window.setTimeout(() => {
    if (!responded) {
      publishStatus(false);
    }
  }, TIMEOUT_MS);
})();
