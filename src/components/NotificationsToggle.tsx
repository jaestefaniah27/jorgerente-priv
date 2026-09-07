"use client";

import { useEffect, useState } from "react";
import { subscribeToPush, getExistingSubscription } from "@/lib/push-client";

type State = "checking" | "off" | "on" | "unsupported" | "disabled" | "denied" | "error";

export default function NotificationsToggle() {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof Notification === "undefined") {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const sub = await getExistingSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function handleClick() {
    setState("checking");
    const result = await subscribeToPush();
    if (result.status === "subscribed") {
      setState("on");
    } else {
      setState(result.status);
      if ("message" in result) setMessage(result.message ?? null);
    }
  }

  if (state === "on") {
    return <span className="text-xs text-emerald-700">🔔 Avisos activados</span>;
  }
  if (state === "unsupported") {
    return <span className="text-xs text-slate-400">Avisos no soportados en este navegador</span>;
  }
  if (state === "disabled") {
    return <span className="text-xs text-slate-400">Avisos push no configurados en el servidor</span>;
  }
  if (state === "denied") {
    return <span className="text-xs text-slate-400">Notificaciones bloqueadas en el navegador</span>;
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === "checking"}
      className="text-xs rounded-full border border-indigo-300 px-3 py-1 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
      title={message ?? undefined}
    >
      {state === "checking" ? "Comprobando…" : "Activar avisos"}
    </button>
  );
}
