import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getSmokeTest(): { message: string } {
    return { message: 'Hello from the claude-labs backend' };
  }
}
