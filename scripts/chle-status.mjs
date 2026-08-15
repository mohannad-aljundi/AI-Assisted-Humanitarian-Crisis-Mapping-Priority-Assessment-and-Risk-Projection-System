import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const reports = await prisma.report.count({ where: { duplicateOfReportId: null } });
const learningCases = await prisma.learningCase.count();
const learningExamples = await prisma.learningExample.count();
const patterns = await prisma.reasoningPattern.count();
const memory = await prisma.inferenceMemory.count();

console.log(
  JSON.stringify({ reports, learningCases, learningExamples, patterns, memory }, null, 2)
);

await prisma.$disconnect();
