import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class UsersService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async findById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId }
    });
  }
}
