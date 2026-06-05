import type { Protocol } from "../types";

export function usesSshTransport(protocol: Protocol): boolean {
  return protocol === "SFTP" || protocol === "SSH";
}
