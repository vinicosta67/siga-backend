-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "creditType" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "financedValue" DECIMAL(15,2),
ADD COLUMN     "gracePeriod" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "machinery" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "revenue" TEXT,
ADD COLUMN     "sector" TEXT,
ADD COLUMN     "size" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "zip" TEXT;

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AGENDADA',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "zip" TEXT,
    "street" TEXT,
    "number" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "complement" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "opportunities" TEXT[],

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
