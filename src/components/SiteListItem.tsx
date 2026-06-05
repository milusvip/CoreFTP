import { useT } from "../i18n";
import ProtocolBadge, { protocolAvatarClass } from "./ProtocolBadge";
import type { SiteConfig } from "../types";

interface SiteSession {
  status?: string;
  error?: string;
}

interface SiteListItemProps {
  site: SiteConfig;
  isActive: boolean;
  session?: SiteSession;
  onClick: () => void;
  onDoubleClick?: () => void;
  onDisconnect?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="3" width="20" height="6" rx="1.5" />
      <rect x="2" y="15" width="20" height="6" rx="1.5" />
      <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function SiteListItem({
  site,
  isActive,
  session,
  onClick,
  onDoubleClick,
  onDisconnect,
  onContextMenu,
}: SiteListItemProps) {
  const t = useT();
  const status = session?.status;
  const connected = status === "connected";
  const connecting = status === "connecting";
  const errored = status === "error";

  let statusDot = "";
  if (connected) statusDot = "bg-green-500";
  else if (connecting) statusDot = "bg-yellow-400 animate-pulse";
  else if (errored) statusDot = "bg-red-500";

  return (
    <div className="group/site">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        onContextMenu={onContextMenu}
        title={t("sidebar.connectHint")}
        className={`site-card ${isActive ? "site-card-active" : "site-card-idle"}`}
      >
        <div className="relative shrink-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${protocolAvatarClass(site.protocol)}`}
          >
            <ServerIcon className="w-[18px] h-[18px]" />
          </div>
          {statusDot && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-alt ${statusDot} ${
                connected ? "shadow-[0_0_6px_rgba(34,197,94,0.55)]" : ""
              }`}
            />
          )}
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-1 min-w-0">
            <span className={`truncate text-[13px] font-semibold leading-tight ${isActive ? "text-accent" : "text-fg"}`}>
              {site.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            <ProtocolBadge protocol={site.protocol} />
            <span className="site-card-host">
              {site.host}:{site.port}
            </span>
          </div>
          {connecting && (
            <p className="mt-1 text-[10px] text-yellow-500/90 leading-none">{t("sidebar.connecting")}</p>
          )}
        </div>

        {connected && onDisconnect && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onDisconnect}
            className="site-card-action"
            title={t("sidebar.disconnect")}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {errored && isActive && session?.error && (
        <p className="ml-11 mr-1 mt-1 mb-0.5 text-[10px] text-red-400/85 line-clamp-2 leading-snug" title={session.error}>
          {session.error}
        </p>
      )}
    </div>
  );
}
