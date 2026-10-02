import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// Next 16's dev server blocks its JS from any host but localhost, so opening the
// game on a friend's phone via this machine's LAN IP loaded a dead page.
const lanHosts = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => n!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...lanHosts, "*.trycloudflare.com"],
};

export default nextConfig;
