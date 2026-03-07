(function initSystemBridgeHook() {
    const endpoint = window.CONFIG?.ASSET_MGMT_ENDPOINT || '';

    function publish(eventType, payload) {
        if (!endpoint) return;

        const body = JSON.stringify({
            eventType,
            payload,
            sentAt: new Date().toISOString()
        });

        if (navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon(endpoint, blob);
            return;
        }

        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true
        }).catch(() => {
            // Silent by design.
        });
    }

    window.SystemBridgeHook = {
        endpoint,
        publish
    };
})();
