import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "../i18n";
import { GITHUB_REPO_URL } from "../constants/app";

export default function AboutSection() {
  const t = useT();
  const [version, setVersion] = useState("…");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("0.1.0"));
  }, []);

  const openGithub = () => {
    invoke("open_external_url", { url: GITHUB_REPO_URL }).catch(() => {
      window.open(GITHUB_REPO_URL, "_blank", "noopener,noreferrer");
    });
  };

  return (
    <div className="pt-2 mt-1 border-t border-surface-light/60 shrink-0">
      <div className="text-xs font-medium text-fg-muted mb-1.5">{t("settings.about")}</div>
      <div className="rounded-lg border border-surface-light/60 bg-surface-alt/40 px-3 py-2.5 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-fg">CoreFTP</span>
          <span className="text-xs text-fg-subtle tabular-nums">
            {t("settings.aboutVersion")} {version}
          </span>
        </div>
        <p className="text-xs text-fg-muted leading-relaxed">{t("settings.aboutDesc")}</p>
        <p className="text-xs text-fg-subtle">{t("settings.aboutLicense")}</p>
        <button
          type="button"
          onClick={openGithub}
          className="text-xs text-accent hover:underline break-all text-left"
        >
          {GITHUB_REPO_URL}
        </button>
      </div>
    </div>
  );
}
