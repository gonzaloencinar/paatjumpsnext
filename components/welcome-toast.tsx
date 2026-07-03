"use client";

import { useDictionary } from "components/i18n/locale-context";
import { useEffect } from "react";
import { toast } from "sonner";

export function WelcomeToast() {
  const t = useDictionary();

  useEffect(() => {
    // ignore if screen height is too small
    if (window.innerHeight < 650) return;
    if (!document.cookie.includes("welcome-toast=2")) {
      toast(t.welcomeToast.title, {
        id: "welcome-toast",
        duration: Infinity,
        onDismiss: () => {
          document.cookie = "welcome-toast=2; max-age=31536000; path=/";
        },
        description: t.welcomeToast.description,
      });
    }
  }, [t]);

  return null;
}
