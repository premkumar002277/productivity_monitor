import { Role, type User } from "@prisma/client";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

import { env } from "../config/env";
import { AppError } from "../lib/http";
import { prisma } from "../lib/prisma";
import { ensureRedisConnection, redis } from "../lib/redis";
import {
  durationToSeconds,
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
} from "./jwt";

type RegisterInput = {
  name: string;
  email: string;
  password: string;
  department?: string | null;
  role?: Role;
};

type LoginInput = {
  email: string;
  password: string;
};

export function sanitizeUser(user: Pick<User, "id" | "name" | "email" | "role" | "department" | "createdAt">) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    createdAt: user.createdAt,
  };
}

function refreshTokenKey(tokenId: string) {
  return `refresh:${tokenId}`;
}

async function issueTokenBundle(user: User) {
  const tokenId = randomUUID();
  const baseUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department,
  };

  const accessToken = issueAccessToken(baseUser);
  const refreshToken = issueRefreshToken(baseUser, tokenId);

  await ensureRedisConnection();
  await redis.set(refreshTokenKey(tokenId), user.id, {
    EX: durationToSeconds(env.JWT_REFRESH_EXPIRES),
  });

  return {
    accessToken,
    refreshToken,
  };
}

export async function registerUser(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(409, "A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      passwordHash,
      department: input.department?.trim() || null,
      role: input.role ?? Role.EMPLOYEE,
    },
  });

  return {
    user: sanitizeUser(user),
    tokens: await issueTokenBundle(user),
  };
}

export async function loginUser(input: LoginInput) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError(401, "Invalid email or password");
  }

  const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);

  if (!isValidPassword) {
    throw new AppError(401, "Invalid email or password");
  }

  return {
    user: sanitizeUser(user),
    tokens: await issueTokenBundle(user),
  };
}

export async function refreshSession(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);

  await ensureRedisConnection();
  const storedUserId = await redis.get(refreshTokenKey(payload.jti));

  if (!storedUserId || storedUserId !== payload.sub) {
    throw new AppError(401, "Refresh token has been revoked");
  }

  await redis.del(refreshTokenKey(payload.jti));

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  return {
    user: sanitizeUser(user),
    tokens: await issueTokenBundle(user),
  };
}

export async function logoutUser(refreshToken: string) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await ensureRedisConnection();
    await redis.del(refreshTokenKey(payload.jti));
  } catch {
    return;
  }
}
