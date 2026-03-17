/*
  Warnings:

  - The primary key for the `_users_permissions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[A,B]` on the table `_users_permissions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL');

-- CreateEnum
CREATE TYPE "CompanySize" AS ENUM ('MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE');

-- CreateEnum
CREATE TYPE "PfType" AS ENUM ('FISICA', 'JURIDICA');

-- AlterTable
ALTER TABLE "_users_permissions" DROP CONSTRAINT "_users_permissions_AB_pkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pfType" "PfType" NOT NULL DEFAULT 'FISICA';

-- CreateTable
CREATE TABLE "pessoa_fisica" (
    "id" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "rg" TEXT,
    "birthDate" DATE,
    "maritalStatus" "MaritalStatus",
    "motherName" TEXT,
    "monthlyIncome" DECIMAL(10,2),
    "occupation" TEXT,
    "address" TEXT,
    "neighborhood" TEXT,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "zipCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "pessoa_fisica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa_juridica" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "companyName" TEXT,
    "tradeName" TEXT,
    "industry" TEXT,
    "companySize" "CompanySize",
    "annualRevenue" DECIMAL(15,2),
    "foundedDate" DATE,
    "machineryCount" INTEGER,
    "employeeCount" INTEGER,
    "address" TEXT,
    "neighborhood" TEXT,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "zipCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "pessoa_juridica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_fisica_cpf_key" ON "pessoa_fisica"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_fisica_userId_key" ON "pessoa_fisica"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_juridica_cnpj_key" ON "pessoa_juridica"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_juridica_userId_key" ON "pessoa_juridica"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "_users_permissions_AB_unique" ON "_users_permissions"("A", "B");

-- AddForeignKey
ALTER TABLE "pessoa_fisica" ADD CONSTRAINT "pessoa_fisica_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa_juridica" ADD CONSTRAINT "pessoa_juridica_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
