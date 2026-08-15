import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const debugSql = process.env.DEBUG_SQL === "true";
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? debugSql
          ? ["query", "error", "warn"]
          : ["error", "warn"]
        : ["error"],
  });
}

function isClientCurrent(client: PrismaClient): boolean {
  return typeof (client as PrismaClient & { ingestionSyncState?: unknown })
    .ingestionSyncState !== "undefined";
}

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;

  if (cached && isClientCurrent(cached)) {
    return cached;
  }

  if (cached) {
    void cached.$disconnect().catch(() => undefined);
  }

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = getPrismaClient();
