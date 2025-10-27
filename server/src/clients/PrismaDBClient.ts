import { PrismaClient } from '../../../generated/prisma/index.js';

export class PrismaDBClient {
  private static instance: PrismaDBClient;  
  private client: PrismaClient;            

  private constructor() {                  
    this.client = new PrismaClient();
  }

  static getInstance(): PrismaDBClient {
    if (!PrismaDBClient.instance) {
      PrismaDBClient.instance = new PrismaDBClient();
    }
    return PrismaDBClient.instance;
  }

  getClient(): PrismaClient {
    return this.client;
  }
}
