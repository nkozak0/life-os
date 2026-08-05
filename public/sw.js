/* global self */

let activeRestTimerId = null;
let activeRestTimerToken = 0;
let resolveActiveRestTimer = null;

function cancelActiveRestTimer() {
  activeRestTimerToken += 1;

  if (activeRestTimerId !== null) {
    clearTimeout(activeRestTimerId);
    activeRestTimerId = null;
  }

  if (resolveActiveRestTimer) {
    resolveActiveRestTimer();
    resolveActiveRestTimer = null;
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const payload = event.data;

  if (!payload || typeof payload !== "object") {
    return;
  }

  if (payload.type === "CANCEL_REST_TIMER") {
    cancelActiveRestTimer();
    return;
  }

  if (payload.type !== "START_REST_TIMER") {
    return;
  }

  const seconds = Number(payload.seconds);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    cancelActiveRestTimer();
    return;
  }

  const exerciseName =
    typeof payload.exerciseName === "string" && payload.exerciseName.trim()
      ? payload.exerciseName.trim().slice(0, 120)
      : "your exercise";
  const delayMilliseconds = Math.min(Math.round(seconds * 1000), 2_147_483_647);

  cancelActiveRestTimer();
  const timerToken = activeRestTimerToken;
  const timerLifetime = new Promise((resolve) => {
    resolveActiveRestTimer = resolve;
  });

  activeRestTimerId = setTimeout(() => {
    if (timerToken !== activeRestTimerToken) {
      return;
    }

    activeRestTimerId = null;
    self.registration
      .showNotification("Rest Time Over! \u{1F4AA}", {
        body: `Time for your next set of ${exerciseName}.`,
        tag: "life-os-rest-timer",
        renotify: true,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: {
          url: "/workouts",
        },
      })
      .catch((error) => {
        console.error("Unable to show rest timer notification:", error);
      })
      .finally(() => {
        if (timerToken === activeRestTimerToken) {
          resolveActiveRestTimer?.();
          resolveActiveRestTimer = null;
        }
      });
  }, delayMilliseconds);

  event.waitUntil(timerLifetime);
});

self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        body: event.data.text(),
      };
    }
  }

  const title = payload.title || "Life OS";
  const options = {
    body: payload.body || "You have a new reminder.",
    tag: payload.tag || "life-os-notification",
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );
  const targetUrl =
    requestedUrl.origin === self.location.origin
      ? requestedUrl.href
      : self.location.origin;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const matchingClient = clients.find(
          (client) => client.url === targetUrl,
        );

        if (matchingClient) {
          return matchingClient.focus();
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
