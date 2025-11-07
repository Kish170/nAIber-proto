-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "Relationship" AS ENUM ('SPOUSE', 'DAUGHTER', 'SON', 'SIBLING', 'FRIEND', 'CAREGIVER', 'OTHER');

-- CreateEnum
CREATE TYPE "CheckInFrequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('PENDING', 'QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'USER_ENDED_EARLY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MISSED_CALLS', 'SYSTEM_FAILURE', 'HEALTH_CONCERN', 'WEEKLY_SUMMARY', 'MEDICATION_REMINDER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "phone" TEXT NOT NULL,
    "gender" "Gender",
    "interests" TEXT[],
    "dislikes" TEXT[],
    "callFrequency" "CheckInFrequency" NOT NULL DEFAULT 'DAILY',
    "preferredCallTime" TIME NOT NULL,
    "isFirstCall" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCallAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "relationship" TEXT NOT NULL,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnMissedCalls" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_health_conditions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "severity" TEXT,
    "diagnosedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_health_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_medications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "status" "CallStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" "CallOutcome",
    "noAnswerCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryTime" TIMESTAMP(3),
    "twilioCallSid" TEXT,
    "elevenlabsConversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_summaries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "topicsDiscussed" TEXT[],
    "keyHighlights" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_topics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "variations" TEXT[],
    "category" TEXT,
    "topicEmbedding" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_topic_references" (
    "id" TEXT NOT NULL,
    "conversationSummaryId" TEXT NOT NULL,
    "conversationTopicId" TEXT NOT NULL,
    "mentionedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_topic_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_mentions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "mentionText" TEXT NOT NULL,
    "mentionType" TEXT NOT NULL,
    "severity" TEXT,
    "bodyPart" TEXT,
    "surfacedToDashboard" BOOLEAN NOT NULL DEFAULT false,
    "stakeholderNotified" BOOLEAN NOT NULL DEFAULT false,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "health_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_contacts_userId_key" ON "emergency_contacts"("userId");

-- CreateIndex
CREATE INDEX "emergency_contacts_userId_idx" ON "emergency_contacts"("userId");

-- CreateIndex
CREATE INDEX "user_health_conditions_userId_isActive_idx" ON "user_health_conditions"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "user_health_conditions_userId_condition_key" ON "user_health_conditions"("userId", "condition");

-- CreateIndex
CREATE INDEX "user_medications_userId_isActive_idx" ON "user_medications"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "user_medications_userId_name_key" ON "user_medications"("userId", "name");

-- CreateIndex
CREATE INDEX "call_logs_userId_scheduledTime_idx" ON "call_logs"("userId", "scheduledTime");

-- CreateIndex
CREATE INDEX "call_logs_status_idx" ON "call_logs"("status");

-- CreateIndex
CREATE INDEX "call_logs_scheduledTime_idx" ON "call_logs"("scheduledTime");

-- CreateIndex
CREATE INDEX "call_logs_userId_createdAt_idx" ON "call_logs"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_summaries_conversationId_key" ON "conversation_summaries"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_summaries_userId_createdAt_idx" ON "conversation_summaries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_topics_userId_updatedAt_idx" ON "conversation_topics"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "conversation_topics_updatedAt_idx" ON "conversation_topics"("updatedAt");

-- CreateIndex
CREATE INDEX "conversation_topics_userId_topicEmbedding_idx" ON "conversation_topics"("userId", "topicEmbedding");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_topics_userId_topicName_key" ON "conversation_topics"("userId", "topicName");

-- CreateIndex
CREATE INDEX "conversation_topic_references_conversationTopicId_idx" ON "conversation_topic_references"("conversationTopicId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_topic_references_conversationSummaryId_convers_key" ON "conversation_topic_references"("conversationSummaryId", "conversationTopicId");

-- CreateIndex
CREATE INDEX "health_mentions_userId_detectedAt_idx" ON "health_mentions"("userId", "detectedAt");

-- CreateIndex
CREATE INDEX "health_mentions_surfacedToDashboard_idx" ON "health_mentions"("surfacedToDashboard");

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_health_conditions" ADD CONSTRAINT "user_health_conditions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_medications" ADD CONSTRAINT "user_medications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "call_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_topics" ADD CONSTRAINT "conversation_topics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_topic_references" ADD CONSTRAINT "conversation_topic_references_conversationSummaryId_fkey" FOREIGN KEY ("conversationSummaryId") REFERENCES "conversation_summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_topic_references" ADD CONSTRAINT "conversation_topic_references_conversationTopicId_fkey" FOREIGN KEY ("conversationTopicId") REFERENCES "conversation_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_mentions" ADD CONSTRAINT "health_mentions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_mentions" ADD CONSTRAINT "health_mentions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "call_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
