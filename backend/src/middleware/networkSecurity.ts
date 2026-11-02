import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Check if an IP address belongs to standard private/internal subnets.
 */
function isPrivateIp(ip: string): boolean {
  // Normalize IPv6-mapped IPv4
  const normalized = ip.replace(/^::ffff:/, '');

  // Localhost
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
    return true;
  }

  // 10.0.0.0 - 10.255.255.255 (Class A private)
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }

  // 172.16.0.0 - 172.31.255.255 (Class B private)
  const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(normalized);
  if (match172) {
    const secondOctet = parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  // 192.168.0.0 - 192.168.255.255 (Class C private)
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * Middleware to enforce private network / VPN access.
 */
export function enforcePrivateNetwork(req: Request, res: Response, next: NextFunction) {
  if (!config.auth.internalNetworkOnly) {
    return next();
  }

  const rawIp = req.ip || req.socket.remoteAddress || '';

  if (isPrivateIp(rawIp)) {
    return next();
  }

  // Check custom allowed IPs if configured
  if (config.auth.allowedIps && config.auth.allowedIps.includes(rawIp)) {
    return next();
  }

  console.warn(`[SECURITY] Blocked non-private network access attempt from: ${rawIp}`);
  return res.status(403).json({
    error: 'Access Denied: MDMS is an internal application restricted to the company private network or approved VPN.',
  });
}

