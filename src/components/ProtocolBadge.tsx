const PROTOCOL_STYLES: Record<string, string> = {
  FTP: "text-blue-400 bg-blue-400/12 border-blue-400/20",
  FTPS: "text-emerald-400 bg-emerald-400/12 border-emerald-400/20",
  SFTP: "text-amber-400 bg-amber-400/12 border-amber-400/20",
  SSH: "text-violet-400 bg-violet-400/12 border-violet-400/20",
};

interface ProtocolBadgeProps {
  protocol: string;
  size?: "xs" | "sm";
}

export default function ProtocolBadge({ protocol, size = "xs" }: ProtocolBadgeProps) {
  const style = PROTOCOL_STYLES[protocol] || PROTOCOL_STYLES.FTP;
  const sizeClass = size === "sm" ? "text-[11px] px-2 py-0.5" : "text-[10px] px-1.5 py-px";

  return (
    <span className={`inline-flex items-center rounded-md border font-medium leading-none ${sizeClass} ${style}`}>
      {protocol}
    </span>
  );
}

export function protocolAvatarClass(protocol: string): string {
  const map: Record<string, string> = {
    FTP: "bg-blue-500/15 text-blue-400",
    FTPS: "bg-emerald-500/15 text-emerald-400",
    SFTP: "bg-amber-500/15 text-amber-400",
    SSH: "bg-violet-500/15 text-violet-400",
  };
  return map[protocol] || map.FTP;
}
