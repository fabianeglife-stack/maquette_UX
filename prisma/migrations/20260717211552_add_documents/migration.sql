-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderRef" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "no" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_orderRef_fkey" FOREIGN KEY ("orderRef") REFERENCES "Order" ("ref") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Document_orderRef_idx" ON "Document"("orderRef");

-- CreateIndex
CREATE UNIQUE INDEX "Document_orderRef_slug_key" ON "Document"("orderRef", "slug");
