import {
  normalizeArticleUrl,
  TITLE_DUPLICATE_THRESHOLD,
  titleSimilarity,
} from "@/lib/articleDeduplication";
import { prisma } from "@/lib/prisma";
import type { IngestedArticle } from "@/types";

export interface DuplicateReportMatch {
  reportId: string;
  matchType:
    | "article_url"
    | "external_id"
    | "title_source_date"
    | "title_similarity";
}

export class IngestionRepository {
  async existsByTitleSourceAndDate(
    title: string,
    sourceName: string,
    reportDate: string
  ): Promise<boolean> {
    const date = new Date(reportDate);
    if (Number.isNaN(date.getTime())) {
      return this.existsByTitleAndSource(title, sourceName);
    }

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const count = await prisma.report.count({
      where: {
        title,
        reportDate: { gte: start, lte: end },
        source: { name: sourceName },
      },
    });

    return count > 0;
  }

  async existsByTitleAndSource(title: string, sourceName: string): Promise<boolean> {
    const count = await prisma.report.count({
      where: {
        title,
        source: { name: sourceName },
      },
    });
    return count > 0;
  }

  async existsBySourceUrl(url: string): Promise<boolean> {
    const normalized = normalizeArticleUrl(url);
    if (!normalized) return false;

    const count = await prisma.source.count({
      where: {
        OR: [{ url: normalized }, { url }],
      },
    });
    return count > 0;
  }

  async existsByArticleReference(
    article: IngestedArticle
  ): Promise<boolean> {
    if (article.url) {
      const normalized = normalizeArticleUrl(article.url);
      if (normalized) {
        const byUrl = await prisma.report.count({
          where: { articleUrl: normalized },
        });
        if (byUrl > 0) return true;
      }
    }

    if (article.externalId) {
      const byExternal = await prisma.report.count({
        where: { externalArticleId: article.externalId },
      });
      if (byExternal > 0) return true;
    }

    return false;
  }

  async findByTitleSourceAndDate(
    title: string,
    sourceName: string,
    reportDate: string
  ): Promise<{ id: string } | null> {
    const date = new Date(reportDate);
    if (Number.isNaN(date.getTime())) {
      const report = await prisma.report.findFirst({
        where: { title, source: { name: sourceName } },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      return report;
    }

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return prisma.report.findFirst({
      where: {
        title,
        reportDate: { gte: start, lte: end },
        source: { name: sourceName },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findByArticleReference(
    article: IngestedArticle
  ): Promise<{ id: string } | null> {
    if (article.url) {
      const normalized = normalizeArticleUrl(article.url);
      if (normalized) {
        const byUrl = await prisma.report.findFirst({
          where: { articleUrl: normalized },
          select: { id: true },
          orderBy: { createdAt: "desc" },
        });
        if (byUrl) return byUrl;
      }
    }

    if (article.externalId) {
      const byExternal = await prisma.report.findFirst({
        where: { externalArticleId: article.externalId },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      if (byExternal) return byExternal;
    }

    return null;
  }

  async findDuplicateReport(
    article: IngestedArticle
  ): Promise<DuplicateReportMatch | null> {
    const byReference = await this.findByArticleReference(article);
    if (byReference) {
      return {
        reportId: byReference.id,
        matchType: article.url ? "article_url" : "external_id",
      };
    }

    const exact = await this.findByTitleSourceAndDate(
      article.title,
      article.source.name,
      article.reportDate
    );
    if (exact) {
      return { reportId: exact.id, matchType: "title_source_date" };
    }

    const date = new Date(article.reportDate);
    if (Number.isNaN(date.getTime())) return null;

    const start = new Date(date);
    start.setDate(start.getDate() - 7);

    const recent = await prisma.report.findMany({
      where: { reportDate: { gte: start } },
      select: { id: true, title: true },
      take: 300,
      orderBy: { reportDate: "desc" },
    });

    for (const report of recent) {
      if (titleSimilarity(report.title, article.title) >= TITLE_DUPLICATE_THRESHOLD) {
        return { reportId: report.id, matchType: "title_similarity" };
      }
    }

    return null;
  }

  async isDuplicateArticle(article: IngestedArticle): Promise<boolean> {
    const match = await this.findDuplicateReport(article);
    return match != null;
  }
}

export const ingestionRepository = new IngestionRepository();
