import type { Role } from "@prisma/client";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { AppError } from "../lib/http";

type BaseTokenPayload = {
  sub: string;
  email: string;
  name: string;
  role: Role;
  department: string | null;
};

export type AccessTokenPayload = BaseTokenPayload & {
  type: "access";
};

export type RefreshTokenPayload = BaseTokenPayload & {
  type: "refresh";
  jti: string;
};

type TokenUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string | null;
};

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  const payload = value as Partial<AccessTokenPayload>;
  return payload.type === "access" && typeof payload.sub === "string";
}

function isRefreshTokenPayload(value: unknown): value is RefreshTokenPayload {
  const payload = value as Partial<RefreshTokenPayload>;
  return payload.type === "refresh" && typeof payload.sub === "string" && typeof payload.jti === "string";
}

export function durationToSeconds(duration: string) {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());

  if (!match) {
    throw new AppError(500, `Unsupported duration format: ${duration}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const unitMap: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  };

  return amount * unitMap[unit];
}

export function issueAccessToken(user: TokenUser) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      type: "access",
    } satisfies AccessTokenPayload,
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions["expiresIn"] },
  );
}

export function issueRefreshToken(user: TokenUser, tokenId: string) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      type: "refresh",
      jti: tokenId,
    } satisfies RefreshTokenPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES as jwt.SignOptions["expiresIn"] },
  );
}

export function verifyAccessToken(token: string) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);

  if (!isAccessTokenPayload(payload)) {
    throw new AppError(401, "Unexpected access token payload");
  }

  return payload;
}

export function verifyRefreshToken(token: string) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET);

  if (!isRefreshTokenPayload(payload)) {
    throw new AppError(401, "Unexpected refresh token payload");
  }

  return payload;
}
