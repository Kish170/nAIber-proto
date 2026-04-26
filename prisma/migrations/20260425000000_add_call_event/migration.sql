-- CreateTable
CREATE TABLE "call_events" (
    "id" TEXT NOT NULL,
    "elderlyProfileId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_events_elderlyProfileId_detectedAt_idx" ON "call_events"("elderlyProfileId", "detectedAt");

-- CreateIndex
CREATE INDEX "call_events_conversationId_idx" ON "call_events"("conversationId");

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_elderlyProfileId_fkey" FOREIGN KEY ("elderlyProfileId") REFERENCES "elderly_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
